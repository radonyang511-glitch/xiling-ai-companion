// ============ MediaPipe Face + Gesture Module ============
const MediaPipeBridge = {
  // State
  _active: false,
  _cameraReady: false,
  _video: null,
  _stream: null,
  _faceLandmarker: null,
  _gestureRecognizer: null,
  _lastVideoTime: -1,
  _rafId: null,
  _cameraFacing: 'user',

  // Current detection results (updated every frame)
  blendshapes: {},       // Smoothed: { eyeBlinkLeft: 0.8, jawOpen: 0.3, ... }
  rawBlendshapes: {},    // Raw from MediaPipe
  faceLandmarks: null,
  gestures: [],
  handLandmarks: null,

  // Smoothing
  _smoothFactor: 0.35,   // Lower = more smoothing (EMA)

  // Lip sync state
  _lipSyncValue: 0,
  _lipSyncActive: false,

  // Callbacks
  onGesture: null,

  get active() { return this._active; },
  get cameraReady() { return this._cameraReady; },
  get lipSyncMouth() { return this._lipSyncActive ? this._lipSyncValue : null; },

  // ============ Initialize ============
  async init() {
    if (this._faceLandmarker) return true;

    try {
      console.log('[MediaPipe] Loading vision tasks...');
      const mpModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
      const { FilesetResolver, FaceLandmarker, GestureRecognizer } = mpModule;

      console.log('[MediaPipe] Loading WASM...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );
      console.log('[MediaPipe] WASM OK');

      // Face Landmarker — use VIDEO mode for synchronous results
      this._faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      // Gesture Recognizer — VIDEO mode
      this._gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });

      console.log('[MediaPipe] FaceLandmarker + GestureRecognizer ready');
      return true;
    } catch (e) {
      console.error('[MediaPipe] init failed:', e.message);
      return false;
    }
  },

  // ============ Camera Control ============
  async startCamera() {
    if (this._cameraReady) return true;

    // Create video element if needed
    if (!this._video) {
      this._video = document.getElementById('mp-video');
      if (!this._video) {
        this._video = document.createElement('video');
        this._video.id = 'mp-video';
        this._video.setAttribute('playsinline', '');
        this._video.setAttribute('autoplay', '');
        this._video.style.display = 'none';
        document.body.appendChild(this._video);
      }
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this._cameraFacing, width: 320, height: 240, frameRate: 25 }
      });
      this._video.srcObject = this._stream;
      await this._video.play();

      this._cameraReady = true;
      this._lastVideoTime = -1;
      this._frameCount = 0;
      this._debugLogged = false;
      this._debugLoggedLoop = false;
      console.log('[MediaPipe] Camera ready, video:', this._video.videoWidth + 'x' + this._video.videoHeight);
      return true;
    } catch (e) {
      console.error('[MediaPipe] Camera access denied:', e.message);
      return false;
    }
  },

  stopCamera() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
    }
    this._cameraReady = false;
  },

  // ============ Detection Loop ============
  async start() {
    if (this._active) return;

    const ok = await this.init();
    if (!ok) return false;

    const camOk = await this.startCamera();
    if (!camOk) return false;

    this._active = true;
    this._lastVideoTime = -1;
    this._frameCount = 0;
    this._detectLoop();
    console.log('[MediaPipe] Detection loop started, landmarks:', !!this._faceLandmarker, 'gesture:', !!this._gestureRecognizer);
    return true;
  },

  stop() {
    this._active = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this.stopCamera();
    this.blendshapes = {};
    this.faceLandmarks = null;
    this.gestures = [];
    this.handLandmarks = null;
    console.log('[MediaPipe] Stopped');
  },

  _detectLoop() {
    if (!this._active) return;

    this._rafId = requestAnimationFrame(() => this._detectLoop());

    if (!this._cameraReady || !this._video || this._video.readyState < 2) {
      if (!this._debugLoggedLoop) {
        this._debugLoggedLoop = true;
        console.log('[MediaPipe] Waiting for camera... readyState:', this._video?.readyState, 'cameraReady:', this._cameraReady);
      }
      return;
    }

    // Use frame counter to ensure monotonic timestamps
    if (this._lastVideoTime === this._video.currentTime) return;
    this._lastVideoTime = this._video.currentTime;
    const now = (this._frameCount || 0) * 33.33; // ~30fps
    this._frameCount = (this._frameCount || 0) + 1;

    try {
      if (this._faceLandmarker) {
        const result = this._faceLandmarker.detectForVideo(this._video, now);
        this._onFaceResult(result);
      }
      if (this._gestureRecognizer) {
        const result = this._gestureRecognizer.recognizeForVideo(this._video, now);
        this._onGestureResult(result);
      }
    } catch (e) {
      console.warn('[MediaPipe] detect error:', e.message);
    }

    // Log every 60 frames
    if (this._frameCount % 60 === 0) {
      console.log('[MediaPipe] frame', this._frameCount, 'blendshapes:', Object.keys(this.blendshapes).length, 'landmarks:', !!this.faceLandmarks);
    }

    // Draw preview
    this._drawPreview();
  },

  // Draw face mesh + expression on preview canvas
  _drawPreview() {
    const overlay = document.getElementById('face-preview');
    const canvas = document.getElementById('face-preview-canvas');
    if (!overlay || !canvas || overlay.style.display === 'none') return;

    const ctx = canvas.getContext('2d');
    const vw = this._video.videoWidth || 320;
    const vh = this._video.videoHeight || 240;
    if (canvas.width !== vw) { canvas.width = vw; canvas.height = vh; }

    // Mirror video to canvas
    ctx.save();
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this._video, 0, 0, vw, vh);
    ctx.restore();

    // Draw face landmarks
    if (this.faceLandmarks) {
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(255,107,157,0.4)';

      for (const lm of this.faceLandmarks) {
        // Mirror x
        const x = (1 - lm.x) * vw;
        const y = lm.y * vh;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw eye/mouth regions thicker
      const face = this.faceLandmarks;
      const regions = {
        leftEye: [33, 133, 155, 154, 153, 145, 144, 163, 7, 173, 157, 158, 159, 160, 161, 246],
        rightEye: [362, 263, 387, 386, 385, 373, 374, 380, 381, 382, 398, 384, 466, 390, 388, 387],
        lips: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
      };

      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      for (const [name, indices] of Object.entries(regions)) {
        ctx.beginPath();
        for (let i = 0; i < indices.length; i++) {
          const pt = face[indices[i]];
          if (pt) {
            const x = (1 - pt.x) * vw;
            const y = pt.y * vh;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Update expression label
    const label = document.getElementById('face-preview-label');
    if (label && this.blendshapes) {
      const bs = this.blendshapes;
      const blinkL = bs.eyeBlinkLeft || 0;
      const blinkR = bs.eyeBlinkRight || 0;
      const blink = blinkL + blinkR;
      const smile = (bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0);
      const frown = (bs.mouthFrownLeft || 0) + (bs.mouthFrownRight || 0);
      const jaw = bs.jawOpen || 0;
      const brow = bs.browInnerUp || 0;
      const browDown = (bs.browDownLeft || 0) + (bs.browDownRight || 0);
      const pucker = bs.mouthPucker || 0;
      const cheekSquint = (bs.cheekSquintLeft || 0) + (bs.cheekSquintRight || 0);
      const mouthStretch = (bs.mouthStretchLeft || 0) + (bs.mouthStretchRight || 0);

      // Expression detection (ordered by priority)
      let expr = '😐 平静';
      let val = '';
      if (jaw > 0.08)  { expr = '😮 张嘴'; val = (jaw*100).toFixed(0)+'%'; }
      if (smile > 0.15) { expr = '😊 微笑'; val = (smile*50).toFixed(0)+'%'; }
      if (smile > 0.4 && cheekSquint > 0.2) { expr = '😆 大笑'; val = (smile*50).toFixed(0)+'%'; }
      if (blink > 0.3 && blinkL > 0.15 && blinkR > 0.15) { expr = '😉 眨眼'; val = (blink*50).toFixed(0)+'%'; }
      if (blinkL > 0.5 || blinkR > 0.5) { expr = '😜 眨眼'; val = (Math.max(blinkL,blinkR)*100).toFixed(0)+'%'; }
      if (frown > 0.15) { expr = '😟 皱眉'; val = (frown*50).toFixed(0)+'%'; }
      if (brow > 0.1 && frown < 0.1) { expr = '😧 惊讶'; val = (brow*100).toFixed(0)+'%'; }
      if (browDown > 0.2) { expr = '😠 生气'; val = (browDown*50).toFixed(0)+'%'; }
      if (pucker > 0.1) { expr = '😗 嘟嘴'; val = (pucker*100).toFixed(0)+'%'; }
      if (mouthStretch > 0.2) { expr = '😬 咧嘴'; val = (mouthStretch*50).toFixed(0)+'%'; }

      if (val) expr += ' ' + val;

      // Gesture
      if (this.gestures.length > 0 && this.gestures[0].score > 0.5) {
        expr += ' | ✋' + this.gestures[0].category;
      }

      label.textContent = expr;
    }
  },

  // ============ Face Result Handler ============
  _onFaceResult(result) {
    if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
      // No face: slowly decay to zero
      for (const key of Object.keys(this.blendshapes)) {
        this.blendshapes[key] *= 0.8;
        if (this.blendshapes[key] < 0.01) delete this.blendshapes[key];
      }
      this.faceLandmarks = null;
      return;
    }

    // Extract raw blendshapes
    const raw = {};
    const categories = result.faceBlendshapes[0].categories || [];
    for (const c of categories) {
      raw[c.categoryName] = c.score;
    }
    this.rawBlendshapes = raw;

    // Apply exponential moving average smoothing
    const sf = this._smoothFactor;
    for (const [key, val] of Object.entries(raw)) {
      const prev = this.blendshapes[key] || 0;
      this.blendshapes[key] = prev * (1 - sf) + val * sf;
    }
    // Decay keys not in current frame
    for (const key of Object.keys(this.blendshapes)) {
      if (!(key in raw)) this.blendshapes[key] *= 0.8;
    }

    // Store landmarks
    this.faceLandmarks = result.faceLandmarks?.[0] || null;

    // Debug once
    if (!this._debugLogged) {
      this._debugLogged = true;
      const top = categories.filter(c => c.score > 0.05).map(c => c.categoryName + '=' + c.score.toFixed(2)).join(', ');
      console.log('[MediaPipe] Face detected! Top blendshapes:', top || '(neutral)');
    }
  },

  // ============ Gesture Result Handler ============
  _onGestureResult(result) {
    if (!result.gestures || result.gestures.length === 0) {
      this.gestures = [];
      return;
    }

    const detected = [];
    for (const handGestures of result.gestures) {
      if (handGestures.length > 0) {
        const top = handGestures[0]; // highest confidence
        detected.push({ category: top.categoryName, score: top.score });
      }
    }
    this.gestures = detected;
    this.handLandmarks = result.landmarks || null;

    // Fire gesture callback for the highest-confidence gesture
    if (detected.length > 0 && this.onGesture && detected[0].score > 0.6) {
      this.onGesture({ name: detected[0].category, confidence: detected[0].score });
    }
  },

  // ============ Lip Sync (audio-driven, called by AudioPlayer) ============
  setLipSync(value) {
    this._lipSyncValue = Math.max(0, Math.min(1, value));
    this._lipSyncActive = value > 0.01;
  },

  // ============ Cleanup ============
  destroy() {
    this.stop();
    this._faceLandmarker?.close();
    this._faceLandmarker = null;
    this._gestureRecognizer?.close();
    this._gestureRecognizer = null;
  }
};
