// ============ ReadAloud — standalone message read-back ============
// Buttons created by chat.js's _readBtnHtml() with onclick="ReadAloud.toggle(this)"
// Button is a SIBLING of .chat-bubble inside .chat-msg — we find text from there.
(function() {
  var _btn = null;
  var _sentences = [];    // sentence texts remaining to fetch/play
  var _nextIdx = 0;       // next sentence index to play
  var _queue = [];        // pre-fetched Audio elements ready to play
  var _fetching = false;  // background fetch in progress
  var _stopped = false;   // set true when user stops
  var _callbacks = [];

  var ICONS = {
    volume: '<svg viewBox="0 0 24 24"><path d="M5 9.4h3.1L13 5.6v12.8l-4.9-3.8H5z"/><path d="M16.2 9.1a4.4 4.4 0 0 1 0 5.8M18.6 6.8a7.8 7.8 0 0 1 0 10.4"/></svg>',
    stop:   '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10"/></svg>',
    spin:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="35" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>'
  };

  function _icon(btn, name, title) {
    btn.innerHTML = '<span class="ui-icon" aria-hidden="true">' + (ICONS[name] || ICONS.volume) + '</span>';
    btn.title = title || '';
  }

  function _stopAll() {
    _stopped = true;
    _sentences = []; _nextIdx = 0; _queue = []; _fetching = false;
    if (_btn) { _icon(_btn, 'volume', '朗读'); _btn.classList.remove('playing'); }
    _btn = null;
    _callbacks = [];
  }

  function _fireEnd() {
    var cbs = _callbacks;
    _callbacks = []; _stopped = true;
    _sentences = []; _nextIdx = 0; _queue = []; _fetching = false;
    if (_btn) { _icon(_btn, 'volume', '朗读'); _btn.classList.remove('playing'); }
    _btn = null;
    cbs.forEach(function(f) { try { f(); } catch(e) {} });
  }

  // Split text at punctuation boundaries
  function _split(text) {
    var parts = text.split(/(?<=[。！？.!?\n])|(?<=[，,；;：:、])/);
    var result = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t) result.push(t);
    }
    return result.length > 0 ? result : [text.trim()];
  }

  // Detect speech speed from punctuation and tone markers
  function _detectSpeed(text) {
    // Tone markers in parentheses: (笑)(温柔)(生气)(急)(紧张)(小声)(大声)(开心)(难过)(安慰)(撒娇)(严肃)(惊讶)(兴奋)(无奈)
    var tone = text.match(/[（(](笑|温柔|轻声|小声|安慰|难过|悲伤|无奈|撒娇|害羞|腼腆|委屈|困|累|叹息|叹气)[）)]/);
    if (tone) return 0.75;   // Gentle/sad/tired → slower

    tone = text.match(/[（(](生气|急|紧张|严肃|大声|吼|怒)[）)]/);
    if (tone) return 1.05;   // Angry/tense → faster

    tone = text.match(/[（(](开心|兴奋|激动|惊讶|惊喜|欢呼|耶)[）)]/);
    if (tone) return 0.95;   // Happy/excited → slightly faster

    // Punctuation-based
    if (/…{2,}|\.{3,}$/.test(text)) return 0.70;   // Trailing off...
    if (/[？?]$/.test(text))       return 0.82;     // Question → thoughtful
    if (/[！!]$/.test(text))       return 0.92;     // Exclamation → emphatic
    if (/[。.]$/.test(text))       return 0.85;     // Period → default

    return 0.85;  // Default
  }

  // Fetch TTS audio for one sentence with speed
  async function _fetchOne(text, speed) {
    try {
      var resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (App.token || '') },
        body: JSON.stringify({ text: text, speaker: App.ttsSpeaker || 0, speed: speed || 0.85 })
      });
      var data = await resp.json();
      if (!data.audio) return null;
      var bin = atob(data.audio);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
    } catch(e) { return null; }
  }

  // Background: fetch remaining sentences and push into queue
  async function _bgFetch(startIdx) {
    _fetching = true;
    for (var i = startIdx; i < _sentences.length; i++) {
      if (_stopped) break;
      var a = await _fetchOne(_sentences[i], _detectSpeed(_sentences[i]));
      if (_stopped) break;
      if (a) _queue.push({ audio: a, text: _sentences[i] });
    }
    _fetching = false;
  }

  // Determine pause duration based on sentence-ending punctuation
  function _pauseMs(sentence) {
    if (/…{2,}|\.{3,}/.test(sentence)) return 500;  // Ellipsis — longest pause
    var last = sentence.slice(-1);
    if (/[。！？.!?\n]/.test(last)) return 350;      // Period/exclamation/question
    if (/[，,；;：:、]/.test(last)) return 180;      // Comma/semicolon
    return 120;                                       // Minimal
  }

  // Play next queued audio with punctuation-based pause
  function _playNext() {
    if (_stopped) return;

    while (_queue.length > 0) {
      var item = _queue.shift();
      if (!item || !item.audio) continue;
      var pause = _pauseMs(item.text || '');
      setTimeout(function() {
        if (_stopped) return;
        item.audio.onended = function() { _playNext(); };
        item.audio.onerror = function() { _playNext(); };
        var p = item.audio.play();
        if (p) p.catch(function() { _playNext(); });
      }, pause);
      return;
    }

    // Queue empty — if still fetching, wait and retry
    if (_fetching) {
      setTimeout(function() { _playNext(); }, 80);
      return;
    }

    // All done
    _fireEnd();
  }

  // Main entry: start reading from a button
  async function _start(btn) {
    // Prepare text
    var bubble = btn.parentElement ? btn.parentElement.querySelector('.chat-bubble') : null;
    var text = (bubble || {}).textContent || '';
    text = text
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/【[^】]*】/g, '')
      .replace(/《[^》]*》/g, '')
      .trim();
    if (!text) return;

    _stopped = false;
    _sentences = _split(text);
    _nextIdx = 0;
    _queue = [];
    _fetching = false;

    // Pre-fetch first sentence only for fastest start
    var preFetch = Math.min(1, _sentences.length);
    for (var i = 0; i < preFetch; i++) {
      if (_stopped) return;
      var a = await _fetchOne(_sentences[i], _detectSpeed(_sentences[i]));
      if (_stopped) return;
      if (a) _queue.push({ audio: a, text: _sentences[i] });
    }
    _nextIdx = preFetch;

    // Bail if stopped during pre-fetch or button changed
    if (_stopped || _btn !== btn) return;

    // All pre-fetches failed → fall back to browser TTS
    if (_queue.length === 0) {
      var synth = window.speechSynthesis;
      if (!synth) { _fireEnd(); return; }
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 1.1; u.volume = 0.9;
      var voices = synth.getVoices();
      var zh = voices.find(function(v) { return v.lang.startsWith('zh'); });
      if (zh) u.voice = zh;
      u.onend   = function() { _fireEnd(); };
      u.onerror = function() { _fireEnd(); };
      synth.speak(u);
      return;
    }

    // Show stop icon — audio is about to play
    _icon(btn, 'stop', '停止朗读');

    // Start background fetching of remaining sentences
    if (_nextIdx < _sentences.length) {
      _bgFetch(_nextIdx);
    }

    // Play first audio immediately
    var first = _queue.shift();
    if (!first || !first.audio) { _fireEnd(); return; }
    first.audio.onended = function() { _playNext(); };
    first.audio.onerror = function() { _playNext(); };
    var p = first.audio.play();
    if (p) p.catch(function() { _playNext(); });
  }

  // —— Public API ——
  window.ReadAloud = {
    toggle: function(btn) {
      if (!btn) return;
      if (_btn === btn) {
        // Already playing → stop
        _stopAll();
        return;
      }
      // Stop anything else, start this
      _stopAll();
      _stopped = false;
      _btn = btn;
      btn.classList.add('playing');
      _icon(btn, 'spin', '生成中...');
      _start(btn);
    },

    stop: function() { _stopAll(); },

    onEnd: function(fn) { _callbacks.push(fn); },

    isPlaying: function() { return !!_btn; }
  };
})();
