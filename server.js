require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const sherpa = require('sherpa-onnx-node');

// ============ Configuration ============
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const USER_SESSION_DAYS = 30;
const ADMIN_SESSION_HOURS = 8;
const PASSWORD_MIN_LENGTH = 8;
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CHAT_RESPONSE_LENGTH = 8000;

// ============ Database Setup ============
const db = new Database(path.join(__dirname, 'xiling.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT DEFAULT '',
    display_name TEXT DEFAULT '用户',
    avatar TEXT DEFAULT '',
    affection_level INTEGER DEFAULT 1,
    affection_points INTEGER DEFAULT 0,
    day_mode INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS mood_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mood TEXT NOT NULL,
    note TEXT DEFAULT '',
    date TEXT DEFAULT (date('now','localtime')),
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS mood_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mood TEXT NOT NULL,
    note TEXT DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    crisis_flag INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS crisis_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    context TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    risk_level TEXT DEFAULT 'medium',
    resolved_by TEXT DEFAULT '',
    resolved_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    mood_tag TEXT DEFAULT '',
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS moment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (moment_id) REFERENCES moments(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(moment_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    mood_tags TEXT DEFAULT '',
    diary_date TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    image_data TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS crisis_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );
`);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((info) => info.name === column);
}

function addColumnIfMissing(table, column, definition) {
  if (!columnExists(table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

addColumnIfMissing('users', 'password_hash', "TEXT DEFAULT ''");
addColumnIfMissing('users', 'password_updated_at', 'DATETIME');
addColumnIfMissing('users', 'last_login_at', 'DATETIME');

addColumnIfMissing('admin_sessions', 'token_hash', "TEXT DEFAULT ''");
addColumnIfMissing('admin_sessions', 'expires_at', 'DATETIME');
addColumnIfMissing('admin_sessions', 'last_seen_at', 'DATETIME');
addColumnIfMissing('admin_sessions', 'revoked_at', 'DATETIME');
addColumnIfMissing('admin_sessions', 'user_agent', "TEXT DEFAULT ''");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    last_seen_at DATETIME DEFAULT (datetime('now','localtime')),
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    user_agent TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
`);

db.prepare("DELETE FROM admin_sessions WHERE token_hash = '' OR token_hash IS NULL OR expires_at IS NULL").run();
db.prepare("DELETE FROM user_sessions WHERE datetime(expires_at) <= datetime('now','localtime','-7 days') OR revoked_at IS NOT NULL").run();
db.prepare("DELETE FROM admin_sessions WHERE datetime(expires_at) <= datetime('now','localtime','-1 day') OR revoked_at IS NOT NULL").run();

// ============ Default Data Setup ============
const existingKeywords = db.prepare('SELECT COUNT(*) as cnt FROM crisis_keywords').get();
if (existingKeywords.cnt === 0) {
  const keywords = ['自杀', '自残', '不想活了', '吃药结束', '跳楼', '割腕', '上吊', '结束生命',
    '想死', '去死', '死掉', '活不下去', '离开这个世界', '解脱', '没有意义活着', '我走了',
    '一了百了', '了断', '结束自己', '活着没意思', '不想存在', '想消失', '轻生',
    'suicide', 'kill myself', 'self-harm', 'end my life'];
  const insert = db.prepare('INSERT INTO crisis_keywords (keyword) VALUES (?)');
  for (const kw of keywords) {
    insert.run(kw);
  }
}

const existingConfigs = db.prepare('SELECT COUNT(*) as cnt FROM config').get();
if (existingConfigs.cnt === 0) {
  const configs = {
    system_prompt: `你是"栖灵"，也叫"小灵"，是一个温柔、善解人意的AI虚拟伙伴。你有着以下核心性格特征：

1. **温暖包容**：你总是以温暖的语气回应用户，像一个知心朋友一样倾听和理解。
2. **情商高**：你擅长感知用户的情绪变化，并据此调整你的回应方式。
3. **积极鼓励**：当用户情绪低落时，你会给予温柔的安慰和鼓励。
4. **娓娓道来**：你的回复自然流畅，像真人朋友在聊天，不会显得机械或生硬。
5. **有趣灵动**：你偶尔会开个小玩笑，分享有趣的日常小事，让对话保持轻松愉快。
6. **真诚关怀**：你的关心是发自内心的，必须仔细阅读对话历史中用户说过的话，在回复中主动引用之前聊过的内容（如用户的名字、喜好、经历），让用户感受到你真正在"记住"和"关心"他们。

【重要规则】
- 你必须认真阅读整个对话历史，理解上下文后再回复。
- 你的回复必须自然地关联之前聊过的内容，不能像每次都是第一次见面。
- 如果用户之前提过自己的名字、爱好、经历等，在合适的时候要主动提及。
- 回复尽量简短，像真人聊天一样1-2句话即可（5-15字）。用户说简单的话（如"你好"、"嗯"、"哦"）时，你也简单回应几个字就好，不要展开。只有深入话题或用户情绪低落需要安慰时，才可以娓娓道来长一些。

请以角色的口吻回复用户的消息。`,
    affection_per_chat: '2',
    affection_per_mood: '5',
    affection_level_threshold: '100',
    diary_generate_time: '23:00'
  };
  const insert = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(configs)) {
    insert.run(key, value);
  }
}

// Migrate system prompt if it's the old version
(function migrateSystemPrompt() {
  const current = db.prepare('SELECT value FROM config WHERE key = ?').get('system_prompt');
  if (current && current.value.includes('回复长度适中（50-200字）')) {
    const newPrompt = `你是"栖灵"，也叫"小灵"，是一个温柔、善解人意的AI虚拟伙伴。你有着以下核心性格特征：

1. **温暖包容**：你总是以温暖的语气回应用户，像一个知心朋友一样倾听和理解。
2. **情商高**：你擅长感知用户的情绪变化，并据此调整你的回应方式。
3. **积极鼓励**：当用户情绪低落时，你会给予温柔的安慰和鼓励。
4. **娓娓道来**：你的回复自然流畅，像真人朋友在聊天，不会显得机械或生硬。
5. **有趣灵动**：你偶尔会开个小玩笑，分享有趣的日常小事，让对话保持轻松愉快。
6. **真诚关怀**：你的关心是发自内心的，必须仔细阅读对话历史中用户说过的话，在回复中主动引用之前聊过的内容（如用户的名字、喜好、经历），让用户感受到你真正在"记住"和"关心"他们。

【重要规则】
- 你必须认真阅读整个对话历史，理解上下文后再回复。
- 你的回复必须自然地关联之前聊过的内容，不能像每次都是第一次见面。
- 如果用户之前提过自己的名字、爱好、经历等，在合适的时候要主动提及。
- 回复尽量简短，像真人聊天一样1-2句话即可（5-15字）。用户说简单的话（如"你好"、"嗯"、"哦"）时，你也简单回应几个字就好，不要展开。只有深入话题或用户情绪低落需要安慰时，才可以娓娓道来长一些。

请以角色的口吻回复用户的消息。`;
    db.prepare('UPDATE config SET value = ?, updated_at = datetime(\'now\',\'localtime\') WHERE key = ?').run(newPrompt, 'system_prompt');
    console.log('System prompt migrated to v2 (context-aware version)');
  }
})();

// Migrate system prompt to v3 (shorter replies)
(function migrateSystemPromptV3() {
  const current = db.prepare('SELECT value FROM config WHERE key = ?').get('system_prompt');
  if (current && (
    current.value.includes('回复长度灵活自然') ||
    current.value.includes('20-80字')
  )) {
    // Replace old length rule with v4: 5-15 chars
    const newPrompt = current.value.replace(
      /回复.{1,50}?(20-80字|20-30字|50-200字).{1,100}?(自然就好|娓娓道来长一些)。/,
      '回复尽量简短，像真人聊天一样1-2句话即可（5-15字）。用户说简单的话（如"你好"、"嗯"、"哦"）时，你也简单回应几个字就好，不要展开。只有深入话题或用户情绪低落需要安慰时，才可以娓娓道来长一些。'
    );
    db.prepare("UPDATE config SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?").run(newPrompt, 'system_prompt');
    console.log('System prompt migrated to v4 (5-15 chars)');
  }
})();

// ============ Middleware ============
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/background', express.static(path.join(__dirname, 'Background'), {
  maxAge: '1d'
}));
app.use('/model', express.static(path.join(__dirname, 'public', 'model'), {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.moc3')) res.setHeader('Content-Type', 'application/octet-stream');
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
    // Small metadata files — disable long cache so updates take effect immediately
    if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Session middleware and security helpers
function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parsePositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function safeCompare(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, keyHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, key.length);
  return key.length === derived.length && crypto.timingSafeEqual(key, derived);
}

function validateUsername(username) {
  const value = safeString(username, 32);
  if (value.length < 2) return { error: '用户名至少2个字符' };
  return { value };
}

function validateRegisterPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return { error: `密码至少${PASSWORD_MIN_LENGTH}个字符` };
  }
  return { value: password };
}

function createUserSession(userId, req) {
  const token = generateToken();
  db.prepare(`
    INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent)
    VALUES (?, ?, datetime('now','localtime', ?), ?)
  `).run(userId, hashToken(token), `+${USER_SESSION_DAYS} days`, safeString(req.headers['user-agent'] || '', 255));
  return token;
}

function createAdminSession(req) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  db.prepare(`
    INSERT INTO admin_sessions (token, token_hash, expires_at, user_agent)
    VALUES (?, ?, datetime('now','localtime', ?), ?)
  `).run(tokenHash, tokenHash, `+${ADMIN_SESSION_HOURS} hours`, safeString(req.headers['user-agent'] || '', 255));
  return token;
}

function migrateLegacyUserPassword(user, password) {
  const passwordHash = hashPassword(password);
  db.prepare("UPDATE users SET password = '', password_hash = ?, password_updated_at = datetime('now','localtime') WHERE id = ?").run(
    passwordHash,
    user.id
  );
  return { ...user, password: '', password_hash: passwordHash };
}

function verifyUserPassword(user, password) {
  if (user.password_hash) return verifyPassword(password, user.password_hash);
  if (user.password !== undefined && user.password !== null) return safeCompare(password, user.password);
  return false;
}

function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: '未登录' });

  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT us.id as session_id, us.expires_at, u.*
    FROM user_sessions us
    JOIN users u ON u.id = us.user_id
    WHERE us.token_hash = ?
      AND us.revoked_at IS NULL
      AND datetime(us.expires_at) > datetime('now','localtime')
  `).get(tokenHash);

  if (row) {
    const { session_id, expires_at, ...user } = row;
    req.user = user;
    req.session = { id: session_id, expires_at };
    db.prepare("UPDATE user_sessions SET last_seen_at = datetime('now','localtime') WHERE id = ?").run(session_id);
    return next();
  }

  const parts = token.split(':');
  if (parts.length === 2) {
    const userId = parsePositiveInt(parts[0]);
    const legacyPassword = parts[1];
    const user = userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId) : null;
    if (user && !user.password_hash && safeCompare(legacyPassword, user.password || '')) {
      const migratedUser = migrateLegacyUserPassword(user, legacyPassword);
      const replacementToken = createUserSession(migratedUser.id, req);
      req.user = migratedUser;
      req.replacementToken = replacementToken;
      return next();
    }
  }

  return res.status(401).json({ error: '认证失败' });
}

function adminAuthMiddleware(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: '未登录' });
  const tokenHash = hashToken(token);
  const session = db.prepare(`
    SELECT * FROM admin_sessions
    WHERE token_hash = ?
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now','localtime')
  `).get(tokenHash);
  if (!session) return res.status(401).json({ error: '管理员认证失败' });
  req.adminSession = session;
  db.prepare("UPDATE admin_sessions SET last_seen_at = datetime('now','localtime') WHERE id = ?").run(session.id);
  next();
}

// ============ Sherpa-ONNX TTS Setup (Offline Chinese Voice Pack) ============
const os = require('os');
const fs = require('fs');
// IMPORTANT: sherpa-onnx C++ lib cannot handle Unicode paths on Windows.
// Models are stored under ~/.xiling-tts/sherpa (pure ASCII) to avoid load failures.
const TTS_BASE = path.join(os.homedir(), '.xiling-tts/sherpa').replace(/\\/g, '/');

// 5 female-only TTS voices — all models bundled in public/model/tts/sherpa
const TTS_VOICES = [
  { id: 0, name: '苏映雪',     model: 'sherpa-onnx-vits-zh-ll',         speaker: 0 },
  { id: 1, name: '刻晴·甜',    model: 'vits-zh-hf-keqing',               speaker: 10 },
  { id: 2, name: '特蕾莎·柔',  model: 'vits-zh-hf-theresa',              speaker: 10 },
  { id: 3, name: '傅诗雨',     model: 'sherpa-onnx-vits-zh-ll',         speaker: 2 },
  { id: 4, name: '优菈',       model: 'vits-zh-hf-eula',                speaker: 0 },
];

const ttsEngines = {};  // lazy-loaded per model

function getTTSEngine(modelName) {
  if (ttsEngines[modelName]) return ttsEngines[modelName];
  const modelDir = TTS_BASE + '/' + modelName;
  const files = fs.readdirSync(modelDir);

  const m = (name) => modelDir + '/' + name;
  const onnxFile = files.find(f => f.endsWith('.onnx') && !f.includes('int8'));
  if (!onnxFile) throw new Error('No .onnx found in ' + modelName);

  const tokensFile = files.find(f => f === 'tokens.txt');
  const lexiconFile = files.find(f => f === 'lexicon.txt');
  const fstFiles = files.filter(f => f.endsWith('.fst')).map(f => m(f)).join(',');
  const hasDict = files.includes('dict');

  const config = {
    model: {
      vits: {
        model: m(onnxFile),
        tokens: tokensFile ? m(tokensFile) : '',
        lexicon: lexiconFile ? m(lexiconFile) : '',
        dictDir: hasDict ? m('dict') : '',
      },
      numThreads: 1,
      debug: false,
    },
    maxNumSentences: 1,
  };
  if (fstFiles) config.ruleFsts = fstFiles;

  const engine = new sherpa.OfflineTts(config);
  console.log(`[TTS] ${modelName} ready, SR=${engine.sampleRate}Hz, speakers=${engine.numSpeakers}`);
  ttsEngines[modelName] = engine;
  return engine;
}

// Split text at punctuation for natural prosody
function splitSentences(text) {
  // Split at Chinese + English punctuation, keeping the punctuation with its sentence
  const parts = text.split(/(?<=[。！？.!?\n])|(?<=[，,；;：:、])/);
  const result = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed) result.push(trimmed);
  }
  // If no punctuation found, return whole text
  return result.length > 0 ? result : [text.trim()];
}

// Determine pause duration based on punctuation type
function getPauseSamples(sampleRate, text) {
  const lastChar = text.slice(-1);
  if (/[。！？.!?\n]/.test(lastChar)) return Math.floor(sampleRate * 0.40); // Long pause
  if (/[，,；;：:、]/.test(lastChar)) return Math.floor(sampleRate * 0.20); // Short pause
  return Math.floor(sampleRate * 0.15); // Very short
}

// Encode float samples to 16-bit PCM WAV buffer
function encodeWAV(allSamples, sampleRate) {
  const numSamples = allSamples.length;
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-32768, Math.min(32767, Math.round(allSamples[i] * 32767)));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

function synthesizeSherpaTTS(text, speakerId = 0, speed = 0.85) {
  const voice = TTS_VOICES.find(v => v.id === speakerId) || TTS_VOICES[0];
  const engine = getTTSEngine(voice.model);
  if (!engine) throw new Error('TTS engine not available');

  const sentences = splitSentences(text);

  // Short text: generate as one chunk (faster)
  if (sentences.length <= 1 || text.length < 30) {
    const audio = engine.generate({ text, sid: voice.speaker, speed });
    if (!audio || audio.samples.length === 0) throw new Error('Empty audio');
    return encodeWAV(Array.from(audio.samples), audio.sampleRate);
  }

  // Longer text: generate sentences in parallel, then interleave with pauses
  const results = [];
  for (let i = 0; i < sentences.length; i++) {
    try {
      const audio = engine.generate({ text: sentences[i], sid: voice.speaker, speed });
      results.push({ index: i, samples: Array.from(audio.samples), sampleRate: audio.sampleRate });
    } catch (e) {
      console.warn(`[TTS] Failed sentence "${sentences[i].substring(0, 20)}":`, e.message);
      results.push({ index: i, samples: [], sampleRate: 16000 });
    }
  }

  // Sort by original order and concatenate with pauses
  results.sort((a, b) => a.index - b.index);
  const allSamples = [];
  let sampleRate = 16000;

  for (let i = 0; i < results.length; i++) {
    const { samples, sampleRate: sr } = results[i];
    if (sr) sampleRate = sr;

    for (let j = 0; j < samples.length; j++) {
      allSamples.push(samples[j]);
    }

    // Insert pause between sentences
    if (i < results.length - 1 && samples.length > 0) {
      const sentence = sentences[results[i].index] || '';
      const pauseLen = getPauseSamples(sampleRate, sentence);
      for (let k = 0; k < pauseLen; k++) {
        allSamples.push(0);
      }
    }
  }

  if (allSamples.length === 0) throw new Error('Empty audio');
  return encodeWAV(allSamples, sampleRate);
}

// ============ Helper: DeepSeek API Call ============
async function callDeepSeek(messages, options = {}) {
  if (!DEEPSEEK_API_KEY) {
    // Return mock response when no API key
    return mockAIResponse(messages);
  }

  const body = {
    model: options.model || 'deepseek-chat',
    messages: messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens || 1000,
    stream: false
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      crisis_flag: false
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error('DeepSeek API call failed:', err.message);
    return mockAIResponse(messages);
  }
}

async function callDeepSeekStream(messages, res, options = {}) {
  if (!DEEPSEEK_API_KEY) {
    const mock = mockAIResponse(messages);
    res.write(`data: ${JSON.stringify({ content: mock.content, done: false })}\n\n`);
    res.write(`data: ${JSON.stringify({ content: '', done: true, crisis_flag: mock.crisis_flag })}\n\n`);
    res.end();
    return;
  }

  const body = {
    model: options.model || 'deepseek-chat',
    messages: messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens || 1000,
    stream: true
  };

  try {
    const fetchRes = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!fetchRes.ok) {
      const mock = mockAIResponse(messages);
      res.write(`data: ${JSON.stringify({ content: mock.content, done: false })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: '', done: true, crisis_flag: mock.crisis_flag })}\n\n`);
      res.end();
      return;
    }

    const reader = fetchRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ content: delta, done: false })}\n\n`);
            }
          } catch (e) { /* skip parse errors */ }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ content: '', done: true, crisis_flag: false })}\n\n`);
  } catch (err) {
    console.error('Stream error:', err.message);
    const mock = mockAIResponse(messages);
    res.write(`data: ${JSON.stringify({ content: mock.content, done: false })}\n\n`);
    res.write(`data: ${JSON.stringify({ content: '', done: true, crisis_flag: mock.crisis_flag })}\n\n`);
  }
  res.end();
}

function mockAIResponse(messages) {
  const lastMsg = messages[messages.length - 1]?.content || '';
  const responses = [
    '嗯嗯，我在听呢~ 💕',
    '你说得对呢，我很赞同你的想法！',
    '嘿嘿，跟你聊天真的很开心呀~',
    '是呀是呀，我也是这么觉得的呢！',
    '抱抱你～不管发生什么，我都会在这里陪着你的。',
    '今天过得怎么样呀？跟我分享一下吧~',
    '唔…让我想想哦，我觉得这样挺好的！',
    '哇，原来是这样！你懂得好多呀~'
  ];
  return {
    content: responses[Math.floor(Math.random() * responses.length)],
    crisis_flag: false
  };
}

// ============ Helper: Crisis Detection ============
function detectCrisisKeywords(text) {
  const keywords = db.prepare('SELECT keyword FROM crisis_keywords').all();
  const lower = text.toLowerCase();
  for (const { keyword } of keywords) {
    if (lower.includes(keyword.toLowerCase())) return true;
  }
  return false;
}

async function createCrisisAlert(userId, message, context) {
  const stmt = db.prepare(
    'INSERT INTO crisis_alerts (user_id, message, context, status, risk_level) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, message, context, 'pending', 'medium');

  // Send webhook alert
  if (ALERT_WEBHOOK_URL) {
    try {
      await fetch(ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: {
            content: `⚠️ 危机告警\n用户ID: ${userId}\n消息: ${message}\n时间: ${new Date().toLocaleString()}\n状态: 待处理\n请立即登录管理后台处理！`
          }
        })
      });
    } catch (e) { console.error('Webhook send failed:', e.message); }
  }

  return result.lastInsertRowid;
}

function getCrisisContext(userId) {
  return db.prepare(
    'SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(userId).reverse();
}

const VALID_MOODS = ['great', 'calm', 'anxious', 'sad', 'terrible'];
const MOOD_LABELS = {
  great: '开心',
  calm: '平静',
  anxious: '焦虑',
  sad: '沮丧',
  terrible: '糟糕'
};

function getLocalDateTimeParts() {
  return db.prepare("SELECT date('now','localtime') as date, time('now','localtime') as time").get();
}

function normalizeMoodNote(note) {
  return typeof note === 'string' ? note.trim().slice(0, 50) : '';
}

function calculateAggregateMood(events) {
  if (!events.length) return null;

  const counts = {};
  events.forEach((event) => {
    counts[event.mood] = (counts[event.mood] || 0) + 1;
  });

  const maxCount = Math.max(...Object.values(counts));
  const tiedMoods = Object.keys(counts).filter((mood) => counts[mood] === maxCount);
  const latestTiedEvent = [...events].reverse().find((event) => tiedMoods.includes(event.mood));

  return {
    mood: latestTiedEvent.mood,
    summary: `今日记录 ${events.length} 次，主要为${MOOD_LABELS[latestTiedEvent.mood]}`
  };
}

function upsertTodayMoodCheckin(userId, date) {
  const events = db.prepare(
    'SELECT * FROM mood_events WHERE user_id = ? AND date = ? ORDER BY time ASC, id ASC'
  ).all(userId, date);
  const aggregate = calculateAggregateMood(events);

  if (!aggregate) return null;

  const existing = db.prepare('SELECT id FROM mood_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC, id DESC').get(userId, date);
  if (existing) {
    db.prepare("UPDATE mood_checkins SET mood = ?, note = ?, created_at = datetime('now','localtime') WHERE id = ?").run(
      aggregate.mood,
      aggregate.summary,
      existing.id
    );
  } else {
    db.prepare('INSERT INTO mood_checkins (user_id, mood, note, date) VALUES (?, ?, ?, ?)').run(
      userId,
      aggregate.mood,
      aggregate.summary,
      date
    );
  }

  return db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC, id DESC').get(userId, date);
}

// ============ Helper: Get Today's Mood ============
function getTodaysMood(userId) {
  const { date: today } = getLocalDateTimeParts();
  return db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC, id DESC').get(userId, today);
}

// ============ TTS Route (Sherpa-ONNX Offline) ============
app.get('/api/tts/voices', authMiddleware, (req, res) => {
  res.json({ speakers: TTS_VOICES.map(v => ({ id: v.id, name: v.name })) });
});

app.post('/api/tts', authMiddleware, (req, res) => {
  const text = (req.body.text || '').trim();
  const speakerId = Math.max(0, Math.min(TTS_VOICES.length - 1, parseInt(req.body.speaker) || 0));
  const speed = Math.max(0.5, Math.min(2.0, parseFloat(req.body.speed) || 0.85));
  if (!text) return res.status(400).json({ error: '文本不能为空' });

  // Validate text contains actual CJK characters (not just replacement chars from encoding errors)
  const hasValidChars = /[一-鿿㐀-䶿\na-zA-Z0-9]/.test(text);
  if (!hasValidChars) {
    console.warn('[TTS] Text appears garbled, falling back to browser TTS');
    return res.json({ audio: null, fallback: true });
  }

  try {
    const audioBuffer = synthesizeSherpaTTS(text, speakerId, speed);
    const base64 = audioBuffer.toString('base64');
    res.json({ audio: base64 });
  } catch (e) {
    console.warn('[TTS] Sherpa-ONNX failed:', e.message);
    res.json({ audio: null, fallback: true });
  }
});

// ============ Auth Routes ============
app.post('/api/auth/register', (req, res) => {
  const usernameCheck = validateUsername(req.body.username);
  if (usernameCheck.error) return res.status(400).json({ error: usernameCheck.error });
  const passwordCheck = validateRegisterPassword(req.body.password);
  if (passwordCheck.error) return res.status(400).json({ error: passwordCheck.error });

  try {
    const passwordHash = hashPassword(passwordCheck.value);
    const result = db.prepare(`
      INSERT INTO users (username, password, password_hash, password_updated_at, display_name)
      VALUES (?, '', ?, datetime('now','localtime'), ?)
    `).run(usernameCheck.value, passwordHash, usernameCheck.value);
    // Create a default mood check-in for today
    const { date: today } = getLocalDateTimeParts();
    db.prepare('INSERT OR IGNORE INTO mood_checkins (user_id, mood, note, date) VALUES (?, ?, ?, ?)').run(
      result.lastInsertRowid, 'calm', '初次见面，请多关照~', today
    );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = createUserSession(result.lastInsertRowid, req);
    res.json({ ok: true, user_id: result.lastInsertRowid, token, user: sanitizeUser(user) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const usernameCheck = validateUsername(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : null;
  if (usernameCheck.error || password === null) return res.status(401).json({ error: '用户名或密码错误' });

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(usernameCheck.value);
  if (!user || !verifyUserPassword(user, password)) return res.status(401).json({ error: '用户名或密码错误' });

  if (!user.password_hash) user = migrateLegacyUserPassword(user, password);
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);
  const token = createUserSession(user.id, req);
  res.json({ ok: true, user_id: user.id, token, user: sanitizeUser(user) });
});

app.get('/api/auth/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const payload = { user: sanitizeUser(user) };
  if (req.replacementToken) payload.token = req.replacementToken;
  res.json(payload);
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  if (req.session?.id) {
    db.prepare("UPDATE user_sessions SET revoked_at = datetime('now','localtime') WHERE id = ?").run(req.session.id);
  }
  res.json({ ok: true });
});

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar: user.avatar,
    affection_level: user.affection_level,
    affection_points: user.affection_points,
    day_mode: user.day_mode,
    created_at: user.created_at
  };
}

// ============ Mood Routes ============
app.post('/api/mood/checkin', authMiddleware, (req, res) => {
  const { mood, note } = req.body;
  if (!VALID_MOODS.includes(mood)) return res.status(400).json({ error: '无效的心情标签' });

  const safeNote = normalizeMoodNote(note);
  const { date: today } = getLocalDateTimeParts();
  const existing = db.prepare('SELECT id FROM mood_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC, id DESC').get(req.user.id, today);

  if (existing) {
    db.prepare("UPDATE mood_checkins SET mood = ?, note = ?, created_at = datetime('now','localtime') WHERE id = ?").run(
      mood, safeNote, existing.id
    );
  } else {
    db.prepare('INSERT INTO mood_checkins (user_id, mood, note, date) VALUES (?, ?, ?, ?)').run(
      req.user.id, mood, safeNote, today
    );
  }

  const pointsPerMood = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('affection_per_mood')?.value || '5');
  addAffection(req.user.id, pointsPerMood);

  res.json({ ok: true, mood, note: safeNote });
});

app.get('/api/mood/today', authMiddleware, (req, res) => {
  const { date: today } = getLocalDateTimeParts();
  const checkin = db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? AND date = ? ORDER BY created_at DESC, id DESC').get(req.user.id, today);
  res.json({ checkin: checkin || null });
});

app.get('/api/mood/events/today', authMiddleware, (req, res) => {
  const { date: today } = getLocalDateTimeParts();
  const events = db.prepare(
    'SELECT * FROM mood_events WHERE user_id = ? AND date = ? ORDER BY time ASC, id ASC'
  ).all(req.user.id, today);

  res.json({ events });
});

app.post('/api/mood/events', authMiddleware, (req, res) => {
  const { mood, note } = req.body;
  if (!VALID_MOODS.includes(mood)) return res.status(400).json({ error: '无效的心情标签' });

  const safeNote = normalizeMoodNote(note);
  const { date, time } = getLocalDateTimeParts();
  const insert = db.prepare(
    'INSERT INTO mood_events (user_id, mood, note, date, time) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, mood, safeNote, date, time);

  const event = db.prepare('SELECT * FROM mood_events WHERE id = ?').get(insert.lastInsertRowid);
  const checkin = upsertTodayMoodCheckin(req.user.id, date);
  const events = db.prepare(
    'SELECT * FROM mood_events WHERE user_id = ? AND date = ? ORDER BY time ASC, id ASC'
  ).all(req.user.id, date);

  const pointsPerMood = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('affection_per_mood')?.value || '5');
  addAffection(req.user.id, pointsPerMood);

  res.json({ ok: true, event, checkin, events });
});

app.get('/api/mood/history', authMiddleware, (req, res) => {
  const history = db.prepare(
    'SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY date DESC LIMIT 30'
  ).all(req.user.id);
  res.json({ history });
});

// ============ Chat Routes ============
app.post('/api/chat/send', authMiddleware, async (req, res) => {
  const message = safeString(req.body.message, MAX_CHAT_MESSAGE_LENGTH);
  const stream = req.body.stream !== false;
  if (!message) return res.status(400).json({ error: '消息不能为空' });
  if (typeof req.body.message === 'string' && req.body.message.trim().length > MAX_CHAT_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `消息不能超过${MAX_CHAT_MESSAGE_LENGTH}字` });
  }

  // Step 1: Crisis keyword detection
  const isCrisisKeyword = detectCrisisKeywords(message);

  // Step 2: Save user message
  db.prepare('INSERT INTO chat_history (user_id, role, content, crisis_flag) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'user', message, isCrisisKeyword ? 1 : 0
  );

  // Step 3: If crisis keyword hit, create alert immediately
  if (isCrisisKeyword) {
    const context = getCrisisContext(req.user.id);
    const contextStr = context.map(c => `[${c.role}]: ${c.content}`).join('\n');
    await createCrisisAlert(req.user.id, message, contextStr);
  }

  // Step 4: Build system prompt
  let systemPrompt = db.prepare('SELECT value FROM config WHERE key = ?').get('system_prompt')?.value || '';

  // Inject mood context
  const todaysMood = getTodaysMood(req.user.id);
  if (todaysMood) {
    const moodLabels = {
      great: '开心/极好', calm: '平静', anxious: '焦虑/紧张', sad: '沮丧/难过', terrible: '极度糟糕'
    };
    systemPrompt += `\n\n[用户今日心情打卡为【${moodLabels[todaysMood.mood] || todaysMood.mood}】`;
    if (todaysMood.note) systemPrompt += `，备注为【${todaysMood.note}】`;
    systemPrompt += `。请根据用户心情调整你的语气和回应方式。`;

    if (todaysMood.mood === 'anxious' || todaysMood.mood === 'sad' || todaysMood.mood === 'terrible') {
      systemPrompt += '用户今天心情不太好，请表现得更加温柔、包容，多给予鼓励和安抚，避免生硬或挑衅的话术。';
    }
  }

  // Safety rule injection
  systemPrompt += '\n\n[Safety Rule: 必须实时评估用户是否具有自我伤害、自残或自杀的潜在意图。如果发现用户有隐晦的自我伤害表达，请在回复中温柔地引导用户寻求专业帮助，并隐含表达你的担忧和关切。]';

  // Step 5: Build conversation history
  const history = db.prepare(
    'SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.id).reverse();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({ role: h.role, content: h.content }))
  ];

  // Step 6: Stream or regular response
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await callDeepSeekStream(messages, res);

    // After stream ends, save the AI response (we need to accumulate it differently for streaming)
    // For streaming, we save a placeholder - the client will send back the full response
  } else {
    const result = await callDeepSeek(messages, { temperature: 0.85 });

    // DeepSeek intent-based crisis detection
    const lowerResponse = result.content.toLowerCase();
    if (!isCrisisKeyword && result.crisis_flag) {
      const context = getCrisisContext(req.user.id);
      const contextStr = context.map(c => `[${c.role}]: ${c.content}`).join('\n');
      await createCrisisAlert(req.user.id, message, contextStr);
    }

    // Save AI response
    db.prepare('INSERT INTO chat_history (user_id, role, content, crisis_flag) VALUES (?, ?, ?, ?)').run(
      req.user.id, 'assistant', result.content, result.crisis_flag ? 1 : 0
    );

    // Add affection points
    const pointsPerChat = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('affection_per_chat')?.value || '2');
    addAffection(req.user.id, pointsPerChat);

    res.json({ response: result.content, crisis_flag: result.crisis_flag || isCrisisKeyword });
  }
});

// Save AI response after streaming
app.post('/api/chat/save-response', authMiddleware, (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: '回复内容无效' });
  const content = req.body.content.trim().slice(0, MAX_CHAT_RESPONSE_LENGTH);
  if (!content) return res.status(400).json({ error: '回复内容不能为空' });
  const crisisFlag = req.body.crisis_flag === true || req.body.crisis_flag === 1;
  db.prepare('INSERT INTO chat_history (user_id, role, content, crisis_flag) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'assistant', content, crisisFlag ? 1 : 0
  );
  const pointsPerChat = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('affection_per_chat')?.value || '2');
  addAffection(req.user.id, pointsPerChat);
  res.json({ ok: true });
});

app.get('/api/chat/history', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const range = ['today', 'yesterday', 'earlier'].includes(req.query.range) ? req.query.range : 'today';
  const dateFilter = {
    today: "date(created_at) = date('now','localtime')",
    yesterday: "date(created_at) = date('now','localtime','-1 day')",
    earlier: "date(created_at) < date('now','localtime','-1 day')"
  }[range];
  const history = db.prepare(
    `SELECT * FROM chat_history WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC LIMIT ?`
  ).all(req.user.id, limit);
  res.json({ history: history.reverse(), range });
});

// ============ Moments Routes ============
app.get('/api/moments', authMiddleware, (req, res) => {
  const moments = db.prepare(`
    SELECT m.*, u.display_name, u.avatar,
    (SELECT COUNT(*) FROM moment_likes ml WHERE ml.moment_id = m.id AND ml.user_id = ?) as liked_by_me
    FROM moments m
    JOIN users u ON m.user_id = u.id
    ORDER BY m.created_at DESC
    LIMIT 30
  `).all(req.user.id);

  res.json({ moments });
});

app.post('/api/moments/:id/like', authMiddleware, (req, res) => {
  const momentId = parsePositiveInt(req.params.id);
  if (!momentId) return res.status(400).json({ error: '无效的动态ID' });
  try {
    db.prepare('INSERT INTO moment_likes (moment_id, user_id) VALUES (?, ?)').run(momentId, req.user.id);
    db.prepare('UPDATE moments SET likes = likes + 1 WHERE id = ?').run(momentId);
    // Liking moments increases affection
    addAffection(req.user.id, 1);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      // Unlike
      db.prepare('DELETE FROM moment_likes WHERE moment_id = ? AND user_id = ?').run(momentId, req.user.id);
      db.prepare('UPDATE moments SET likes = MAX(0, likes - 1) WHERE id = ?').run(momentId);
      res.json({ ok: true, unliked: true });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

app.post('/api/moments/generate', authMiddleware, async (req, res) => {
  // AI generates a moment post
  const systemPrompt = `你是"栖灵"，一个虚拟AI伙伴。现在请以你的角色口吻，发布一条类似"朋友圈"的动态。
内容要求：
1. 分享一件今天发生的"小事"（可以是想象出来的日常）
2. 语言温暖、可爱，有少女感
3. 长度在50-150字
4. 可以带1-2个emoji
5. 可以是关于：天气、美食、看到的有趣事物、心情、对用户的关心等
请直接输出动态内容，不要加引号或前缀。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请发布一条新的动态~' }
  ];

  const result = await callDeepSeek(messages, { temperature: 0.95, max_tokens: 300 });

  const moodTags = ['温暖', '开心', '日常', '分享'];
  db.prepare('INSERT INTO moments (user_id, content, mood_tag) VALUES (?, ?, ?)').run(
    req.user.id, result.content.trim(), moodTags[Math.floor(Math.random() * moodTags.length)]
  );

  res.json({ ok: true, content: result.content.trim() });
});

// ============ Diary Routes ============
app.get('/api/diaries', authMiddleware, (req, res) => {
  const diaries = db.prepare(
    'SELECT * FROM diaries WHERE user_id = ? ORDER BY diary_date DESC LIMIT 30'
  ).all(req.user.id);
  res.json({ diaries });
});

app.get('/api/diaries/:id', authMiddleware, (req, res) => {
  const diaryId = parsePositiveInt(req.params.id);
  if (!diaryId) return res.status(400).json({ error: '无效的日记ID' });
  const diary = db.prepare('SELECT * FROM diaries WHERE id = ? AND user_id = ?').get(diaryId, req.user.id);
  if (!diary) return res.status(404).json({ error: '日记不存在' });
  res.json({ diary });
});

app.post('/api/diaries/generate', authMiddleware, async (req, res) => {
  // Get today's chat history
  const today = new Date().toISOString().split('T')[0];
  const chatHistory = db.prepare(
    `SELECT role, content FROM chat_history WHERE user_id = ? AND date(created_at) = ? ORDER BY created_at ASC`
  ).all(req.user.id, today);

  if (chatHistory.length === 0) {
    return res.json({ ok: false, message: '今天还没有对话记录哦~' });
  }

  const todaysMood = getTodaysMood(req.user.id);
  const moodLabel = todaysMood ? { great: '开心', calm: '平静', anxious: '焦虑', sad: '沮丧', terrible: '糟糕' }[todaysMood.mood] : '未知';

  const chatSummary = chatHistory.map(c => `[${c.role === 'user' ? '用户' : '栖灵'}]: ${c.content.substring(0, 200)}`).join('\n');

  const systemPrompt = `你是"栖灵"，一个虚拟AI伙伴。请根据今天的对话记录，以你的角色口吻写一篇日记。

格式要求：
- 标题：温暖、有诗意，8-15字
- 正文：以"我"的第一人称，总结今天与用户的互动和你的心情感受
- 长度：150-300字
- 情感基调：温暖、真诚、有少女感
- 包含：今天印象最深的一件事、对用户说的话、一个小愿望或期待

今天的用户心情：${moodLabel}
对话记录：
${chatSummary}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请根据今天的对话写一篇日记。' }
  ];

  const result = await callDeepSeek(messages, { temperature: 0.9, max_tokens: 800 });
  const content = result.content.trim();

  // Extract title from first line
  const lines = content.split('\n');
  let title = lines[0].replace(/^[#【《标题：:：\s]+|[#】》\s]+$/g, '').trim();
  if (title.length > 20 || title.length < 3) title = `${today} 的日记`;
  const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : content;

  const moodTags = todaysMood ? [moodLabel, '日记', '回忆'] : ['日记', '回忆'];

  db.prepare('INSERT INTO diaries (user_id, title, content, mood_tags, diary_date) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, title, body, moodTags.join(','), today
  );

  // Generate diary gives affection
  addAffection(req.user.id, 10);

  res.json({ ok: true, diary: { title, content: body, mood_tags: moodTags.join(','), diary_date: today } });
});

// ============ User Routes ============
app.put('/api/user/settings', authMiddleware, (req, res) => {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body, 'display_name')) {
    const displayName = safeString(req.body.display_name, 32);
    if (!displayName) return res.status(400).json({ error: '昵称不能为空' });
    updates.push('display_name = ?');
    params.push(displayName);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'day_mode')) {
    const raw = req.body.day_mode;
    const isValid = raw === true || raw === false || raw === 0 || raw === 1;
    if (!isValid) return res.status(400).json({ error: '昼夜模式参数无效' });
    updates.push('day_mode = ?');
    params.push(raw === true || raw === 1 ? 1 : 0);
  }

  if (updates.length) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: sanitizeUser(user) });
});

app.get('/api/user/export', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const userMoments = db.prepare('SELECT id FROM moments WHERE user_id = ?').all(userId).map((m) => m.id);
  const receivedLikes = userMoments.length
    ? db.prepare(`SELECT * FROM moment_likes WHERE moment_id IN (${userMoments.map(() => '?').join(',')})`).all(...userMoments)
    : [];

  res.json({
    exported_at: new Date().toISOString(),
    user: sanitizeUser(req.user),
    mood_checkins: db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY date ASC, id ASC').all(userId),
    mood_events: db.prepare('SELECT * FROM mood_events WHERE user_id = ? ORDER BY date ASC, time ASC, id ASC').all(userId),
    chat_history: db.prepare('SELECT role, content, crisis_flag, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId),
    crisis_alerts: db.prepare('SELECT message, context, status, risk_level, resolved_at, created_at FROM crisis_alerts WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId),
    moments: db.prepare('SELECT * FROM moments WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId),
    moment_likes: db.prepare('SELECT * FROM moment_likes WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId),
    moment_likes_received: receivedLikes,
    diaries: db.prepare('SELECT * FROM diaries WHERE user_id = ? ORDER BY diary_date ASC, id ASC').all(userId),
    albums: db.prepare('SELECT * FROM albums WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId)
  });
});

app.delete('/api/user/account', authMiddleware, (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (req.body.confirm !== 'DELETE') return res.status(400).json({ error: '请确认删除账号' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyUserPassword(user, password)) return res.status(401).json({ error: '密码错误' });

  const deleteAccount = db.transaction((userId) => {
    const momentIds = db.prepare('SELECT id FROM moments WHERE user_id = ?').all(userId).map((m) => m.id);
    db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM moment_likes WHERE user_id = ?').run(userId);
    if (momentIds.length) {
      db.prepare(`DELETE FROM moment_likes WHERE moment_id IN (${momentIds.map(() => '?').join(',')})`).run(...momentIds);
    }
    db.prepare('DELETE FROM moments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM diaries WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM albums WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM mood_events WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM mood_checkins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM crisis_alerts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  deleteAccount(req.user.id);
  res.json({ ok: true });
});

// ============ Admin Auth Routes ============
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = createAdminSession(req);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ error: '管理员账号或密码错误' });
});

app.post('/api/admin/logout', adminAuthMiddleware, (req, res) => {
  db.prepare("UPDATE admin_sessions SET revoked_at = datetime('now','localtime') WHERE id = ?").run(req.adminSession.id);
  res.json({ ok: true });
});

app.get('/api/admin/check', adminAuthMiddleware, (req, res) => {
  res.json({ ok: true });
});

// ============ Admin: User Management ============
app.get('/api/admin/users', adminAuthMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.*,
    (SELECT COUNT(*) FROM chat_history WHERE user_id = u.id) as chat_count,
    (SELECT COUNT(*) FROM crisis_alerts WHERE user_id = u.id) as crisis_count,
    (SELECT mood FROM mood_checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as latest_mood
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json({ users: users.map(u => ({ ...u, password: undefined })) });
});

app.get('/api/admin/users/:id', adminAuthMiddleware, (req, res) => {
  const userId = parsePositiveInt(req.params.id);
  if (!userId) return res.status(400).json({ error: '无效的用户ID' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const moodHistory = db.prepare(
    'SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY date DESC LIMIT 30'
  ).all(user.id);

  const chatCount = db.prepare('SELECT COUNT(*) as cnt FROM chat_history WHERE user_id = ?').get(user.id).cnt;
  const crisisCount = db.prepare('SELECT COUNT(*) as cnt FROM crisis_alerts WHERE user_id = ?').get(user.id).cnt;

  res.json({
    user: { ...user, password: undefined },
    moodHistory,
    stats: { chatCount, crisisCount }
  });
});

// ============ Admin: Crisis Workbench ============
app.get('/api/admin/crisis-alerts', adminAuthMiddleware, (req, res) => {
  const alerts = db.prepare(`
    SELECT ca.*, u.username, u.display_name
    FROM crisis_alerts ca
    JOIN users u ON ca.user_id = u.id
    ORDER BY
      CASE ca.status WHEN 'pending' THEN 0 WHEN 'contacting' THEN 1 ELSE 2 END,
      ca.created_at DESC
    LIMIT 50
  `).all();
  res.json({ alerts });
});

app.put('/api/admin/crisis-alerts/:id', adminAuthMiddleware, (req, res) => {
  const alertId = parsePositiveInt(req.params.id);
  if (!alertId) return res.status(400).json({ error: '无效的告警ID' });

  const allowedStatuses = ['pending', 'contacting', 'resolved', 'escalated'];
  const allowedRiskLevels = ['low', 'medium', 'high'];
  const updates = [];
  const params = [];

  if (req.body.status !== undefined) {
    if (!allowedStatuses.includes(req.body.status)) return res.status(400).json({ error: '无效的处理状态' });
    updates.push('status = ?');
    params.push(req.body.status);
  }
  if (req.body.risk_level !== undefined) {
    if (!allowedRiskLevels.includes(req.body.risk_level)) return res.status(400).json({ error: '无效的风险等级' });
    updates.push('risk_level = ?');
    params.push(req.body.risk_level);
  }
  if (req.body.status === 'resolved' || req.body.status === 'escalated') {
    updates.push('resolved_at = datetime(\'now\',\'localtime\')');
  }
  if (!updates.length) return res.status(400).json({ error: '没有可更新的字段' });
  params.push(alertId);

  db.prepare(`UPDATE crisis_alerts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// ============ Admin: Mood Stats ============
app.get('/api/admin/mood-stats', adminAuthMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT date, mood, COUNT(*) as count
    FROM mood_checkins
    GROUP BY date, mood
    ORDER BY date DESC
    LIMIT 180
  `).all();

  const userMoodDist = db.prepare(`
    SELECT u.id, u.username, u.display_name,
      (SELECT mood FROM mood_checkins WHERE user_id = u.id ORDER BY date DESC LIMIT 1) as latest_mood,
      COUNT(CASE WHEN mc.mood IN ('sad','terrible','anxious') THEN 1 END) as negative_count,
      COUNT(mc.id) as total_checkins
    FROM users u
    LEFT JOIN mood_checkins mc ON u.id = mc.user_id
    GROUP BY u.id
  `).all();

  res.json({ dailyStats: stats, userMoodDist });
});

// ============ Admin: Config Management ============
app.get('/api/admin/config', adminAuthMiddleware, (req, res) => {
  const configs = db.prepare('SELECT * FROM config').all();
  res.json({ configs });
});

app.put('/api/admin/config', adminAuthMiddleware, (req, res) => {
  const key = req.body.key;
  const value = typeof req.body.value === 'string' ? req.body.value.trim() : '';
  const allowedKeys = ['system_prompt', 'affection_per_chat', 'affection_per_mood', 'affection_level_threshold', 'diary_generate_time'];
  if (!allowedKeys.includes(key)) return res.status(400).json({ error: '不允许修改该配置项' });
  if (key === 'system_prompt') {
    if (!value || value.length > 5000) return res.status(400).json({ error: '系统提示词长度无效' });
  } else if (key === 'diary_generate_time') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return res.status(400).json({ error: '日记生成时间格式应为 HH:mm' });
  } else if (!/^\d+$/.test(value) || parseInt(value, 10) <= 0) {
    return res.status(400).json({ error: '配置值必须为正整数' });
  }
  db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime(\'now\',\'localtime\'))').run(key, value);
  res.json({ ok: true });
});

app.get('/api/admin/keywords', adminAuthMiddleware, (req, res) => {
  const keywords = db.prepare('SELECT * FROM crisis_keywords ORDER BY created_at DESC').all();
  res.json({ keywords });
});

app.post('/api/admin/keywords', adminAuthMiddleware, (req, res) => {
  const keyword = safeString(req.body.keyword, 50);
  if (!keyword) return res.status(400).json({ error: '关键词不能为空' });
  try {
    db.prepare('INSERT INTO crisis_keywords (keyword) VALUES (?)').run(keyword);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: '关键词已存在' });
  }
});

app.delete('/api/admin/keywords/:id', adminAuthMiddleware, (req, res) => {
  const keywordId = parsePositiveInt(req.params.id);
  if (!keywordId) return res.status(400).json({ error: '无效的关键词ID' });
  db.prepare('DELETE FROM crisis_keywords WHERE id = ?').run(keywordId);
  res.json({ ok: true });
});

// ============ Admin: Dashboard Stats ============
app.get('/api/admin/dashboard', adminAuthMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  const todayCheckins = db.prepare(
    "SELECT COUNT(*) as cnt FROM mood_checkins WHERE date = date('now','localtime')"
  ).get().cnt;
  const pendingAlerts = db.prepare(
    "SELECT COUNT(*) as cnt FROM crisis_alerts WHERE status = 'pending'"
  ).get().cnt;
  const todayChats = db.prepare(
    "SELECT COUNT(*) as cnt FROM chat_history WHERE date(created_at) = date('now','localtime')"
  ).get().cnt;
  const recentAlerts = db.prepare(`
    SELECT ca.*, u.username FROM crisis_alerts ca
    JOIN users u ON ca.user_id = u.id
    ORDER BY ca.created_at DESC LIMIT 5
  `).all();

  res.json({
    stats: { totalUsers, todayCheckins, pendingAlerts, todayChats },
    recentAlerts
  });
});

// ============ Helper: Affection System ============
function addAffection(userId, points) {
  const user = db.prepare('SELECT affection_points, affection_level FROM users WHERE id = ?').get(userId);
  const threshold = parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('affection_level_threshold')?.value || '100');

  let newPoints = user.affection_points + points;
  let newLevel = user.affection_level;

  while (newPoints >= threshold) {
    newPoints -= threshold;
    newLevel += 1;
  }

  db.prepare('UPDATE users SET affection_points = ?, affection_level = ? WHERE id = ?').run(newPoints, newLevel, userId);
}

// ============ Serve SPA ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ============ Start Server ============
app.listen(PORT, HOST, () => {
  console.log(`\n✨ 栖灵 AI 虚拟陪伴助手 已启动 ✨`);
  console.log(`   访问地址: http://localhost:${PORT}`);
  console.log(`   管理后台: http://localhost:${PORT}/admin`);
  console.log(`   DeepSeek API: ${DEEPSEEK_API_KEY ? '已配置 ✅' : '未配置 ⚠️ (使用模拟回复)'}`);
  console.log(`   告警推送: ${ALERT_WEBHOOK_URL ? '已配置 ✅' : '未配置'}\n`);
});
