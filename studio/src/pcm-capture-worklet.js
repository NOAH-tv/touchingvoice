/** Audio render-thread capture. Never depends on animation frames or UI work.
 * Output is always silent. Input channel 0 is copied before monitor effects.
 */
class TouchingVoicePcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false; this.finished = false; this.frames = 0; this.fill = 0;
    this.chunk = new Float32Array(8192); this.maxFrames = 0; this.startedFrame = 0;
    this.port.onmessage = event => {
      const message = event.data;
      if (message?.type === 'start' && !this.active && !this.finished) {
        if (!Number.isInteger(message.maxFrames) || message.maxFrames < 1 || message.maxFrames > sampleRate * 300) {
          this.port.postMessage({ type: 'error', message: '녹음 길이 설정이 올바르지 않습니다.' }); return;
        }
        this.maxFrames = message.maxFrames; this.active = true; this.startedFrame = currentFrame;
        this.port.postMessage({ type: 'started', sampleRate, startedFrame: this.startedFrame });
      } else if (message?.type === 'stop') this.finish('stopped');
      else if (message?.type === 'abort') { this.active = false; this.finished = true; this.chunk = null; }
    };
  }
  flush() {
    if (!this.fill) return;
    const buffer = this.fill === this.chunk.length ? this.chunk : this.chunk.slice(0, this.fill);
    this.port.postMessage({ type: 'chunk', offset: this.frames - this.fill, data: buffer.buffer }, [buffer.buffer]);
    this.chunk = new Float32Array(8192); this.fill = 0;
  }
  finish(reason) {
    if (this.finished) return;
    this.active = false; this.finished = true; this.flush();
    this.port.postMessage({ type: 'finished', reason, frames: this.frames, sampleRate,
      startedFrame: this.startedFrame, endedFrame: this.startedFrame + this.frames });
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.active) return !this.finished;
    const input = inputs[0]?.[0];
    if (!input?.length) {
      // Do not fabricate a gap with zeros if an input disappears mid-recording.
      if (this.frames) this.finish('input-ended');
      return !this.finished;
    }
    const length = Math.min(input.length, this.maxFrames - this.frames);
    let position = 0;
    while (position < length) {
      const count = Math.min(length - position, this.chunk.length - this.fill);
      this.chunk.set(input.subarray(position, position + count), this.fill);
      position += count; this.fill += count; this.frames += count;
      if (this.fill === this.chunk.length) this.flush();
    }
    if (this.frames >= this.maxFrames) this.finish('limit');
    return !this.finished;
  }
}
registerProcessor('touchingvoice-pcm-capture-v1', TouchingVoicePcmCapture);
