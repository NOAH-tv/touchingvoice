/** Local Web Audio engine. Raw capture stays separate from optional headphone monitoring. */
import { BoothMonitor, DEFAULT_MONITOR_SETTINGS, sanitizeMonitorSettings } from './booth-monitor.js';

const FFT_SIZE = 4096;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Pitch estimate using a downsampled YIN difference function.
 * Intended as a stable visual driver for a single voice, not clinical analysis.
 */
export function detectPitch(waveform, sampleRate) {
  if (!waveform?.length || !Number.isFinite(sampleRate) || sampleRate < 8000) return { f0: 0, clarity: 0, rms: 0 };
  let sum = 0, mean = 0;
  for (let i = 0; i < waveform.length; i++) {
    if (!Number.isFinite(waveform[i])) return { f0: 0, clarity: 0, rms: 0 };
    mean += waveform[i];
  }
  mean /= waveform.length;
  for (let i = 0; i < waveform.length; i++) sum += (waveform[i] - mean) ** 2;
  const rms = Math.sqrt(sum / waveform.length);
  if (rms < 0.0005) return { f0: 0, clarity: 0, rms };
  const stride = Math.max(1, Math.floor(sampleRate / 12000));
  const sr = sampleRate / stride;
  const samples = new Float32Array(Math.floor(waveform.length / stride));
  for (let i = 0; i < samples.length; i++) {
    let avg = 0;
    for (let j = 0; j < stride; j++) avg += waveform[i * stride + j] - mean;
    samples[i] = avg / stride;
  }
  const minLag = Math.max(2, Math.floor(sr / 1200));
  const maxLag = Math.min(Math.ceil(sr / 55), Math.floor(samples.length / 2));
  if (maxLag <= minLag) return { f0: 0, clarity: 0, rms };
  const window = samples.length - maxLag;
  const diff = new Float32Array(maxLag + 1);
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < window; i++) d += (samples[i] - samples[i + lag]) ** 2;
    running += d;
    diff[lag] = running > 0 ? d * lag / running : 1;
  }
  let chosen = -1;
  for (let lag = minLag; lag < maxLag; lag++) {
    if (diff[lag] < 0.15) {
      while (lag + 1 <= maxLag && diff[lag + 1] < diff[lag]) lag++;
      chosen = lag;
      break;
    }
  }
  if (chosen < 0) {
    let best = 1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (diff[lag] < best) { best = diff[lag]; chosen = lag; }
    }
    if (best > 0.3) return { f0: 0, clarity: clamp(1 - best, 0, 1), rms };
  }
  if (chosen < 0) return { f0: 0, clarity: 0, rms };
  let adjusted = chosen;
  if (chosen > 1 && chosen < maxLag) {
    const left = diff[chosen - 1], center = diff[chosen], right = diff[chosen + 1];
    const divisor = 2 * (2 * center - left - right);
    if (Math.abs(divisor) > 1e-12) adjusted += clamp((right - left) / divisor, -0.5, 0.5);
  }
  return { f0: sr / adjusted, clarity: clamp(1 - diff[chosen], 0, 1), rms };
}

/** Float PCM and AnalyserNode float dB spectrum -> named scalar features.
 * Mean-dB band formulas intentionally match the original anatomy prototype.
 * Non-finite or impossible frequency bands stay NaN; they are never scored.
 */
export function analyzeFrame(waveform, spectrum, sampleRate) {
  const pitch = detectPitch(waveform, sampleRate);
  const level = pitch.rms > 0 ? Math.max(-120, 20 * Math.log10(pitch.rms)) : -120;
  const binHz = sampleRate / (2 * (spectrum?.length || FFT_SIZE / 2));
  function band(lo, hi, peak = false) {
    if (!spectrum?.length || !Number.isFinite(binHz) || hi <= lo || lo >= sampleRate / 2) return NaN;
    const a = Math.max(1, Math.ceil(lo / binHz));
    const b = Math.min(spectrum.length - 1, Math.floor(hi / binHz));
    if (a > b) return NaN;
    let value = peak ? -Infinity : 0, count = 0;
    for (let i = a; i <= b; i++) {
      // FFT zero bins legitimately contain -Infinity; use the measured floor.
      const db = spectrum[i] === -Infinity ? -120 : spectrum[i];
      if (!Number.isFinite(db)) continue;
      value = peak ? Math.max(value, db) : value + db;
      count++;
    }
    return count ? (peak ? value : value / count) : NaN;
  }
  const peakNear = frequency => {
    const radius = Math.max(binHz, frequency * 0.07);
    return band(Math.max(1, frequency - radius), frequency + radius, true);
  };
  const valid = pitch.f0 >= 55 && pitch.f0 <= 1200 && pitch.clarity >= 0.7 && level > -90;
  const lo = Math.max(1.25 * pitch.f0, 260);
  const features = {
    brilliance: band(4000, 8000) - band(lo, 4000),
    f1dom: band(lo, 1100) - band(1100, 3500),
    aesprom: band(2800, 3400, true) - (band(2200, 2800) + band(3400, 4000)) / 2,
    negh1h2: valid ? peakNear(2 * pitch.f0) - peakNear(pitch.f0) : NaN,
    ring3k: band(2600, 3800) - band(1000, 2600),
    lowmid: band(lo, 900) - band(900, 5000),
    tilt: band(50, 1500) - band(1500, 6000),
    level, f0: valid ? pitch.f0 : 0, rms: pitch.rms, clarity: pitch.clarity, valid,
  };
  return features;
}

const messageFor = error => {
  switch (error?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError': return '마이크 사용이 허용되지 않았습니다. 브라우저의 사이트 권한에서 마이크를 허용해 주세요.';
    case 'NotFoundError': case 'DevicesNotFoundError': return '마이크를 찾을 수 없습니다. 입력 장치를 연결한 뒤 다시 시작해 주세요.';
    case 'NotReadableError': case 'TrackStartError': return '마이크를 사용할 수 없습니다. 다른 앱의 마이크 사용이나 장치 연결을 확인해 주세요.';
    case 'OverconstrainedError': return '선택한 마이크를 사용할 수 없습니다. 기본 입력 장치로 다시 시도해 주세요.';
    case 'SecurityError': return '마이크는 HTTPS 또는 localhost 환경에서 사용할 수 있습니다.';
    default: return error?.message || '오디오를 처리할 수 없습니다. 입력 장치나 파일을 확인해 주세요.';
  }
};

export class AudioEngine {
  constructor({ onFrame, onState, onError, onRecording, resumeTimeoutMs = 4000 } = {}) {
    this.onFrame = onFrame || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});
    this.onRecording = onRecording || (() => {});
    this.context = null;
    this.analyser = null;
    this.stream = null;
    this.source = null;
    this.buffer = null;
    this.mode = 'idle';
    this.playing = false;
    this.recording = false;
    this.fileName = '';
    this.offset = 0;
    this.startedAt = 0;
    this._timer = null;
    this._generation = 0;
    this._playGeneration = 0;
    this._recorder = null;
    this._recordingPromise = null;
    this._recordingStarted = 0;
    this._monitor = null;
    this._monitorSettings = { ...DEFAULT_MONITOR_SETTINGS };
    this._outputDeviceId = '';
    this._outputQueue = Promise.resolve();
    this._outputGeneration = 0;
    this.resumeTimeoutMs = Number.isFinite(resumeTimeoutMs) ? Math.max(1, resumeTimeoutMs) : 4000;
  }
  get duration() { return this.buffer?.duration || 0; }
  get monitorSettings() { return { ...this._monitorSettings }; }
  get monitorStatus() {
    const context = this.context || (globalThis.AudioContext || globalThis.webkitAudioContext)?.prototype;
    const supported = BoothMonitor.supports(context);
    const connected = !!this._monitor?.connected;
    const active = connected && this._monitorSettings.enabled && this._monitorSettings.volume > 0;
    return { supported, connected, active, settings: this.monitorSettings,
      gainReductionDb: this._monitor?.gainReductionDb || 0,
      outputSupported: typeof context?.setSinkId === 'function', outputDeviceId: this._outputDeviceId,
      message: !supported ? '이 브라우저는 헤드폰 모니터 효과를 지원하지 않습니다.'
        : active ? '헤드폰 모니터 켜짐' : '헤드폰 모니터 꺼짐' };
  }
  setMonitorSettings(patch) {
    this._monitorSettings = sanitizeMonitorSettings(patch, this._monitorSettings);
    // Monitoring must be explicitly enabled for the current, already connected mic.
    if (this.mode !== 'mic' || !this.playing || !this.source) this._monitorSettings.enabled = false;
    try {
      if (!this._monitorSettings.enabled) this._monitor?.detach();
      else if (this._monitor?.connected) this._monitor.update(this._monitorSettings);
      else {
        this._monitor = new BoothMonitor(this.context);
        this._monitor.attach(this.source, this._monitorSettings);
      }
    } catch (error) {
      this._monitor?.detach(); this._monitorSettings.enabled = false; this._state();
      throw this._error(error);
    }
    this._state();
    return this.monitorStatus;
  }
  async listDevices() {
    const media = globalThis.navigator?.mediaDevices;
    if (typeof media?.enumerateDevices !== 'function') return {
      supported: false, inputs: [], outputs: [], outputSupported: this.monitorStatus.outputSupported,
    };
    try {
      const devices = await media.enumerateDevices();
      const select = kind => devices.filter(device => device.kind === kind).map(device => ({
        deviceId: device.deviceId || '', label: device.label || '', groupId: device.groupId || '',
      }));
      return { supported: true, inputs: select('audioinput'), outputs: select('audiooutput'),
        outputSupported: this.monitorStatus.outputSupported };
    } catch (error) { throw this._error(error, '장치 목록을 읽지 못했습니다. 브라우저의 장치 권한을 확인해 주세요.'); }
  }
  async setOutputDevice(deviceId = '') {
    if (typeof deviceId !== 'string') throw this._error(new TypeError('출력 장치 ID가 올바르지 않습니다.'));
    const generation = this._outputGeneration;
    const route = async () => {
      if (generation !== this._outputGeneration) return this.monitorStatus;
      await this._ensureContext({ resume: false });
      if (generation !== this._outputGeneration) return this.monitorStatus;
      const context = this.context;
      if (typeof context.setSinkId !== 'function') {
        const error = new Error('이 브라우저는 출력 장치 선택을 지원하지 않습니다. 시스템 사운드 설정에서 출력을 선택해 주세요.');
        error.name = 'NotSupportedError';
        throw this._error(error);
      }
      try {
        await context.setSinkId(deviceId);
        if (generation === this._outputGeneration && this.context === context) {
          this._outputDeviceId = deviceId; this._state();
        }
        return this.monitorStatus;
      } catch (error) { throw this._error(error, '출력 장치를 변경하지 못했습니다. 장치 연결과 브라우저 권한을 확인해 주세요.'); }
    };
    // Serialize choices so a slow first selection cannot overwrite a later one.
    const pending = this._outputQueue.then(route, route);
    this._outputQueue = pending.catch(() => {});
    return await pending;
  }
  get currentTime() {
    if (this.mode === 'file') return this.playing && this.context
      ? Math.min(this.duration, this.offset + this.context.currentTime - this.startedAt) : this.offset;
    if (this.mode === 'mic') return this.playing && this.context ? this.context.currentTime - this.startedAt : 0;
    return 0;
  }
  get state() {
    return { mode: this.mode, playing: this.playing, recording: this.recording,
      duration: this.duration, currentTime: this.currentTime, fileName: this.fileName };
  }
  _state() { this.onState(this.state); }
  _error(error, fallback) {
    const localized = new Error(fallback || messageFor(error), { cause: error });
    localized.name = error?.name || 'AudioError';
    this.onError(localized);
    return localized;
  }
  async _ensureContext({ resume = true } = {}) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('이 브라우저는 Web Audio를 지원하지 않습니다. 최신 Chrome 또는 Safari에서 열어 주세요.');
    if (!this.context || this.context.state === 'closed') {
      this._monitor?.detach(); this._monitor = null; this._monitorSettings.enabled = false;
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this._outputDeviceId = '';
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.minDecibels = -120;
      this.analyser.maxDecibels = 0;
      this.analyser.smoothingTimeConstant = 0.25;
      this._waveform = new Float32Array(FFT_SIZE);
      this._spectrum = new Float32Array(this.analyser.frequencyBinCount);
    }
    // File decoding does not need an active output device. Hidden webviews and
    // browsers without a current user gesture may leave resume() pending, so
    // playback/mic startup must have a bounded, recoverable failure path.
    if (resume && this.context.state !== 'running') {
      const context = this.context;
      const message = '브라우저에서 오디오를 시작하지 못했습니다. 재생 버튼으로 다시 시작해 주세요.';
      let timer;
      try {
        await Promise.race([
          context.resume(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), this.resumeTimeoutMs); }),
        ]);
        if (context.state !== 'running') throw new Error(message);
      } finally { clearTimeout(timer); }
    }
  }
  _detach() {
    ++this._playGeneration;
    this._monitor?.detach(); this._monitor = null; this._monitorSettings.enabled = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop?.(); } catch { /* Already stopped. */ }
      try { this.source.disconnect(); } catch { /* Already disconnected. */ }
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.playing = false;
  }
  _frames() {
    if (this._timer) clearInterval(this._timer);
    const tick = () => {
      if (!this.playing || !this.analyser || !this.context) return;
      this.analyser.getFloatTimeDomainData(this._waveform);
      this.analyser.getFloatFrequencyData(this._spectrum);
      const features = analyzeFrame(this._waveform, this._spectrum, this.context.sampleRate);
      this.onFrame({ features, waveform: this._waveform.slice(), spectrum: this._spectrum.slice(),
        time: this.currentTime, playing: true });
    };
    this._timer = setInterval(tick, 1000 / 30);
    tick();
  }
  async startMic(deviceId) {
    const generation = ++this._generation;
    try {
      await this.stopRecording();
      if (generation !== this._generation) return;
      this._detach();
      this.buffer = null; this.fileName = ''; this.offset = 0; this.mode = 'idle'; this._state();
      if (!globalThis.navigator?.mediaDevices?.getUserMedia) throw new Error('마이크를 지원하는 HTTPS 또는 localhost 환경에서 열어 주세요.');
      await this._ensureContext();
      if (generation !== this._generation) return;
      const constraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: 1, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
      if (generation !== this._generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser); // Raw analysis; headphone effects use a separate optional branch.
      this.mode = 'mic'; this.playing = true; this.startedAt = this.context.currentTime;
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
        if (this.stream === stream) {
          this.stop();
          this._error(new Error('마이크 연결이 종료되었습니다. 입력 장치를 확인한 뒤 다시 시작해 주세요.'));
        }
      }, { once: true });
      this._frames(); this._state();
    } catch (error) {
      if (generation !== this._generation) return;
      this._detach(); this.mode = 'idle'; this._state();
      throw this._error(error);
    }
  }
  async loadFile(file) {
    if (this.recording || this._recorder) throw this._error(new Error('녹음을 종료한 뒤 파일을 불러와 주세요.'));
    if (!file || typeof file.arrayBuffer !== 'function') throw this._error(new Error('재생할 오디오 파일을 선택해 주세요.'));
    if (file.size > 150 * 1024 * 1024) throw this._error(new Error('150 MB 이하의 오디오 파일을 선택해 주세요.'));
    const generation = ++this._generation;
    try {
      await this.stopRecording();
      if (generation !== this._generation) return;
      this._detach(); this.buffer = null; this.fileName = ''; this.offset = 0; this.mode = 'idle'; this._state();
      await this._ensureContext({ resume: false });
      if (generation !== this._generation) return;
      const bytes = await file.arrayBuffer();
      if (generation !== this._generation) return;
      let decoded;
      try { decoded = await this.context.decodeAudioData(bytes); }
      catch (cause) { throw new Error('이 오디오 파일을 읽을 수 없습니다. WAV, MP3, M4A 또는 브라우저 녹음 파일을 사용해 주세요.', { cause }); }
      if (generation !== this._generation) return;
      if (!decoded.length || decoded.duration <= 0) throw new Error('오디오 파일에 재생 가능한 소리가 없습니다.');
      this.buffer = decoded; this.fileName = String(file.name || '녹음 파일'); this.mode = 'file';
      this._state();
      return this.state;
    } catch (error) {
      if (generation !== this._generation) return;
      this._detach(); this.mode = 'idle'; this._state();
      throw this._error(error);
    }
  }
  async play() {
    if (this.mode !== 'file' || !this.buffer) throw this._error(new Error('먼저 오디오 파일을 불러와 주세요.'));
    if (this.playing) return;
    const generation = ++this._playGeneration;
    try {
      await this._ensureContext();
      if (generation !== this._playGeneration || this.mode !== 'file' || !this.buffer) return;
      if (this.offset >= this.duration - 0.005) this.offset = 0;
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.analyser);
      source.connect(this.context.destination); // File replay is audible.
      this.source = source;
      this.startedAt = this.context.currentTime;
      this.playing = true;
      source.onended = () => {
        if (this.source !== source) return;
        this.offset = this.duration;
        this._detach(); this._state();
      };
      source.start(0, this.offset);
      this._frames(); this._state();
    } catch (error) {
      if (generation !== this._playGeneration) return;
      this._detach(); this._state(); throw this._error(error);
    }
  }
  pause() {
    if (this.mode !== 'file') return;
    ++this._playGeneration;
    if (!this.playing) return;
    this.offset = this.currentTime;
    this._detach(); this._state();
  }
  seek(seconds) {
    if (this.mode !== 'file' || !this.buffer || !Number.isFinite(seconds)) return;
    const wasPlaying = this.playing;
    this._detach(); this.offset = clamp(seconds, 0, this.duration); this._state();
    if (wasPlaying) return this.play();
  }
  stop() {
    ++this._generation;
    // Request final data before stopping the tracks. onRecording still fires.
    if (this._recorder?.state === 'recording' || this._recorder?.state === 'paused') this._recorder.stop();
    this._detach(); this.offset = 0;
    if (this.mode === 'mic') this.mode = 'idle';
    this._state();
  }
  clearInput() {
    // A member switch must release the prior file as well as cancel pending
    // decoding, playback and microphone requests. stop() alone keeps replay.
    this.buffer = null; this.fileName = ''; this.mode = 'idle'; this.startedAt = 0;
    this.stop();
    return this.state;
  }
  async startRecording() {
    if (this.recording) return;
    if (this.mode !== 'mic' || !this.stream || !this.playing) throw this._error(new Error('마이크를 먼저 시작한 뒤 녹음해 주세요.'));
    if (!globalThis.MediaRecorder) throw this._error(new Error('이 브라우저는 녹음을 지원하지 않습니다. 최신 Chrome 또는 Safari를 사용해 주세요.'));
    try {
      const formats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
      const mimeType = formats.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      this._recorder = recorder;
      this._recordingStarted = performance.now();
      let resolveRecording;
      this._recordingPromise = new Promise(resolve => { resolveRecording = resolve; });
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => { this._error(event.error || new Error('녹음 중 오류가 발생했습니다.')); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const duration = (performance.now() - this._recordingStarted) / 1000;
        this.recording = false;
        if (this._recorder === recorder) this._recorder = null;
        this._state();
        resolveRecording(blob.size ? blob : null);
        if (blob.size) this.onRecording({ blob, mimeType: blob.type, duration });
        else this._error(new Error('녹음된 소리가 없습니다. 마이크를 확인한 뒤 다시 녹음해 주세요.'));
      };
      recorder.start(250);
      this.recording = true; this._state();
    } catch (error) { this.recording = false; this._recorder = null; this._state(); throw this._error(error); }
  }
  async stopRecording() {
    const recorder = this._recorder;
    if (!recorder) return null;
    if (recorder.state !== 'inactive') recorder.stop();
    return await this._recordingPromise;
  }
  async destroy() {
    ++this._generation;
    ++this._outputGeneration;
    this._monitor?.detach(); this._monitorSettings.enabled = false;
    await this.stopRecording();
    this._detach(); this.buffer = null; this.mode = 'idle'; this.offset = 0; this.fileName = '';
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null; this.analyser = null; this._outputDeviceId = ''; this._state();
  }
}
