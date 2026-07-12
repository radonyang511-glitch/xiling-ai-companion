// ============ App State ============
const App = {
  user: null,
  token: null,
  live2dModel: null,
  pixiApp: null,
  currentPanel: 'chat',
  dayMode: true,
  callActive: false,
  callMuted: false,
  callTimerInterval: null,
  callSeconds: 0,
  idleTimer: null,
  _sending: false,
  _accountSecurityBound: false,
  currentModelKey: 'panda-cake',
  _switchingModel: false,
  ttsSpeaker: 0,   // Current TTS voice ID
  ttsSpeakers: [
    '苏映雪', '刻晴·甜', '特蕾莎·柔', '傅诗雨', '优菈'
  ]
};

// ============ Model Registry ============
const MODELS = {
  'panda-cake': {
    name: '栖灵',
    url: '/model/panda-cake/panda-cake.model3.json?v=3',
    expressions: ['星星眼', '爱心眼', '脸红', '戳脸', '流泪', '蚊香眼', '眼镜', '冰淇淋', '书本', '书本-写字', '书本-点击', '熊猫抱枕', '变小', '只有头', '舌头', '脸黑'],
    motions: ['Idle', 'Walk', 'Sleepy'],
    clickExpressions: ['星星眼', '爱心眼', '脸红', '戳脸', '流泪', '蚊香眼'],
    idleMotions: ['Walk', 'Idle'],
    sleepyMotion: 'Sleepy',
    sleepyWakeLock: true,
    sleepyExprs: ['脸黑', '熊猫抱枕'],
    walkExprs: ['星星眼', '脸红', '爱心眼'],
    idleExprs: ['戳脸', '眼镜', '冰淇淋'],
    userMessageExprs: ['星星眼', '戳脸', '脸红', '爱心眼'],
    aiStartExpr: '爱心眼',
    aiEndExpr: '星星眼'
  },
  'xiaofaduo': {
    name: '泠瑶',
    url: '/model/xiaofaduo/AoiYume.model3.json?v=1',
    expressions: ['Angry', 'CatOff', 'EyeCry', 'EyeHeart', 'EyeStar', 'HandMic', 'MaskSwitch', 'MaskWearing', 'Chao', 'Anywhere'],
    motions: ['Idle'],
    clickExpressions: ['EyeHeart', 'EyeStar', 'EyeCry', 'Angry', 'CatOff', 'HandMic'],
    idleMotions: ['Idle'],
    scaleBoost: 1.35,
    walkExprs: ['EyeHeart', 'EyeStar', 'HandMic', 'Chao'],
    sleepyExprs: ['EyeCry', 'CatOff', 'Anywhere', 'Angry'],
    idleExprs: ['Angry', 'Chao', 'CatOff', 'MaskSwitch', 'MaskWearing'],
    userMessageExprs: ['EyeHeart', 'EyeStar', 'HandMic', 'Chao', 'MaskWearing'],
    aiStartExpr: 'EyeCry',
    aiEndExpr: 'EyeHeart',
    hideParams: ['Param', 'Param10', 'Param15']
  },
  'rabbit': {
    name: '沐沐',
    url: '/model/rabbit/rabbit.model3.json?v=2',
    expressions: ['F1','F2','F3','F4','F5','F6','F7','F8','F9','N1','N2','N3','N4','N5','N6','N7','N8','Q'],
    motions: ['Idle', 'Walk', 'Sleepy'],
    clickExpressions: ['F1','F2','F3','F4','F5','F6','F7','F8','F9','N1','N2','N3','N4','N5','N6','N7','N8','Q'],
    idleMotions: ['Walk', 'Idle'],
    sleepyMotion: 'Sleepy',
    sleepyEyeLock: true,
    walkExprs: ['F1','F2','F3','F4','F5'],
    sleepyExprs: ['N1','N2','N3','N4','N5','N6','N7','N8'],
    idleExprs: ['F6','F7','F8','F9','Q'],
    userMessageExprs: ['F1','F2','F3','F4','F5','F6','F7','F8','F9'],
    aiStartExpr: 'N1',
    aiEndExpr: 'F1'
  }
};

function currentModel() { return MODELS[App.currentModelKey]; }

function updateOnlineStatus() {
  const el = document.getElementById('online-status-text');
  if (el) el.textContent = currentModel().name + '在线';
}

// ============ Live2D Initialization ============
async function initLive2D() {
  const container = document.getElementById('live2d-container');
  const placeholder = document.getElementById('live2d-placeholder');

  // Clean up previous model
  if (App.live2dModel) {
    try { App.live2dModel.destroy(); } catch(e) {}
    App.live2dModel = null;
  }
  if (App.pixiApp) {
    try { App.pixiApp.destroy(true, { children: true, texture: true }); } catch(e) {}
    App.pixiApp = null;
  }
  // Remove any old canvas
  const oldCanvas = container.querySelector('canvas');
  if (oldCanvas) oldCanvas.remove();

  // Check all dependencies loaded
  if (typeof PIXI === 'undefined') {
    console.error('[Live2D] PIXI not loaded');
    placeholder.textContent = 'Live2D\n(PIXI 未加载)';
    return;
  }
  if (typeof Live2DCubismCore === 'undefined') {
    console.error('[Live2D] Live2DCubismCore not loaded');
    placeholder.textContent = 'Live2D\n(CubismCore 未加载)';
    return;
  }
  if (!PIXI.live2d || !PIXI.live2d.Live2DModel) {
    console.error('[Live2D] PIXI.live2d.Live2DModel not loaded');
    placeholder.textContent = 'Live2D\n(Live2DModel 未加载)';
    return;
  }

  try {
    // Wait one frame for layout to settle
    await new Promise(r => requestAnimationFrame(r));

    const cw = container.clientWidth || 310;
    const ch = container.clientHeight || window.innerHeight * 0.85;
    App.pixiApp = new PIXI.Application({
      width: cw,
      height: ch,
      transparent: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundAlpha: 0
    });

    container.appendChild(App.pixiApp.view);
    App.pixiApp.view.style.width = '100%';
    App.pixiApp.view.style.height = '100%';

    // Load Live2D model
    const model = currentModel();
    App.live2dModel = await PIXI.live2d.Live2DModel.from(model.url);

    if (App.live2dModel) {
      placeholder.style.display = 'none';

      // Fill ~90% width, ~85% height, centered slightly low
      let scaleX = (cw / App.live2dModel.width) * 0.90;
      let scaleY = (ch / App.live2dModel.height) * 0.85;
      let scale = Math.min(scaleX, scaleY);
      if (model.scaleBoost) scale *= model.scaleBoost;
      App.live2dModel.scale.set(scale);
      App.live2dModel.x = cw / 2;
      App.live2dModel.y = ch * 0.48;
      App.live2dModel.anchor.set(0.5, 0.5);

      // Hook beforeModelUpdate: apply eye target + MediaPipe face tracking
      if (model.sleepyWakeLock) {
        _eyeTarget = 1;
      }
      App.live2dModel.internalModel.on('beforeModelUpdate', () => {
        try {
          const cm = App.live2dModel.internalModel.coreModel;

          // Base eye state
          let eyeLOpen = model.sleepyWakeLock ? _eyeTarget : 1;
          let eyeROpen = model.sleepyWakeLock ? _eyeTarget : 1;

          // Apply MediaPipe face blendshapes (if camera active)
          if (MediaPipeBridge.active && MediaPipeBridge.blendshapes) {
            const bs = MediaPipeBridge.blendshapes;
            // Eye blink → eye open (inverted, amplified for visibility)
            const blinkL = bs.eyeBlinkLeft || 0;
            const blinkR = bs.eyeBlinkRight || 0;
            eyeLOpen = 1 - blinkL * 1.3;
            eyeROpen = 1 - blinkR * 1.3;

            // Jaw open → mouth open (amplified)
            const jaw = bs.jawOpen || 0;
            cm.setParameterValueById('ParamMouthOpenY', jaw * 1.5);

            // Smile → mouth form (stronger response)
            const smileL = bs.mouthSmileLeft || 0;
            const smileR = bs.mouthSmileRight || 0;
            const smile = ((smileL + smileR) / 2) * 1.8;
            cm.setParameterValueById('ParamMouthForm', smile);

            // Frown → negative mouth form
            const frownL = bs.mouthFrownLeft || 0;
            const frownR = bs.mouthFrownRight || 0;
            const frown = (frownL + frownR) / 2;
            if (frown > smile) {
              cm.setParameterValueById('ParamMouthForm', -frown * 1.5);
            }

            // Eyebrows up (surprise)
            const browUp = bs.browInnerUp || 0;
            if (browUp > 0.05) {
              cm.setParameterValueById('ParamBrowLY', browUp * 1.8);
              cm.setParameterValueById('ParamBrowRY', browUp * 1.8);
            }

            // Eyebrows down (angry)
            const browDL = bs.browDownLeft || 0;
            const browDR = bs.browDownRight || 0;
            if (browDL > 0.05 || browDR > 0.05) {
              cm.setParameterValueById('ParamBrowLY', -(browDL + browDR) * 0.8);
              cm.setParameterValueById('ParamBrowRY', -(browDL + browDR) * 0.8);
            }
          }

          // Lip sync (audio-driven, overrides face tracking jaw)
          const lipSyncVal = MediaPipeBridge.lipSyncMouth;
          if (lipSyncVal !== null) {
            cm.setParameterValueById('ParamMouthOpenY', lipSyncVal * 0.8);
          }

          cm.setParameterValueById('ParamEyeLOpen', eyeLOpen);
          cm.setParameterValueById('ParamEyeROpen', eyeROpen);
        } catch(e) {}
      });

      App.pixiApp.stage.addChild(App.live2dModel);

      // Click interaction (except panda-cake)
      if (App.currentModelKey !== 'panda-cake') {
        App.live2dModel.interactive = true;
        App.live2dModel.on('pointerdown', (e) => {
          const localY = e.data.getLocalPosition(App.live2dModel).y;
          const modelHeight = App.live2dModel.height;
          const relY = (localY + modelHeight / 2) / modelHeight;

          const expressions = model.clickExpressions;
          const idx = Math.floor(relY * expressions.length);
          const expr = expressions[Math.min(idx, expressions.length - 1)];

          try { App.live2dModel.expression(expr); } catch (e) { /* expression may not exist */ }
        });
      }

      // Close verbose logging, play default motion
      try { PIXI.live2d.config.logLevel = 2; } catch(e) {}
      if (model.motions && model.motions.length > 0) {
        const defaultMotion = model.motions.includes('Walk') ? 'Walk' : model.motions[0];
        try {
          App.live2dModel.motion(defaultMotion, 0);
          _currentMotion = defaultMotion;
        } catch (e) { /* skip */ }
      }

      // Hide watermark/text params for models that have them
      if (model.hideParams) {
        const cm = App.live2dModel.internalModel.coreModel;
        model.hideParams.forEach(paramId => {
          try { cm.setParameterValueById(paramId, 0); } catch(e) {}
        });
        try { cm.setPartOpacityById('Part22', 0); } catch(e) {}

        // Persist every frame via ticker (animations may reset params)
        App.pixiApp.ticker.add(() => {
          if (!App.live2dModel) return;
          const cm2 = App.live2dModel.internalModel.coreModel;
          model.hideParams.forEach(paramId => {
            try { cm2.setParameterValueById(paramId, 0); } catch(e) {}
          });
          try { cm2.setPartOpacityById('Part22', 0); } catch(e) {}
        });
      }

      // Start random idle expressions
      startIdleTimer();

      updateModelSwitchButton();
      updateOnlineStatus();
      showToast(model.name + ' 已就绪 ✨');
    }
  } catch (err) {
    console.error('[Live2D] init failed:', err.message || err);
    console.error('[Live2D] stack:', err.stack);
    placeholder.textContent = 'Live2D\n(' + (err.message || '加载失败') + ')';
    placeholder.style.cursor = 'pointer';
    placeholder.onclick = () => { location.reload(); };
  }
}

// ============ Model Switching ============
function updateModelSwitchButton() {
  const btn = document.getElementById('btn-model-switch');
  if (!btn) return;
  if (typeof iconHtml === 'function') btn.innerHTML = iconHtml('avatar', '人物');
  else btn.textContent = '人物';
  // Update active state in the selector panel
  document.querySelectorAll('.model-select-card').forEach(card => {
    card.classList.toggle('active', card.dataset.model === App.currentModelKey);
  });
}

const MODAL_EXIT_DURATION = 260;
let modelSelectorCloseTimer = null;
let voiceSelectorCloseTimer = null;

function openModelSelector() {
  updateModelSwitchButton();
  const overlay = document.getElementById('model-select-overlay');
  if (!overlay) return;
  if (modelSelectorCloseTimer) {
    clearTimeout(modelSelectorCloseTimer);
    modelSelectorCloseTimer = null;
  }
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('is-entered'));
}

function closeModelSelector() {
  const overlay = document.getElementById('model-select-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-entered');
  if (modelSelectorCloseTimer) clearTimeout(modelSelectorCloseTimer);
  modelSelectorCloseTimer = setTimeout(() => {
    modelSelectorCloseTimer = null;
    if (!overlay.classList.contains('is-entered')) {
      overlay.style.display = 'none';
    }
  }, MODAL_EXIT_DURATION);
}

async function selectModel(modelKey) {
  closeModelSelector();
  if (App.currentModelKey === modelKey) return;
  await switchModel(modelKey);
}

async function switchModel(modelKey) {
  if (App._switchingModel || App.currentModelKey === modelKey) return;
  App._switchingModel = true;
  App.currentModelKey = modelKey;

  // Reset state
  if (App.idleTimer) { clearInterval(App.idleTimer); App.idleTimer = null; }
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  _sleepyEyeOff();
  _motionLocked = false;
  _inSleepy = false;
  _eyeTarget = 1;
  _currentMotion = '';

  await initLive2D();
  App._switchingModel = false;
}

// ============ Live2D Interaction Helpers ============
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let _flashTimer = null;
let _motionLocked = false;   // when true, idle timer won't switch motion
let _currentMotion = 'Walk';
let _inSleepy = false;       // true = ticker-based sleep (栖灵), false = awake
let _eyeTarget = 1;          // 1 = open, 0 = closed — read by permanent ticker
App.lastTypingTime = Date.now();

// Properly clear expression using internal reset (model.expression() = random!)
function clearExpr() {
  if (!App.live2dModel) return;
  try {
    const em = App.live2dModel.internalModel.motionManager.expressionManager;
    if (em) em.resetExpression();
  } catch(e) {}
}

// Flash an expression briefly then properly clear. No races.
function flashExpr(expr, ms) {
  if (!App.live2dModel || !expr) return;
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  clearExpr();
  try { App.live2dModel.expression(expr); } catch(e) {}
  _flashTimer = setTimeout(() => {
    _flashTimer = null;
    clearExpr();
  }, ms || 2000);
}

let _sleepyEyeTicker = null;

function _sleepyEyeOff() {
  if (_sleepyEyeTicker) {
    try { App.pixiApp.ticker.remove(_sleepyEyeTicker); } catch(e) {}
    _sleepyEyeTicker = null;
  }
}

// Switch motion — pure motion swap, no sleep state logic
function switchMotion(name, lock) {
  if (!App.live2dModel) return;
  if (typeof lock === 'boolean') {
    _motionLocked = lock;
    if (lock === false && _currentMotion === name) return;
  }
  if (_currentMotion === name) return;
  if (_flashTimer) { clearTimeout(_flashTimer); _flashTimer = null; }
  clearExpr();

  try {
    App.live2dModel.motion(name, 0);
    _currentMotion = name;
    console.log('[motion] playing ' + name);
  } catch(e) {
    console.log('[motion] FAILED ' + name + ': ' + e.message);
  }

  // Per-frame eye lock for 沐沐 during Sleepy motion
  const model = currentModel();
  if (name === model.sleepyMotion && model.sleepyEyeLock) {
    _sleepyEyeTicker = () => {
      try {
        const cm = App.live2dModel.internalModel.coreModel;
        cm.setParameterValueById('ParamEyeLOpen', 0);
        cm.setParameterValueById('ParamEyeROpen', 0);
      } catch(e) {}
    };
    App.pixiApp.ticker.add(_sleepyEyeTicker);
  }
}

function startIdleTimer() {
  if (App.idleTimer) clearInterval(App.idleTimer);
  App.idleTimer = setInterval(() => {
    if (!App.live2dModel || App._sending) return;
    const model = currentModel();
    if (!model.motions || model.motions.length === 0) return;

    const idleSec = (Date.now() - App.lastTypingTime) / 1000;

    // 30s no interaction → enter sleep mode
    if (idleSec >= 30 && !_motionLocked && !_inSleepy) {
      _motionLocked = true;

      if (model.sleepyWakeLock) {
        // 栖灵: just set _eyeTarget — beforeModelUpdate hook enforces it every frame
        console.log('[idle] 30s reached, entering sleep');
        _inSleepy = true;
        _eyeTarget = 0;
        if (model.sleepyExprs) {
          setTimeout(() => {
            if (!_inSleepy) return;
            try { App.live2dModel.expression(pick(model.sleepyExprs)); } catch(e) {}
          }, 300);
        }
      } else if (model.sleepyMotion) {
        // 沐沐: motion-based sleep
        console.log('[idle] 30s reached, entering Sleepy motion');
        switchMotion(model.sleepyMotion, true);
        if (model.sleepyExprs) {
          setTimeout(() => {
            try { App.live2dModel.expression(pick(model.sleepyExprs)); } catch(e) {}
          }, 300);
        }
      }
      return;
    }

    if (_motionLocked) return;

    // Cycle random idle motions
    const sleepyMotion = model.sleepyMotion;
    const idleMotions = model.idleMotions || model.motions.filter(m => m !== sleepyMotion);
    const available = idleMotions.filter(m => m !== _currentMotion);
    const next = available.length > 0 ? pick(available) : idleMotions[0];
    console.log('[idle] switching to ' + next);
    switchMotion(next);
    setTimeout(() => {
      flashExpr(pick(model.idleExprs), 2000);
    }, 300);
  }, 8000);
}

// User sends message — wake from sleep, unlock, get excited
function live2dOnUserMessage() {
  if (!App.live2dModel) return;
  const model = currentModel();
  App.lastTypingTime = Date.now();

  // Exit ticker-based sleep (栖灵)
  if (_inSleepy) {
    _inSleepy = false;
    _eyeTarget = 1;
    clearExpr();       // remove sleepy expression (熊猫抱枕/脸黑)
  }

  _motionLocked = false;
  if (model.motions && model.motions.length > 0) {
    const motion = model.motions.includes('Walk') ? 'Walk' : model.motions[0];
    switchMotion(motion);
  }
  setTimeout(() => flashExpr(pick(model.userMessageExprs || model.walkExprs), 2500), 200);
}

// AI thinking — lock to prevent idle cycle from switching, but stay awake
function live2dOnAIStart() {
  if (!App.live2dModel || _inSleepy) return;
  const model = currentModel();
  _motionLocked = true;  // prevent idle timer from changing motion
  setTimeout(() => flashExpr(model.aiStartExpr || model.sleepyExprs[0], 3000), 300);
}

// AI done — unlock, back to walk, happy
function live2dOnAIEnd() {
  if (!App.live2dModel || _inSleepy) return;
  const model = currentModel();
  _motionLocked = false;
  if (model.motions && model.motions.length > 0) {
    const motion = model.motions.includes('Walk') ? 'Walk' : model.motions[0];
    switchMotion(motion);
  }
  setTimeout(() => flashExpr(model.aiEndExpr || model.walkExprs[0], 2500), 400);
}

// ============ Navigation ============
function initNavigation() {
  document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      const panel = item.dataset.panel;
      switchPanel(panel);
    });
  });

  // Also handle label clicks
  document.querySelectorAll('.nav-label').forEach((label, i) => {
    label.addEventListener('click', () => {
      const items = document.querySelectorAll('.nav-item[data-panel]');
      if (items[i]) switchPanel(items[i].dataset.panel);
    });
  });
}

function switchPanel(panel) {
  App.currentPanel = panel;
  document.getElementById('app')?.classList.toggle('call-panel-active', panel === 'call');

  // Update nav
  document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
    item.classList.toggle('active', item.dataset.panel === panel);
  });
  document.querySelectorAll('.nav-label').forEach((label, i) => {
    const items = document.querySelectorAll('.nav-item[data-panel]');
    label.classList.toggle('active', items[i] && items[i].dataset.panel === panel);
  });

  // Update panels
  document.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + panel);
  if (targetPanel) targetPanel.classList.add('active');

  // Load content for each panel
  if (panel === 'moments') loadMoments();
  if (panel === 'diary') loadDiaries();
  if (panel === 'call') startCall();
}

// ============ Auth ============
function initAuth() {
  const saved = localStorage.getItem('xiling_token');
  if (saved) {
    App.token = saved;
    API.token = saved;
    API.getProfile().then(data => {
      if (data.user) {
        if (data.token) {
          App.token = data.token;
          API.token = data.token;
          localStorage.setItem('xiling_token', data.token);
        }
        App.user = data.user;
        showApp();
      } else {
        localStorage.removeItem('xiling_token');
        showLogin();
      }
    }).catch(() => {
      localStorage.removeItem('xiling_token');
      showLogin();
    });
  } else {
    showLogin();
  }

  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('login-switch-link').addEventListener('click', toggleLoginMode);

  document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
}

let loginMode = 'login'; // 'login' | 'register'

function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!username || username.length < 2) return showToast('用户名至少2个字符', 'warning');

  const action = loginMode === 'register' ? API.register(username, password) : API.login(username, password);

  action.then(data => {
    if (data.error) return showToast(data.error, 'danger');
    App.token = data.token;
    API.token = data.token;
    localStorage.setItem('xiling_token', data.token);
    App.user = data.user || { id: data.user_id, affection_level: 1, affection_points: 0, day_mode: 1 };
    showApp();
  });
}

function toggleLoginMode() {
  loginMode = loginMode === 'login' ? 'register' : 'login';
  document.getElementById('login-btn').textContent = loginMode === 'register' ? '注册' : '进入';
  document.getElementById('login-switch-link').textContent = loginMode === 'register' ? '已有账号？点击登录' : '没有账号？点击注册';
}

function showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  updateAffectionUI();
  initLive2D();
  initNavigation();
  initChat();
  initMood();
  initMoments();
  initVoiceSelector();
  initAccountSecurity();
  loadTodaysMood();
}

// ============ Affection UI ============
function updateAffectionUI() {
  if (!App.user) return;
  const level = App.user.affection_level || 1;
  const points = App.user.affection_points || 0;
  const threshold = 100;
  const percent = Math.min(100, Math.round((points / threshold) * 100));

  document.getElementById('aff-level').textContent = level;
  document.getElementById('aff-points').textContent = points;
  document.getElementById('aff-threshold').textContent = threshold;
  document.getElementById('aff-progress-bar').style.width = percent + '%';
}

function refreshUserProfile() {
  API.getProfile().then(data => {
    if (data.user) {
      App.user = data.user;
      updateAffectionUI();
    }
  });
}

// ============ Account Security ============
function initAccountSecurity() {
  if (App._accountSecurityBound) return;
  App._accountSecurityBound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('#btn-account-security');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openAccountSecurity();
  }, true);
  document.getElementById('btn-account-close')?.addEventListener('click', closeAccountSecurity);
  document.getElementById('account-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAccountSecurity();
  });
  document.getElementById('btn-export-data')?.addEventListener('click', handleExportData);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-delete-account')?.addEventListener('click', handleDeleteAccount);
}

function openAccountSecurity() {
  const overlay = document.getElementById('account-overlay');
  if (!overlay) return;
  document.getElementById('account-display-name').textContent = App.user?.display_name || App.user?.username || '当前用户';
  document.getElementById('account-user-id').textContent = App.user?.id ? `用户 ID：${App.user.id} · 安全会话已启用` : '安全会话已启用';
  overlay.classList.add('is-open');
  if (location.hash !== '#account-overlay') history.replaceState(null, '', '#account-overlay');
}

function closeAccountSecurity() {
  const overlay = document.getElementById('account-overlay');
  if (overlay) overlay.classList.remove('is-open');
  if (location.hash === '#account-overlay') history.replaceState(null, '', location.pathname + location.search);
}

async function handleExportData() {
  const data = await API.exportUserData();
  if (data.error) return showToast(data.error, 'danger');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xiling-export-${App.user?.id || 'user'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('数据已导出', 'success');
}

async function handleLogout() {
  await API.logout().catch(() => null);
  localStorage.removeItem('xiling_token');
  App.user = null;
  App.token = null;
  API.token = null;
  closeAccountSecurity();
  showLogin();
  showToast('已退出登录');
}

async function handleDeleteAccount() {
  const firstConfirm = confirm('删除账号会清除你的聊天、心情、日记等个人数据，且不可恢复。确定继续吗？');
  if (!firstConfirm) return;
  const password = prompt('请输入当前密码以确认删除账号：');
  if (password === null) return;
  const finalConfirm = prompt('最后确认：请输入 DELETE 删除账号');
  if (finalConfirm !== 'DELETE') return showToast('已取消删除账号', 'warning');

  const data = await API.deleteAccount(password);
  if (data.error) return showToast(data.error, 'danger');
  localStorage.removeItem('xiling_token');
  App.user = null;
  App.token = null;
  API.token = null;
  closeAccountSecurity();
  showLogin();
  showToast('账号已删除');
}

// ============ Day/Night Mode & Model Selector ============
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-day-night').addEventListener('click', toggleDayNight);
  document.getElementById('btn-model-switch').addEventListener('click', openModelSelector);
  document.getElementById('btn-model-select-close').addEventListener('click', closeModelSelector);
  // Close overlay on backdrop click
  document.getElementById('model-select-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModelSelector();
  });
  // Model card clicks
  document.querySelectorAll('.model-select-card').forEach(card => {
    card.addEventListener('click', () => selectModel(card.dataset.model));
  });
});

function toggleDayNight() {
  App.dayMode = !App.dayMode;
  const btn = document.getElementById('btn-day-night');
  const root = document.documentElement;

  if (App.dayMode) {
    btn.textContent = '🌙';
    root.style.setProperty('--bg-deep', '#0c0f19');
    root.style.setProperty('--bg-nav', '#090c14');
    root.style.setProperty('--bg-content', '#0d101c');
    root.style.setProperty('--bg-panel', '#181d33');
    root.style.setProperty('--bg-input', '#151d35');
    root.style.setProperty('--text-primary', '#d1d5db');
    root.style.setProperty('--text-secondary', '#cbd5e1');
    root.style.setProperty('--text-muted', '#5a6070');
    root.style.setProperty('--border-normal', '#ffffff08');
    root.style.setProperty('--bg-live2d-start', '#0f1222');
    root.style.setProperty('--bg-live2d-mid', '#13182c');
    root.style.setProperty('--bg-live2d-end', '#0e1020');
    root.style.setProperty('--overlay-bg', 'rgba(21, 26, 48, 0.8)');
    root.style.setProperty('--overlay-progress', '#2a3050');
  } else {
    btn.textContent = '☀️';
    root.style.setProperty('--bg-deep', '#f8f6f2');
    root.style.setProperty('--bg-nav', '#f0eee8');
    root.style.setProperty('--bg-content', '#fafaf8');
    root.style.setProperty('--bg-panel', '#ffffff');
    root.style.setProperty('--bg-input', '#f5f3ef');
    root.style.setProperty('--text-primary', '#3d3028');
    root.style.setProperty('--text-secondary', '#5c4d40');
    root.style.setProperty('--text-muted', '#9c8b78');
    root.style.setProperty('--border-normal', '#e0d8cc');
    root.style.setProperty('--bg-live2d-start', '#f5f0e8');
    root.style.setProperty('--bg-live2d-mid', '#ede6da');
    root.style.setProperty('--bg-live2d-end', '#f8f4ee');
    root.style.setProperty('--overlay-bg', 'rgba(255, 255, 255, 0.75)');
    root.style.setProperty('--overlay-progress', '#e0d8cc');
  }
}

// ============ Toast ============
function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ Resize Handler ============
window.addEventListener('resize', () => {
  if (App.pixiApp && App.live2dModel) {
    const container = document.getElementById('live2d-container');
    const model = currentModel();
    App.pixiApp.renderer.resize(container.clientWidth, container.clientHeight);
    let scaleX = (container.clientWidth / App.live2dModel.width) * 0.90;
    let scaleY = (container.clientHeight / App.live2dModel.height) * 0.85;
    let scale = Math.min(scaleX, scaleY);
    if (model.scaleBoost) scale *= model.scaleBoost;
    App.live2dModel.scale.set(scale);
    App.live2dModel.x = container.clientWidth / 2;
    App.live2dModel.y = container.clientHeight * 0.48;
  }
});

// ============ Voice Selector ============
const VOICE_DESCS = [
  '温柔知性', '甜美可人', '柔情似水', '清新自然', '冰霜优雅'
];

function initVoiceSelector() {
  const saved = localStorage.getItem('xiling_tts_speaker');
  if (saved !== null) App.ttsSpeaker = parseInt(saved) || 0;
  const overlay = document.getElementById('voice-select-overlay');

  function openVoiceSelector() {
    if (!overlay) return;
    if (voiceSelectorCloseTimer) {
      clearTimeout(voiceSelectorCloseTimer);
      voiceSelectorCloseTimer = null;
    }
    overlay.classList.add('active');
    requestAnimationFrame(() => overlay.classList.add('is-entered'));
  }

  function closeVoiceSelector() {
    if (!overlay) return;
    overlay.classList.remove('is-entered');
    if (voiceSelectorCloseTimer) clearTimeout(voiceSelectorCloseTimer);
    voiceSelectorCloseTimer = setTimeout(() => {
      voiceSelectorCloseTimer = null;
      if (!overlay.classList.contains('is-entered')) {
        overlay.classList.remove('active');
      }
    }, MODAL_EXIT_DURATION);
  }

  function updateLabel() {
    const label = document.getElementById('voice-name-display');
    if (label) label.textContent = App.ttsSpeakers[App.ttsSpeaker];
  }

  function updateCards() {
    document.querySelectorAll('.voice-select-card').forEach(card => {
      card.classList.toggle('active', parseInt(card.dataset.voice) === App.ttsSpeaker);
    });
  }

  function setVoice(index, { closeOverlay = false, announce = false } = {}) {
    if (!App.ttsSpeakers.length) return;
    const count = App.ttsSpeakers.length;
    App.ttsSpeaker = ((index % count) + count) % count;
    localStorage.setItem('xiling_tts_speaker', App.ttsSpeaker);
    updateLabel();
    updateCards();
    if (closeOverlay) closeVoiceSelector();
    if (announce) showToast('朗读音色: ' + App.ttsSpeakers[App.ttsSpeaker]);
  }

  function cycleVoice(delta) {
    setVoice((App.ttsSpeaker || 0) + delta, { announce: true });
  }

  function buildCards() {
    const container = document.getElementById('voice-select-options');
    if (!container) return;
    container.innerHTML = App.ttsSpeakers.map((name, i) =>
      `<div class="voice-select-card${i === App.ttsSpeaker ? ' active' : ''}" data-voice="${i}">
        <div class="voice-select-card-num">${i + 1}</div>
        <div>
          <div class="voice-select-card-name">${name}</div>
          <div class="voice-select-card-desc">${VOICE_DESCS[i]}</div>
        </div>
      </div>`
    ).join('');

    // Bind clicks
    container.querySelectorAll('.voice-select-card').forEach(card => {
      card.addEventListener('click', () => {
        setVoice(parseInt(card.dataset.voice), { closeOverlay: true, announce: true });
      });
    });
  }

  document.getElementById('btn-voice-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleVoice(-1);
  });

  document.getElementById('btn-voice-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleVoice(1);
  });

  // Open overlay when clicking the voice area in nav
  document.getElementById('nav-voice-selector')?.addEventListener('click', () => {
    buildCards();
    openVoiceSelector();
    // Scroll to active voice
    setTimeout(() => {
      const active = document.querySelector('.voice-select-card.active');
      if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  });

  // Close button
  document.getElementById('btn-voice-select-close')?.addEventListener('click', closeVoiceSelector);

  // Close on backdrop click
  overlay?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeVoiceSelector();
    }
  });

  updateLabel();
}

// ============ Camera / MediaPipe Toggle ============
let _lastGestureTime = 0;
const GESTURE_COOLDOWN = 2000; // ms between gesture triggers

// Gesture → Live2D action mapping
const GESTURE_ACTIONS = {
  'Thumbs_Up':   { expr: '星星眼', label: '点赞' },
  'Victory':     { expr: '爱心眼', label: '比耶' },
  'ILoveYou':    { expr: '脸红', label: '比心' },
  'Closed_Fist': { expr: '戳脸', label: '握拳' },
  'Open_Palm':   { expr: '爱心眼', label: '张开手掌' },
  'Pointing_Up': { expr: '眼镜', label: '指上' }
};

function setupGestureCallback() {
  MediaPipeBridge.onGesture = (gesture) => {
    const now = Date.now();
    if (now - _lastGestureTime < GESTURE_COOLDOWN) return;

    const action = GESTURE_ACTIONS[gesture.name];
    if (!action || gesture.confidence < 0.7) return;

    _lastGestureTime = now;
    const model = currentModel();

    // Flash the expression
    if (action.expr && App.live2dModel) {
      flashExpr(action.expr, 2500);
    }

    // Play a motion for some gestures
    if (gesture.name === 'Closed_Fist' && model.motions && model.motions.length > 0) {
      if (!App._sending) switchMotion(model.motions[0], false);
    }

    showToast(`手势: ${action.label} ✨`);
  };
}

async function toggleCamera() {
  const btn = document.getElementById('btn-camera-toggle');
  const preview = document.getElementById('face-preview');
  if (!btn) return;

  if (MediaPipeBridge.active) {
    MediaPipeBridge.stop();
    btn.classList.remove('active');
    btn.title = '开启摄像头面捕';
    if (preview) preview.style.display = 'none';
    showToast('摄像头已关闭 📷');
  } else {
    setupGestureCallback();
    const ok = await MediaPipeBridge.start();
    if (ok) {
      btn.classList.add('active');
      btn.title = '关闭摄像头面捕';
      if (preview) preview.style.display = 'block';
      // Wake character from sleep when camera is enabled
      if (_inSleepy) {
        _inSleepy = false;
        _eyeTarget = 1;
        clearExpr();
      }
      _motionLocked = false;
      // Init drag for preview window
      initFacePreviewDrag();
      showToast('面捕+手势已开启 ✨');
    } else {
      showToast('无法访问摄像头', 'warning');
    }
  }
}

// Make face preview window draggable
function initFacePreviewDrag() {
  const overlay = document.getElementById('face-preview');
  if (!overlay || overlay._dragInit) return;
  overlay._dragInit = true;

  let dragging = false, startX, startY, origX, origY;
  overlay.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origX = overlay.offsetLeft; origY = overlay.offsetTop;
    overlay.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
    overlay.style.left = (origX + e.clientX - startX) + 'px';
    overlay.style.top = (origY + e.clientY - startY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    if (overlay) overlay.style.cursor = 'move';
  });
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
