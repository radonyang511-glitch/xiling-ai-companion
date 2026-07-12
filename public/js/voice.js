// ============ Shared AudioPlayer Utility ============
const AudioPlayer = {
  _audio: null,
  _ttsAvailable: true,
  _onEndCallbacks: [],
  _audioCtx: null,
  _analyser: null,
  _lipSyncRaf: null,
  _queue: [],        // Queued audio URLs for streaming playback
  _queueIdx: 0,
  _playing: false,
  _fetchDone: true,   // true when background sentence fetch is complete
  _speakId: 0,        // Incremented per speak()/stop() — cancels stale async work

  get available() { return this._ttsAvailable; },

  // Lazy-init AudioContext
  _ensureAudioCtx() {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 64;
      this._analyser.smoothingTimeConstant = 0.4;
    }
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    return this._audioCtx;
  },

  _startLipSync(audioEl) {
    this._stopLipSync();
    try {
      const ctx = this._ensureAudioCtx();
      const src = ctx.createMediaElementSource(audioEl);
      src.connect(this._analyser);
      src.connect(ctx.destination);
    } catch(e) { return; }
    this._lipSyncLoop();
  },

  _stopLipSync() {
    if (this._lipSyncRaf) { cancelAnimationFrame(this._lipSyncRaf); this._lipSyncRaf = null; }
    if (typeof MediaPipeBridge !== 'undefined') MediaPipeBridge.setLipSync(0);
  },

  _lipSyncLoop() {
    if (!this._analyser || !this.isPlaying()) { this._stopLipSync(); return; }
    this._lipSyncRaf = requestAnimationFrame(() => this._lipSyncLoop());
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(data);
    let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i];
    const mouth = Math.max(0, (sum / data.length - 15) / 180);
    if (typeof MediaPipeBridge !== 'undefined') MediaPipeBridge.setLipSync(mouth);
  },

  // Clean text for reading: remove parenthetical content
  _cleanText(text) {
    return text
      .replace(/[（(][^）)]*[）)]/g, '')   // Chinese/English parentheses
      .replace(/【[^】]*】/g, '')           // 【】
      .replace(/《[^》]*》/g, '')           // 《》
      .replace(/<[^>]*>/g, '')             // < >
      .replace(/\[[^\]]*\]/g, '')          // [ ]
      .replace(/\s+/g, ' ')                // Collapse whitespace
      .trim();
  },

  // Split text at punctuation for streaming (text should already be cleaned)
  _splitText(text) {
    const parts = text.split(/(?<=[。！？.!?\n])|(?<=[，,；;：:、])/);
    const result = [];
    for (const p of parts) { const t = p.trim(); if (t) result.push(t); }
    return result.length > 0 ? result : [text.trim()];
  },

  // Fetch TTS for a single sentence, return Audio element
  async _fetchSentence(text) {
    if (!this._ttsAvailable) return null;
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + App.token },
        body: JSON.stringify({ text, speaker: App.ttsSpeaker || 0 })
      });
      const data = await res.json();
      if (!data.audio || data.fallback) { if (data.fallback) this._ttsAvailable = false; return null; }

      const binary = atob(data.audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      return new Audio(URL.createObjectURL(blob));
    } catch(e) { this._ttsAvailable = false; return null; }
  },

  // Play next queued item with pause between sentences
  _playNext(sid) {
    if (!this._playing) return;
    if (sid !== this._speakId) return;   // Stale call — newer speak/stop happened

    // Wait for next sentence if buffer is empty (still fetching)
    if (this._queueIdx >= this._queue.length) {
      if (this._fetchDone) {
        // All sentences fetched and played — end of playback
        this._playing = false;
        this._stopLipSync();
        this._notifyEnd(sid);
        return;
      }
      this._waitTimer = setTimeout(() => this._playNext(sid), 80);
      return;
    }

    const audio = this._queue[this._queueIdx++];
    if (!audio) { this._playNext(sid); return; }

    // Short pause before playing (natural comma/period break)
    setTimeout(() => {
      if (!this._playing || sid !== this._speakId) return;
      this._audio = audio;
      audio.onended = () => this._playNext(sid);
      this._startLipSync(audio);
      audio.play().catch(() => this._playNext(sid));
    }, 120);
  },

  // Stream: pre-fetch first 2 sentences, then play while fetching rest
  async speak(rawText) {
    this.stop();
    const sid = ++this._speakId;

    const text = this._cleanText(rawText);
    if (!text) return null;

    const sentences = this._splitText(text);
    if (sentences.length === 0) return null;

    // Reset TTS availability for retry
    this._ttsAvailable = true;

    // Pre-fetch first 2 sentences (or all if fewer than 2)
    const preFetchCount = Math.min(2, sentences.length);
    const firstBatch = [];
    for (let i = 0; i < preFetchCount; i++) {
      const a = await this._fetchSentence(sentences[i]);
      if (a) firstBatch.push(a);
    }
    if (this._speakId !== sid) return null;   // Cancelled during fetch
    if (firstBatch.length === 0) return this._speakBrowser(text);

    this._playing = true;
    this._queue = firstBatch;
    this._queueIdx = 0;

    // Pre-fetch remaining sentences in background
    if (sentences.length > preFetchCount) {
      this._fetchDone = false;
      (async () => {
        for (let i = preFetchCount; i < sentences.length; i++) {
          if (!this._playing || this._speakId !== sid) break;
          const a = await this._fetchSentence(sentences[i]);
          if (a && this._playing && this._speakId === sid) this._queue.push(a);
        }
        // Mark fetch complete — if playback already exhausted the queue, trigger end
        this._fetchDone = true;
        if (this._playing && this._speakId === sid && this._queueIdx >= this._queue.length) {
          this._playing = false;
          this._stopLipSync();
          this._notifyEnd(sid);
        }
      })();
    } else {
      this._fetchDone = true;
    }

    // Start playing immediately (fast first response)
    this._audio = this._queue[this._queueIdx++];
    if (!this._audio) return null;
    this._audio.onended = () => this._playNext(sid);
    this._startLipSync(this._audio);
    this._audio.play().catch(() => this._playNext(sid));

    return this._audio;
  },

  _speakBrowser(rawText) {
    const text = this._cleanText(rawText);
    const synth = window.speechSynthesis;
    if (!synth) return null;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 1.1; u.volume = 0.9;
    const voices = synth.getVoices();
    const zh = voices.find(v => v.lang.startsWith('zh') && v.name.includes('Female')) || voices.find(v => v.lang.startsWith('zh')) || voices[0];
    if (zh) u.voice = zh;
    u.onstart = () => this._browserLipSyncStart();
    u.onend = () => { this._stopLipSync(); this._notifyEnd(0); };
    synth.speak(u);
    this._audio = { _synth: synth, _utterance: u, pause: () => { this._stopLipSync(); synth.cancel(); } };
    return this._audio;
  },

  _browserLipSyncStart() {
    let t = 0;
    const loop = () => {
      if (!this.isPlaying()) { this._stopLipSync(); return; }
      this._lipSyncRaf = requestAnimationFrame(loop);
      const mouth = 0.15 + 0.25 * Math.abs(Math.sin(t * 0.3)) * (0.5 + 0.5 * Math.sin(t * 0.17));
      if (typeof MediaPipeBridge !== 'undefined') MediaPipeBridge.setLipSync(mouth);
      t++;
    };
    this._lipSyncRaf = requestAnimationFrame(loop);
  },

  stop() {
    this._stopLipSync();
    if (this._waitTimer) { clearTimeout(this._waitTimer); this._waitTimer = null; }
    this._speakId++;               // Cancel any in-flight speak/playback
    this._queue = []; this._queueIdx = 0; this._playing = false; this._fetchDone = true;
    if (this._audio) {
      try {
        if (this._audio._synth) this._audio._synth.cancel();
        else { this._audio.pause(); this._audio.currentTime = 0; }
      } catch(e) {}
      this._audio = null;
    }
    this._onEndCallbacks = [];
  },

  isPlaying() {
    if (!this._audio) return false;
    if (this._audio._synth) return window.speechSynthesis.speaking;
    return !this._audio.paused;
  },

  onEnd(cb) {
    this._onEndCallbacks.push(cb);
  },

  _notifyEnd(sid) {
    if (sid !== 0 && sid !== this._speakId) return;   // Stale notification
    this._audio = null;
    const cbs = this._onEndCallbacks;
    this._onEndCallbacks = [];
    cbs.forEach(cb => { try { cb(); } catch(e) {} });
  }
};

// ============ Voice Call Module ============
let callRecognition = null;
let callLoopActive = false;
let callMuted = false;

// Call Live2D state
let callPixiApp = null;
let callLive2dModel = null;
let callModelKey = 'panda-cake';

// ============ Call Live2D ============
async function initCallLive2D() {
  const container = document.getElementById('call-live2d-container');
  if (!container) return;
  const placeholder = container.querySelector('.live2d-placeholder');

  // Clean up previous
  if (callLive2dModel) {
    try { callLive2dModel.destroy(); } catch(e) {}
    callLive2dModel = null;
  }
  if (callPixiApp) {
    try { callPixiApp.destroy(true, { children: true, texture: true }); } catch(e) {}
    callPixiApp = null;
  }
  const oldCanvas = container.querySelector('canvas');
  if (oldCanvas) oldCanvas.remove();

  // Check dependencies
  if (typeof PIXI === 'undefined' || typeof Live2DCubismCore === 'undefined' ||
      !PIXI.live2d || !PIXI.live2d.Live2DModel) {
    if (placeholder) placeholder.textContent = 'Live2D\n(库未加载)';
    return;
  }

  try {
    await new Promise(r => requestAnimationFrame(r));

    const cw = container.clientWidth || 300;
    const ch = container.clientHeight || 400;

    callPixiApp = new PIXI.Application({
      width: cw,
      height: ch,
      transparent: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundAlpha: 0
    });

    container.appendChild(callPixiApp.view);
    callPixiApp.view.style.width = '100%';
    callPixiApp.view.style.height = '100%';

    const model = MODELS[callModelKey];
    if (!model) {
      if (placeholder) placeholder.textContent = 'Live2D\n(模型未配置)';
      return;
    }

    callLive2dModel = await PIXI.live2d.Live2DModel.from(model.url);

    if (callLive2dModel) {
      if (placeholder) placeholder.style.display = 'none';

      let scaleX = (cw / callLive2dModel.width) * 0.96;
      let scaleY = (ch / callLive2dModel.height) * 0.92;
      let scale = Math.min(scaleX, scaleY);
      if (model.scaleBoost) scale *= model.scaleBoost;
      let maxScale = Math.min(cw / callLive2dModel.width, ch / callLive2dModel.height) * 0.92;
      scale = Math.min(scale, maxScale);
      callLive2dModel.scale.set(scale);
      callLive2dModel.x = cw / 2;
      callLive2dModel.y = ch * 0.46;
      callLive2dModel.anchor.set(0.5, 0.5);

      callPixiApp.stage.addChild(callLive2dModel);

      if (model.hideParams) {
        try { PIXI.live2d.config.logLevel = 2; } catch(e) {}
        const cm = callLive2dModel.internalModel.coreModel;
        model.hideParams.forEach(paramId => {
          try { cm.setParameterValueById(paramId, 0); } catch(e) {}
        });
        try { cm.setPartOpacityById('Part22', 0); } catch(e) {}

        callPixiApp.ticker.add(() => {
          if (!callLive2dModel) return;
          const cm2 = callLive2dModel.internalModel.coreModel;
          model.hideParams.forEach(paramId => {
            try { cm2.setParameterValueById(paramId, 0); } catch(e) {}
          });
          try { cm2.setPartOpacityById('Part22', 0); } catch(e) {}
        });
      }

      if (model.motions && model.motions.length > 0) {
        const defaultMotion = model.motions.includes('Walk') ? 'Walk' : model.motions[0];
        try { callLive2dModel.motion(defaultMotion, 0); } catch(e) {}
      }

      updateCallModelButtons();
    }
  } catch (err) {
    console.error('[Call Live2D] init failed:', err.message);
    if (placeholder) placeholder.textContent = 'Live2D\n(加载失败)';
  }
}

function callModelName() {
  return MODELS[callModelKey] ? MODELS[callModelKey].name : '栖灵';
}

function updateCallModelButtons() {
  document.querySelectorAll('.call-model-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.callModel === callModelKey);
  });
}

async function switchCallModel(key) {
  if (callModelKey === key) return;
  callModelKey = key;
  await initCallLive2D();
  if (callLoopActive) {
    document.getElementById('call-subtitle').textContent = callModelName() + '在听...';
  }
}

function destroyCallLive2D() {
  if (callLive2dModel) {
    try { callLive2dModel.destroy(); } catch(e) {}
    callLive2dModel = null;
  }
  if (callPixiApp) {
    try { callPixiApp.destroy(true, { children: true, texture: true }); } catch(e) {}
    callPixiApp = null;
  }
  const container = document.getElementById('call-live2d-container');
  if (container) {
    const oldCanvas = container.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();
    const placeholder = container.querySelector('.live2d-placeholder');
    if (placeholder) placeholder.style.display = '';
  }
}

// ============ Call Mode ============
function initCallMode() {
  document.getElementById('btn-call-end').addEventListener('click', endCall);
  document.getElementById('btn-call-mute').addEventListener('click', toggleMute);
  document.querySelectorAll('.call-model-btn').forEach(btn => {
    btn.addEventListener('click', () => switchCallModel(btn.dataset.callModel));
  });
}

function startCall() {
  if (App.callActive) {
    document.getElementById('call-overlay').classList.add('active');
    return;
  }

  App.callActive = true;
  callLoopActive = true;
  App.callSeconds = 0;
  clearInterval(App.callTimerInterval);

  document.getElementById('call-overlay').classList.add('active');
  document.getElementById('call-timer').textContent = '00:00';
  document.getElementById('call-status').textContent = '通话中...';
  document.getElementById('call-subtitle').textContent = callModelName() + '在听...';

  callModelKey = App.currentModelKey;
  updateCallModelButtons();
  initCallLive2D();

  App.callTimerInterval = setInterval(() => {
    App.callSeconds++;
    const m = Math.floor(App.callSeconds / 60).toString().padStart(2, '0');
    const s = (App.callSeconds % 60).toString().padStart(2, '0');
    document.getElementById('call-timer').textContent = m + ':' + s;
  }, 1000);

  speakText('喂？能听到我说话吗？今天想跟我聊什么呀？');

  setTimeout(() => {
    if (callLoopActive) startCallListening();
  }, 3000);
}

function endCall() {
  callLoopActive = false;
  App.callActive = false;

  clearInterval(App.callTimerInterval);
  stopCallListening();

  document.getElementById('call-overlay').classList.remove('active');

  stopAudio();

  destroyCallLive2D();

  setTimeout(() => initLive2D(), 150);

  if (App.currentPanel === 'call') switchPanel('chat');

  showToast('通话结束 📞');
}

function toggleMute() {
  callMuted = !callMuted;
  const btn = document.getElementById('btn-call-mute');
  if (callMuted) {
    btn.classList.add('muted');
    btn.title = '取消静音';
    stopAudio();
    stopCallListening();
  } else {
    btn.classList.remove('muted');
    btn.title = '静音';
    if (callLoopActive) startCallListening();
  }
}

function stopAudio() {
  AudioPlayer.stop();
}

async function speakText(text) {
  if (callMuted || !AudioPlayer.available) return null;
  return AudioPlayer.speak(text);
}

function startCallListening() {
  if (!callLoopActive || callMuted) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  callRecognition = new SpeechRecognition();
  callRecognition.lang = 'zh-CN';
  callRecognition.interimResults = false;
  callRecognition.continuous = false;

  callRecognition.onresult = async (event) => {
    const text = event.results[0][0].transcript.trim();
    if (!text || !callLoopActive) return;

    document.getElementById('call-subtitle').textContent = '你: ' + text;

    const exprCtx = (typeof getExpressionContext === 'function') ? getExpressionContext() : '';
    const messageWithExpr = exprCtx ? `${exprCtx}\n${text}` : text;

    try {
      let fullResponse = '';
      await API.sendMessageStream(messageWithExpr,
        (chunk, full) => { fullResponse = full; },
        () => {}
      );

      if (fullResponse && callLoopActive) {
        document.getElementById('call-subtitle').textContent = callModelName() + ': ' + fullResponse.substring(0, 30) + '...';

        await speakText(fullResponse);

        AudioPlayer.onEnd(() => {
          if (callLoopActive && !callMuted) {
            document.getElementById('call-subtitle').textContent = callModelName() + '在听...';
            setTimeout(() => startCallListening(), 500);
          }
        });

        if (!AudioPlayer.isPlaying() && callLoopActive && !callMuted) {
          document.getElementById('call-subtitle').textContent = callModelName() + '在听...';
          setTimeout(() => startCallListening(), 800);
        }
      }
    } catch (e) {
      if (callLoopActive) startCallListening();
    }
  };

  callRecognition.onerror = () => {
    if (callLoopActive && !callMuted) {
      setTimeout(() => startCallListening(), 1000);
    }
  };

  callRecognition.onend = () => {
    if (callLoopActive && !callMuted) {
      setTimeout(() => startCallListening(), 500);
    }
  };

  try { callRecognition.start(); } catch (e) { /* already started */ }
}

function stopCallListening() {
  if (callRecognition) {
    try { callRecognition.stop(); } catch (e) { /* ignore */ }
    callRecognition = null;
  }
}

// Init call mode
document.addEventListener('DOMContentLoaded', initCallMode);
