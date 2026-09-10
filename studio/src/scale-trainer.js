const PATTERNS = Object.freeze({
  'five-ascending': [0, 2, 4, 5, 7],
  'five-tone': [0, 2, 4, 5, 7, 5, 4, 2, 0],
  arpeggio: [0, 4, 7, 12, 7, 4, 0],
  sustain: [0],
});
const MAX_DURATION = 180;
const CANCELLED = Symbol('cancelled');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const integer = (value, fallback, min, max) => {
  const numeric = typeof value === 'number' || typeof value === 'string'
    ? Number(value) : NaN;
  return clamp(Number.isFinite(numeric) ? Math.round(numeric) : fallback, min, max);
};

/** Build a deterministic guide sequence. All timing is expressed in seconds. */
export function buildScale(options = {}) {
  const input = options && typeof options === 'object' ? options : {};
  const settings = {
    rootMidi: integer(input.rootMidi, 60, 36, 76),
    pattern: Object.hasOwn(PATTERNS, input.pattern) ? input.pattern : 'five-tone',
    bpm: integer(input.bpm, 80, 50, 140),
    repeats: integer(input.repeats, 2, 1, 6),
    transposeStep: integer(input.transposeStep, 1, -12, 12),
  };
  const beat = 60 / settings.bpm;
  const noteDuration = beat * (settings.pattern === 'sustain' ? 4 : 1);
  const notes = [];
  let cursor = 0;
  for (let repeat = 0; repeat < settings.repeats; repeat += 1) {
    for (const interval of PATTERNS[settings.pattern]) {
      const duration = Math.min(noteDuration, MAX_DURATION - cursor);
      if (duration <= 0) return { notes, duration: cursor, settings };
      notes.push({
        midi: clamp(settings.rootMidi + repeat * settings.transposeStep + interval, 0, 127),
        start: cursor,
        duration,
      });
      cursor += duration;
    }
    if (repeat < settings.repeats - 1) cursor = Math.min(MAX_DURATION, cursor + 2 * beat);
  }
  return { notes, duration: cursor, settings };
}

/** A quiet Web Audio guide. This class never opens or accesses a microphone. */
export class ScaleTrainer {
  constructor({ onState = () => {}, onFinish = () => {} } = {}) {
    this.onState = onState;
    this.onFinish = onFinish;
    this._generation = 0;
    this._context = null;
    this._nodes = new Set();
    this._timer = null;
    this._cancelResume = null;
    this._sequence = null;
    this._playing = false;
    this._startedAt = 0;
    this._elapsed = 0;
  }

  get currentTime() {
    if (!this._playing || !this._context) return this._elapsed;
    return clamp(this._context.currentTime - this._startedAt, 0, this._sequence.duration);
  }

  get target() {
    if (!this._playing || !this._context || this._context.currentTime < this._startedAt) return null;
    const elapsed = this.currentTime;
    const note = this._sequence.notes.find(item => elapsed >= item.start && elapsed < item.start + item.duration);
    return note ? note.midi : null;
  }

  async start(settings = {}) {
    return this.startSequence(buildScale(settings));
  }

  /** Play a pre-built, bounded guide without touching microphone ownership. */
  async startSequence(input) {
    if (!input || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > MAX_DURATION
      || !Array.isArray(input.notes) || !input.notes.length || input.notes.length > 100
      || input.notes.some(n => !Number.isFinite(n.midi) || n.midi < 0 || n.midi > 127
        || !Number.isFinite(n.start) || n.start < 0 || !Number.isFinite(n.duration)
        || n.duration <= 0 || n.start + n.duration > input.duration + .001)) {
      throw new Error('스케일 가이드의 음정과 시간을 확인해 주세요.');
    }
    const sequence = structuredClone(input);
    this.stop();
    const generation = this._generation;
    this._sequence = sequence;
    this._elapsed = 0;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser does not support Web Audio playback.');
    const context = new AudioContextClass();
    this._context = context;
    let resumeTimeout;
    try {
      if (context.state !== 'running') {
        const cancelled = new Promise(resolve => {
          this._cancelResume = () => resolve(CANCELLED);
        });
        const timeout = new Promise((_, reject) => {
          resumeTimeout = setTimeout(() => reject(new Error('Audio playback could not start within 4 seconds. Try again.')), 4000);
        });
        const outcome = await Promise.race([context.resume(), cancelled, timeout]);
        if (outcome === CANCELLED || generation !== this._generation) return false;
        if (context.state !== 'running') throw new Error('Audio playback is suspended. Try starting the guide again.');
      }
      if (generation !== this._generation) return false;
      clearTimeout(resumeTimeout);
      this._cancelResume = null;
      this._startedAt = context.currentTime + 0.06;
      for (const note of sequence.notes) this._scheduleNote(context, note);
      this._playing = true;
      this._timer = setInterval(() => {
        if (generation !== this._generation || !this._playing) return;
        if (context.currentTime - this._startedAt >= sequence.duration) {
          this._finish();
        } else {
          this._emit();
        }
      }, 1000 / 30);
      this._emit();
      return true;
    } catch (error) {
      if (generation !== this._generation) return false;
      this._playing = false;
      this._disposeAudio();
      this._emit();
      throw error;
    } finally {
      clearTimeout(resumeTimeout);
      if (generation === this._generation) this._cancelResume = null;
    }
  }

  stop() {
    this._elapsed = this.currentTime;
    this._generation += 1;
    this._playing = false;
    if (this._cancelResume) this._cancelResume();
    this._cancelResume = null;
    this._disposeAudio();
    if (this._sequence) this._emit();
  }

  _scheduleNote(context, note) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const pair = { oscillator, gain };
    // Register before configuring so a scheduling failure still releases both nodes.
    this._nodes.add(pair);
    const start = this._startedAt + note.start;
    const end = start + note.duration;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440 * 2 ** ((note.midi - 69) / 12), start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.035, start + Math.min(0.02, note.duration / 4));
    gain.gain.setValueAtTime(0.035, end - Math.min(0.06, note.duration / 4));
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this._nodes.delete(pair);
    };
    oscillator.start(start);
    oscillator.stop(end + 0.005);
  }

  _emit() {
    if (!this._sequence) return;
    const elapsed = this.currentTime;
    this.onState({
      playing: this._playing,
      elapsed,
      duration: this._sequence.duration,
      targetMidi: this.target,
      progress: this._sequence.duration ? elapsed / this._sequence.duration : 0,
      notes: this._sequence.notes,
      settings: this._sequence.settings,
    });
  }

  _finish() {
    if (!this._playing) return;
    const sequence = this._sequence;
    this._elapsed = sequence.duration;
    this._playing = false;
    this._generation += 1;
    this._disposeAudio();
    this._emit();
    this.onFinish({ duration: sequence.duration, settings: sequence.settings });
  }

  _disposeAudio() {
    clearInterval(this._timer);
    this._timer = null;
    for (const { oscillator, gain } of this._nodes) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* The note may already have ended. */ }
      try { oscillator.disconnect(); } catch { /* Already detached. */ }
      try { gain.disconnect(); } catch { /* Already detached. */ }
    }
    this._nodes.clear();
    const context = this._context;
    this._context = null;
    if (context && context.state !== 'closed') {
      try {
        Promise.resolve(context.close()).catch(() => {
          try { Promise.resolve(context.suspend()).catch(() => {}); } catch { /* Already closed. */ }
        });
      } catch {
        try { Promise.resolve(context.suspend()).catch(() => {}); } catch { /* Already closed. */ }
      }
    }
  }
}
