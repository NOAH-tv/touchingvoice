/** Headphone-only processing branch. Never feeds the raw analyser or recorder. */
export const DEFAULT_MONITOR_SETTINGS = Object.freeze({
  enabled: false, gainDb: 0, compressor: true, thresholdDb: -20,
  reverb: true, mix: 0.25, seconds: 4.5, volume: 0.35,
});
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const ranges = { gainDb: [-24, 12], thresholdDb: [-60, 0], mix: [0, 0.7], seconds: [0.2, 8], volume: [0, 1] };

export function sanitizeMonitorSettings(patch = {}, previous = DEFAULT_MONITOR_SETTINGS) {
  const settings = { ...DEFAULT_MONITOR_SETTINGS };
  for (const values of [previous, patch]) {
    if (!values || typeof values !== 'object') continue;
    for (const key of ['enabled', 'compressor', 'reverb']) {
      if (typeof values[key] === 'boolean') settings[key] = values[key];
    }
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      if (typeof values[key] === 'number' && Number.isFinite(values[key])) settings[key] = clamp(values[key], lo, hi);
    }
  }
  return settings;
}

/** Stereo hall impulse with 24 ms predelay and an exponential RT60 decay. */
export function makeMonitorImpulse(context, seconds) {
  const duration = sanitizeMonitorSettings({ seconds }).seconds;
  const rate = context.sampleRate;
  const pre = Math.floor(rate * 0.024);
  const length = Math.floor(rate * duration * 1.15) + pre;
  const buffer = context.createBuffer(2, length, rate);
  const decay = Math.log(1000) / (duration * rate);
  const reflections = [[0.011, 0.55], [0.019, 0.42], [0.031, 0.36], [0.047, 0.28], [0.063, 0.2]];
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpass = 0;
    for (let i = pre; i < length; i++) {
      const n = i - pre;
      lowpass += (0.62 + channel * 0.03) * (Math.random() * 2 - 1 - lowpass);
      data[i] = lowpass * Math.exp(-decay * n) * (1 + 0.15 * Math.sin(n * 0.0007 + channel));
    }
    reflections.forEach(([time, gain], index) => {
      const position = pre + Math.floor(rate * time * (channel ? 1.07 : 1));
      if (position < length) data[position] += gain * (index % 2 ? -1 : 1);
    });
  }
  return buffer;
}

const setParam = (param, value, context, smooth = true) => {
  if (smooth && typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, context.currentTime, 0.01);
  else param.value = value;
};

export class BoothMonitor {
  static supports(context) {
    return !!context && ['createGain', 'createDynamicsCompressor', 'createConvolver', 'createBuffer']
      .every(method => typeof context[method] === 'function');
  }
  constructor(context) {
    this.context = context;
    this.source = null;
    this.nodes = null;
    this.settings = { ...DEFAULT_MONITOR_SETTINGS };
  }
  get connected() { return !!this.source && !!this.nodes; }
  get gainReductionDb() {
    const reduction = this.nodes?.compressor.reduction;
    return this.connected && this.settings.compressor && Number.isFinite(reduction) ? clamp(reduction, -60, 0) : 0;
  }
  attach(source, settings) {
    this.detach();
    this.settings = sanitizeMonitorSettings(settings);
    if (!source || !this.settings.enabled) return;
    if (!BoothMonitor.supports(this.context)) throw new Error('이 브라우저는 헤드폰 모니터 효과를 지원하지 않습니다.');
    const context = this.context;
    // Retain nodes as they are allocated so a partial creation failure releases all of them.
    this.nodes = {};
    try {
      this.nodes.input = context.createGain();
      this.nodes.compressor = context.createDynamicsCompressor();
      this.nodes.convolver = context.createConvolver();
      this.nodes.dry = context.createGain();
      this.nodes.wet = context.createGain();
      this.nodes.output = context.createGain();
      const { input, compressor, convolver, dry, wet, output } = this.nodes;
      output.gain.value = 0;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.knee.value = 6;
      compressor.ratio.value = 4;
      convolver.normalize = true;
      convolver.buffer = makeMonitorImpulse(context, this.settings.seconds);
      convolver.connect(wet);
      dry.connect(output); wet.connect(output);
      this._route();
      this._parameters(false);
      output.connect(context.destination);
      this.source = source;
      source.connect(input);
    } catch (error) { this.detach(); throw error; }
  }
  _route() {
    const { input, compressor, convolver, dry } = this.nodes;
    input.disconnect(); compressor.disconnect();
    const split = this.settings.compressor ? compressor : input;
    if (this.settings.compressor) input.connect(compressor);
    split.connect(dry); split.connect(convolver);
  }
  _parameters(smooth = true) {
    const { input, compressor, dry, wet, output } = this.nodes;
    const settings = this.settings;
    setParam(input.gain, 10 ** (settings.gainDb / 20), this.context, smooth);
    setParam(compressor.threshold, settings.thresholdDb, this.context, smooth);
    setParam(dry.gain, settings.reverb ? 1 - settings.mix * 0.6 : 1, this.context, smooth);
    setParam(wet.gain, settings.reverb ? settings.mix : 0, this.context, smooth);
    setParam(output.gain, settings.enabled ? settings.volume : 0, this.context, smooth);
  }
  update(settings) {
    const previous = this.settings;
    this.settings = sanitizeMonitorSettings(settings, previous);
    if (!this.settings.enabled) { this.detach(); return; }
    if (!this.nodes) return;
    if (previous.compressor !== this.settings.compressor) this._route();
    if (previous.seconds !== this.settings.seconds) this.nodes.convolver.buffer = makeMonitorImpulse(this.context, this.settings.seconds);
    this._parameters();
  }
  detach() {
    const nodes = this.nodes;
    if (nodes?.output) {
      // Cancel a pending fade before immediately muting, including the reverb tail.
      nodes.output.gain.cancelScheduledValues?.(this.context.currentTime);
      nodes.output.gain.value = 0;
    }
    if (this.source && nodes?.input) {
      try { this.source.disconnect(nodes.input); } catch { /* Source may already be disconnected. */ }
    }
    if (nodes) for (const node of Object.values(nodes)) {
      try { node.disconnect(); } catch { /* Already released. */ }
    }
    if (nodes?.convolver) nodes.convolver.buffer = null;
    this.nodes = null; this.source = null;
  }
}
