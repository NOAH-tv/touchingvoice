import { pcm24ChunksToWav } from './wav.js?v=pcm24-20260910';

export const PCM_OUTPUT_SAMPLE_RATE = 48000;
export const PCM_MAX_SECONDS = 300;
const WORKLET_URL = new URL('./pcm-capture-worklet.js?v=pcm24-20260910', import.meta.url);
const moduleLoads = new WeakMap();
const error = (message, name = 'AudioCaptureError') => Object.assign(new Error(message), { name });
const timeout = (promise, ms, message) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(error(message)), ms); })]).finally(() => clearTimeout(timer));
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); promise.catch(() => {}); return { promise, resolve, reject }; };
function deviceSettings(stream) {
  const settings = stream?.getAudioTracks?.()[0]?.getSettings?.() || {};
  return Object.fromEntries(['deviceId','groupId','sampleRate','sampleSize','channelCount','latency','echoCancellation','noiseSuppression','autoGainControl'].filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]]));
}
async function loadModule(context) {
  if (!context?.audioWorklet?.addModule || typeof globalThis.AudioWorkletNode !== 'function')
    throw error('이 브라우저에서는 무손실 WAV 녹음을 지원하지 않습니다. 최신 Chrome 또는 Edge에서 HTTPS로 열어 주세요.', 'NotSupportedError');
  let promise = moduleLoads.get(context);
  if (!promise) {
    promise = context.audioWorklet.addModule(WORKLET_URL.href).catch(cause => { moduleLoads.delete(context); throw error('WAV 녹음 엔진을 불러오지 못했습니다. 연결을 확인하고 다시 시작해 주세요.', cause?.name); });
    moduleLoads.set(context, promise);
  }
  return await timeout(promise, 8000, 'WAV 녹음 엔진 준비 시간이 초과되었습니다. 다시 시작해 주세요.');
}

export async function preparePcmCapture(context) { return await loadModule(context); }

/** Output resampling is explicit and recorded; it does not restore missing input
 * frequencies or physical ADC bits. The common 48kHz path avoids any resampling. */
export async function captureChunksToWav(chunks, sampleRate) {
  const frames = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!frames) throw error('녹음된 소리가 없습니다. 입력 장치를 확인해 주세요.');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || frames > sampleRate * PCM_MAX_SECONDS)
    throw error('녹음 길이 또는 샘플레이트가 올바르지 않습니다.');
  let outputChunks = chunks, outputFrames = frames;
  if (sampleRate !== PCM_OUTPUT_SAMPLE_RATE) {
    const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!Offline) throw error('이 브라우저에서는 48 kHz WAV 변환을 지원하지 않습니다. 최신 Chrome에서 다시 녹음해 주세요.', 'NotSupportedError');
    outputFrames = Math.round(frames * PCM_OUTPUT_SAMPLE_RATE / sampleRate);
    const context = new Offline(1, outputFrames, PCM_OUTPUT_SAMPLE_RATE);
    const input = context.createBuffer(1, frames, sampleRate), target = input.getChannelData(0);
    let offset = 0; for (const chunk of chunks) { target.set(chunk, offset); offset += chunk.length; }
    const source = context.createBufferSource(); source.buffer = input; source.connect(context.destination); source.start();
    const rendered = await timeout(context.startRendering(), 15000, '48 kHz WAV 변환을 완료하지 못했습니다.');
    outputChunks = [rendered.getChannelData(0)];
  }
  return { blob: pcm24ChunksToWav(outputChunks, PCM_OUTPUT_SAMPLE_RATE), frameCount: outputFrames,
    duration: outputFrames / PCM_OUTPUT_SAMPLE_RATE, contextSampleRate: sampleRate, outputSampleRate: PCM_OUTPUT_SAMPLE_RATE };
}

/** Owns only a silent recording branch, never the microphone tracks or monitor.
 * start() resolves after the audio-thread acknowledgement. stop() resolves after
 * every sequenced PCM chunk is flushed. abort() discards an unfinished take.
 */
export class PcmCaptureRecorder {
  constructor({ context, source, stream, maxDurationSeconds = PCM_MAX_SECONDS, onLimit = () => {} } = {}) {
    if (!context || !stream) throw error('연결된 마이크와 오디오 컨텍스트가 필요합니다.');
    if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0 || maxDurationSeconds > PCM_MAX_SECONDS) throw error('녹음은 최대 5분까지 가능합니다.');
    this.context = context; this.source = source; this.stream = stream; this.maxDurationSeconds = maxDurationSeconds; this.onLimit = onLimit;
    this.state = 'inactive'; this.chunks = []; this.frames = 0; this.node = null; this.silent = null;
    this._started = deferred(); this._finished = deferred(); this.done = this._finished.promise;
    this._settled = false; this._aborted = false; this._ownSource = false; this.settings = deviceSettings(stream);
  }
  async start() {
    if (this.state !== 'inactive' || this._settled) throw error('이미 시작한 녹음입니다.');
    this.state = 'starting';
    try {
      await loadModule(this.context);
      if (this._aborted) throw error('녹음을 취소했습니다.', 'AbortError');
      if (this.context.state !== 'running') throw error('오디오 입력이 실행 중이 아닙니다. 마이크를 다시 시작해 주세요.');
      this.node = new AudioWorkletNode(this.context, 'touchingvoice-pcm-capture-v1', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1,
        channelCountMode: 'explicit', channelInterpretation: 'discrete',
      });
      this.node.port.onmessage = event => { void this._message(event.data).catch(cause => this._fail(cause)); };
      this.node.onprocessorerror = () => this._fail(error('원음 녹음 엔진이 중단되었습니다. 이 녹음은 저장하지 않았습니다.'));
      this.silent = this.context.createGain(); this.silent.gain.value = 0;
      this.node.connect(this.silent); this.silent.connect(this.context.destination);
      if (!this.source) { this.source = this.context.createMediaStreamSource(this.stream); this._ownSource = true; }
      this.source.connect(this.node);
      const maxFrames = Math.min(Math.floor(this.context.sampleRate * this.maxDurationSeconds), 32 * 1024 * 1024);
      this.node.port.postMessage({ type: 'start', maxFrames });
      await timeout(this._started.promise, 4000, '원음 녹음을 시작하지 못했습니다. 마이크 입력을 확인해 주세요.');
      if (this._aborted) throw error('녹음을 취소했습니다.', 'AbortError');
      if (!this._settled) this.state = 'recording';
      return this;
    } catch (cause) { this._fail(cause); throw cause; }
  }
  async _message(message) {
    if (this._settled || this._aborted) return;
    if (message?.type === 'started') {
      if (message.sampleRate !== this.context.sampleRate || !Number.isSafeInteger(message.startedFrame)) throw error('녹음 시작 시각이 올바르지 않습니다.');
      this.startedFrame = message.startedFrame; this._started.resolve(message); return;
    }
    if (message?.type === 'chunk') {
      if (!(message.data instanceof ArrayBuffer) || message.data.byteLength % 4 || message.offset !== this.frames) throw error('원음 프레임이 누락되어 저장을 중지했습니다.');
      const chunk = new Float32Array(message.data);
      if (chunk.length > 8192 || this.frames + chunk.length > Math.min(this.context.sampleRate * this.maxDurationSeconds, 32 * 1024 * 1024)) throw error('원음 저장 용량 한도를 넘었습니다.');
      this.chunks.push(chunk); this.frames += chunk.length; return;
    }
    if (message?.type === 'error') throw error(message.message || 'WAV 녹음에 실패했습니다.');
    if (message?.type !== 'finished') return;
    if (message.frames !== this.frames || message.sampleRate !== this.context.sampleRate) throw error('원음 전체 프레임을 확인하지 못했습니다.');
    if (message.reason === 'input-ended') throw error('녹음 도중 입력이 끊겼습니다. 장치를 확인하고 다시 녹음해 주세요.');
    this.state = 'stopping'; this._cleanup();
    const output = await captureChunksToWav(this.chunks, this.context.sampleRate);
    if (this._settled || this._aborted) return;
    const captureSettings = { format: 'wav-pcm', containerBits: 24, outputSampleRate: PCM_OUTPUT_SAMPLE_RATE,
      contextSampleRate: this.context.sampleRate, deviceSettings: this.settings,
      deviceSampleRate: Number.isFinite(this.settings.sampleRate) ? this.settings.sampleRate : null,
      deviceReportedSampleSize: Number.isFinite(this.settings.sampleSize) ? this.settings.sampleSize : null,
      resampled: this.context.sampleRate !== PCM_OUTPUT_SAMPLE_RATE || (Number.isFinite(this.settings.sampleRate) && this.settings.sampleRate !== this.context.sampleRate),
      adcBitDepth: null, channelCount: 1, inputChannelPolicy: 'first-channel-discrete', frameCount: output.frameCount,
      captureStartContextSeconds: this.startedFrame / this.context.sampleRate,
      processingRequested: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      monitorEffectsRecorded: false, stopReason: message.reason };
    this.chunks = []; this._settled = true; this.state = 'inactive';
    const result = { blob: output.blob, mimeType: 'audio/wav', duration: output.duration, captureSettings };
    this._finished.resolve(result);
    if (message.reason === 'limit') this.onLimit(result);
  }
  stop() {
    if (this._settled) return this.done;
    if (this.state === 'starting') { this.abort(); return this.done; }
    if (this.state === 'recording') {
      this.state = 'stopping'; this.node.port.postMessage({ type: 'stop' });
      timeout(this.done, 20000, '원음 녹음 마무리 시간이 초과되었습니다.').catch(cause => this._fail(cause));
    }
    return this.done;
  }
  abort() {
    if (this._settled) return;
    this._aborted = true; this.node?.port.postMessage({ type: 'abort' });
    this._fail(error('녹음을 취소했습니다.', 'AbortError'));
  }
  _fail(cause) {
    if (this._settled) return;
    this._settled = true; this.state = 'inactive'; this.chunks = []; this._cleanup();
    this._started.reject(cause); this._finished.reject(cause);
  }
  _cleanup() {
    if (this.source && this.node) { try { this.source.disconnect(this.node); } catch {} }
    if (this._ownSource) { try { this.source.disconnect(); } catch {} }
    if (this.node) { this.node.onprocessorerror = null; this.node.port.onmessage = null; this.node.port.close?.(); try { this.node.disconnect(); } catch {} }
    if (this.silent) { try { this.silent.disconnect(); } catch {} }
    this.node = null; this.silent = null;
  }
}
