// ============ Chat Module ============
let _currentReadingBtn = null;  // Track which message is being read
let _currentChatRange = 'today';

const UIIcons = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.3 5.6 1.9-5.6 1.9L12 18l-1.9-5.4-5.6-1.9 5.6-1.9L12 3.5z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11.8a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4z"/><path d="M5.4 19.4c.8-3.5 3.3-5.4 6.6-5.4s5.8 1.9 6.6 5.4"/></svg>',
  mood: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.8 10h.1M15.1 10h.1M8.8 13.7c1.8 1.8 4.6 1.8 6.4 0"/></svg>',
  avatar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z"/><path d="M5.6 19.2c.8-3.2 3.2-5 6.4-5s5.6 1.8 6.4 5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6.8A6.4 6.4 0 0 1 12 3.7h.2c4.1 0 7.3 2.7 7.3 6.3s-3.2 6.3-7.3 6.3c-.8 0-1.5-.1-2.2-.3L5.2 19l1.2-4A5.9 5.9 0 0 1 5.5 6.8z"/><path d="M8.7 10.2h6.6M8.7 12.8h4.4"/></svg>',
  moments: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.8h11A1.7 1.7 0 0 1 19.2 6.5v11a1.7 1.7 0 0 1-1.7 1.7h-11a1.7 1.7 0 0 1-1.7-1.7v-11a1.7 1.7 0 0 1 1.7-1.7z"/><path d="M8 8h8M8 11.5h8M8 15h5"/></svg>',
  diary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h8.2A2.8 2.8 0 0 1 18 7.3v12.2H7A2 2 0 0 1 5 17.5v-11a2 2 0 0 1 2-2z"/><path d="M8.7 8.5h5.8M8.7 11.5h4.6M7 19.5a2 2 0 0 1 0-4h11"/></svg>',
  call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.1 5.1l2 4.1-1.6 1.2c.9 1.8 2.3 3.2 4.1 4.1l1.2-1.6 4.1 2-.7 3.1c-.2.8-.9 1.3-1.7 1.2A12.7 12.7 0 0 1 4.8 8.5c-.1-.8.4-1.5 1.2-1.7l2.1-.7z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.2l1.4-2h6.2l1.4 2h1.7A2.2 2.2 0 0 1 20.4 9.4v7.1a2.2 2.2 0 0 1-2.2 2.2H5.8a2.2 2.2 0 0 1-2.2-2.2V9.4a2.2 2.2 0 0 1 2.2-2.2h1.7z"/><path d="M12 15.7a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z"/></svg>',
  security: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 10.4V8.1A4.8 4.8 0 0 1 12 3.3a4.8 4.8 0 0 1 4.8 4.8v2.3"/><path d="M6.4 10.4h11.2A1.9 1.9 0 0 1 19.5 12v6.8a1.9 1.9 0 0 1-1.9 1.9H6.4a1.9 1.9 0 0 1-1.9-1.9V12a1.9 1.9 0 0 1 1.9-1.6z"/><path d="M12 14.4v2.7"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.2a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4.2a3 3 0 0 0 3 3z"/><path d="M6.8 11.2a5.2 5.2 0 0 0 10.4 0M12 16.4v3.1M9.2 19.5h5.6"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l14-7-4.2 14-2.8-5.2L5 12z"/><path d="M12 13.8L19 5"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.2a2.3 2.3 0 1 1-1.5-2.2L17 12.8V5.3l-8 1.8v10.1z"/><path d="M17 15.3a2.3 2.3 0 1 1-1.5-2.2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-8.6-9.1C2.4 7.8 4.2 5 7.2 5c1.8 0 3.2 1 4.1 2.4C12.2 6 13.6 5 15.4 5c3 0 4.8 2.8 3.8 5.9C17.5 15.6 12 20 12 20z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.4l4.1 4.1L19 6.8"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.4h3.1L13 5.6v12.8l-4.9-3.8H5z"/><path d="M16.2 9.1a4.4 4.4 0 0 1 0 5.8M18.6 6.8a7.8 7.8 0 0 1 0 10.4"/></svg>',
  reload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.5 8.5A7 7 0 1 0 19 15"/><path d="M18.5 4.8v3.7h-3.7"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v8H8z"/></svg>',
  moodGreat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.5 9.7h.1M15.4 9.7h.1M8.5 13.2c1.9 2 5.1 2 7 0"/></svg>',
  moodCalm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.5 10h.1M15.4 10h.1M8.8 14h6.4"/></svg>',
  moodAnxious: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.4 10.2l1.4-.8M15.6 10.2l-1.4-.8M9 15.3c1.8-1.1 4.2-1.1 6 0"/><path d="M17.8 7.2l.7-1.4"/></svg>',
  moodSad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.5 10h.1M15.4 10h.1M8.8 15.4c1.8-1.8 4.6-1.8 6.4 0"/><path d="M16.5 12.4v2"/></svg>',
  moodAngry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"/><path d="M8.1 8.8l2 .9M15.9 8.8l-2 .9M9 15.3h6"/></svg>'
};

function iconHtml(name, label = '') {
  const text = label ? `<span class="ui-icon-label">${label}</span>` : '';
  return `<span class="ui-icon" aria-hidden="true">${UIIcons[name] || ''}</span>${text}`;
}

function chatAvatarHtml(role) {
  const isUser = role === 'user';
  return `<div class="chat-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}">${iconHtml(isUser ? 'user' : 'star')}</div>`;
}

function _setIconButton(btn, iconName, title) {
  if (!btn) return;
  btn.innerHTML = iconHtml(iconName);
  btn.title = title;
}

function _readBtnHtml() {
  return `<button class="read-aloud-btn" title="朗读" onclick="event.stopPropagation(); ReadAloud.toggle(this)">${iconHtml('volume')}</button>`;
}

// Called when a read-aloud button is clicked on an AI message
// (kept for backward compatibility — buttons now call ReadAloud.toggle(this) directly)
function toggleReadAloud(btn) {
  ReadAloud.toggle(btn);
}

// Auto-read an AI message (called after AI response completes)
function autoReadMessage(text, msgDiv) {
  if (!text || !msgDiv) return;

  const btn = msgDiv.querySelector('.read-aloud-btn');
  if (!btn) return;

  // Simulate clicking the read-aloud button on this message
  ReadAloud.toggle(btn);
}
function initChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    App.lastTypingTime = Date.now();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  initPremiumIcons();
  initChatFilters();

  // Load initial history
  loadChatHistory(_currentChatRange);

  // Voice button in chat
  document.getElementById('btn-voice-input').addEventListener('click', toggleVoiceInput);
}

function initPremiumIcons() {
  const setIcon = (selector, name, label = '') => {
    const el = document.querySelector(selector);
    if (el) el.innerHTML = iconHtml(name, label);
  };
  const setAllIcons = (selector, name) => {
    document.querySelectorAll(selector).forEach(el => { el.innerHTML = iconHtml(name); });
  };

  setIcon('.nav-logo', 'star');
  setIcon('.nav-item[data-panel="chat"]', 'chat');
  setIcon('.nav-item[data-panel="moments"]', 'moments');
  setIcon('.nav-item[data-panel="diary"]', 'diary');
  setIcon('#btn-call-mode', 'call');
  setIcon('#btn-mood-checkin', 'mood', '心情打卡');
  setIcon('#btn-model-switch', 'avatar', '人物');
  setIcon('#btn-mood-quick', 'mood');
  setIcon('#btn-voice-input', 'mic');
  setIcon('#btn-send', 'send');
  setIcon('#btn-camera-toggle', 'camera');
  setIcon('#btn-account-security', 'security');
  setIcon('#btn-generate-moment', 'star', '生成新动态');
  setIcon('#btn-generate-diary', 'diary', '生成今日日记');
  setIcon('#btn-call-mute', 'mic');
  setIcon('#btn-call-end', 'call');

  document.querySelectorAll('.content-title').forEach(title => {
    const text = title.textContent.trim();
    if (text.includes('对话')) title.innerHTML = iconHtml('chat', '对话');
    if (text.includes('动态')) title.innerHTML = iconHtml('moments', '栖灵的动态');
    if (text.includes('日记')) title.innerHTML = iconHtml('diary', '记忆日记');
    if (text.includes('通话')) title.innerHTML = iconHtml('call', '语音通话');
  });

  setAllIcons('#moments-list .empty-state-icon', 'moments');
  setAllIcons('#diary-list .empty-state-icon', 'diary');
  const voiceIcon = document.querySelector('.nav-voice-icon');
  if (voiceIcon) voiceIcon.innerHTML = UIIcons.music;
  const voiceTitle = document.querySelector('#voice-select-overlay .mood-title');
  if (voiceTitle) voiceTitle.innerHTML = iconHtml('music', '选择朗读音色');
}

function initChatFilters() {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const range = pill.dataset.range || 'today';
      if (range === _currentChatRange) return;
      _currentChatRange = range;
      document.querySelectorAll('.filter-pill').forEach(item => item.classList.toggle('active', item === pill));
      loadChatHistory(range);
    });
  });
}

// Build expression context from MediaPipe
function getExpressionContext() {
  if (!MediaPipeBridge.active) return '';

  const bs = MediaPipeBridge.blendshapes;
  if (!bs || Object.keys(bs).length === 0) return '';

  const smile = (bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0);
  const frown = (bs.mouthFrownLeft || 0) + (bs.mouthFrownRight || 0);
  const jaw = bs.jawOpen || 0;
  const browUp = bs.browInnerUp || 0;
  const browDown = (bs.browDownLeft || 0) + (bs.browDownRight || 0);
  const blink = (bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0);

  let expr = '平静';
  if (smile > 0.2) expr = '微笑';
  if (smile > 0.5) expr = '开心大笑';
  if (frown > 0.15) expr = '皱眉/不开心';
  if (browDown > 0.2) expr = '生气';
  if (browUp > 0.15) expr = '惊讶/好奇';
  if (jaw > 0.15) expr = '张嘴/惊讶';
  if (blink > 0.4) expr = '眨眼/调皮';

  let ctx = `[用户当前表情: ${expr}`;

  // Add gesture
  if (MediaPipeBridge.gestures?.length > 0 && MediaPipeBridge.gestures[0].score > 0.5) {
    ctx += `, 手势: ${MediaPipeBridge.gestures[0].category}`;
  }
  ctx += ']';

  return ctx;
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || App._sending) return;

  App._sending = true;
  input.value = '';
  document.getElementById('btn-send').disabled = true;

  // Build message with expression context
  const exprCtx = getExpressionContext();
  const fullMessage = exprCtx ? `${exprCtx}\n${message}` : message;

  // Add user message (show original text, not expression context)
  addMessage('user', message);
  scrollToBottom();

  // Live2D reaction to user message
  live2dOnUserMessage();

  // Show typing indicator
  const typingEl = addTypingIndicator();
  scrollToBottom();

  // Live2D reaction to AI starting
  live2dOnAIStart();

  try {
    let fullResponse = '';
    let crisisFlag = false;

    await API.sendMessageStream(fullMessage,
      (chunk, full) => {
        fullResponse = full;
        updateTypingIndicator(typingEl, fullResponse);
        scrollToBottom();
      },
      (done) => {
        crisisFlag = done.crisis_flag || false;
      }
    );

    // Remove typing and add final AI message
    typingEl.remove();
    const msgDiv = addMessage('ai', fullResponse || '嗯...我暂时不知道该说什么呢~');
    scrollToBottom();

    // Live2D reaction to AI done
    live2dOnAIEnd();

    // Auto-read the AI response
    autoReadMessage(fullResponse, msgDiv);

    // Handle crisis flag
    if (crisisFlag) {
      showCrisisBanner();
    }

    // Save response and refresh user
    API.saveResponse(fullResponse, crisisFlag);
    refreshUserProfile();

  } catch (err) {
    typingEl.remove();
    addMessage('ai', '抱歉，我好像走神了...再试一次好吗？💕');
    scrollToBottom();
    live2dOnAIEnd();
  }

  App._sending = false;
  document.getElementById('btn-send').disabled = false;
  input.focus();
}

function addMessage(role, content) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg ' + role;

  if (role === 'ai') {
    msgDiv.innerHTML = `
      ${chatAvatarHtml('ai')}
      <div class="chat-bubble ai">${escapeHtml(content)}</div>
      ${_readBtnHtml()}
    `;
  } else {
    msgDiv.innerHTML = `
      <div class="chat-bubble user">${escapeHtml(content)}</div>
      ${chatAvatarHtml('user')}
    `;
  }

  container.querySelector('.chat-messages').appendChild(msgDiv);
  return msgDiv;
}

function addTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `
    ${chatAvatarHtml('ai')}
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.querySelector('.chat-messages').appendChild(el);
  return el;
}

function updateTypingIndicator(el, text) {
  const bubble = el.querySelector('.typing-dots');
  if (bubble && text) {
    bubble.className = 'chat-bubble ai';
    bubble.textContent = text;
  }
}

function scrollToBottom() {
  const body = document.getElementById('chat-messages');
  body.scrollTop = body.scrollHeight;
}

function showCrisisBanner() {
  const container = document.getElementById('chat-messages');
  const banner = document.createElement('div');
  banner.className = 'crisis-banner';
  banner.innerHTML = `
    <div class="crisis-banner-title">🆘 我感受到了你的痛苦...</div>
    <div class="crisis-banner-text">
      如果你正在经历艰难时刻，请记住你并不孤单。<br/>
      这个世界上有很多人愿意倾听你、帮助你。
    </div>
    <div class="crisis-hotline">
      📞 <strong>全国24小时心理援助热线：400-161-9995</strong><br/>
      📞 北京心理危机研究与干预中心：010-82951332<br/>
      📞 生命热线：400-821-1215
    </div>
  `;
  container.querySelector('.chat-messages').appendChild(banner);
  scrollToBottom();
  showToast('我们已通知专业人员关注你的情况', 'warning');
}

async function loadChatHistory(range = 'today') {
  try {
    const data = await API.getChatHistory(80, range);
    const container = document.getElementById('chat-messages');
    const chatMsgs = container.querySelector('.chat-messages');
    chatMsgs.innerHTML = '';

    if (!data.history || data.history.length === 0) {
      const labels = { today: '今天', yesterday: '昨天', earlier: '更早' };
      chatMsgs.innerHTML = `
        <div class="time-divider"><span>${labels[range] || '今天'}</span></div>
        <div class="chat-empty-state">这里还没有聊天记录</div>
      `;
      return;
    }

    let lastDate = '';
    data.history.forEach(msg => {
      const date = msg.created_at ? msg.created_at.split(' ')[0] : '';
      if (date && date !== lastDate) {
        lastDate = date;
        const divider = document.createElement('div');
        divider.className = 'time-divider';
        divider.innerHTML = `<span>${date}</span>`;
        chatMsgs.appendChild(divider);
      }
      const role = msg.role === 'assistant' ? 'ai' : 'user';
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg ' + role;
      if (role === 'ai') {
        msgDiv.innerHTML = `${chatAvatarHtml('ai')}<div class="chat-bubble ai">${escapeHtml(msg.content)}</div>${_readBtnHtml()}`;
      } else {
        msgDiv.innerHTML = `<div class="chat-bubble user">${escapeHtml(msg.content)}</div>${chatAvatarHtml('user')}`;
      }
      chatMsgs.appendChild(msgDiv);
    });

    scrollToBottom();
  } catch (e) { /* ignore */ }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br/>');
}

// Voice input toggle
let voiceListening = false;
function toggleVoiceInput() {
  if (voiceListening) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    showToast('你的浏览器不支持语音识别', 'warning');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  voiceListening = true;
  const btn = document.getElementById('btn-voice-input');
  btn.innerHTML = '<span class="recording-dot"></span>';
  btn.classList.add('recording');

  recognition.start();

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    document.getElementById('chat-input').value = text;
  };

  recognition.onerror = () => { stopVoiceInput(); };
  recognition.onend = () => { stopVoiceInput(); };
}

function stopVoiceInput() {
  voiceListening = false;
  const btn = document.getElementById('btn-voice-input');
  btn.innerHTML = iconHtml('mic');
  btn.classList.remove('recording');
}
