/** Encode a bounded segment of a decoded mono/stereo AudioBuffer as PCM16 WAV.
 * Reads channel views without copying the full source. Output is limited to
 * 60 seconds; the one interleaved allocation contains only the chosen segment.
 * Times are seconds; bounds are clipped to the available source. Multichannel
 * sources are rejected rather than silently dropping parts of the recording.
 */
export function audioBufferToWav(buffer, { start = 0, duration } = {}) {
  if (!buffer || typeof buffer.getChannelData !== 'function') throw new TypeError('변환할 오디오 버퍼가 필요합니다.');
  const sampleRate = buffer.sampleRate, channels = buffer.numberOfChannels, length = buffer.length;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new TypeError('지원하지 않는 오디오 샘플레이트입니다.');
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) throw new TypeError('WAV 저장은 모노 또는 스테레오 음성을 지원합니다.');
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('오디오 길이가 올바르지 않습니다.');
  if (typeof start !== 'number' || !Number.isFinite(start)) throw new TypeError('시작 시간은 유한한 숫자여야 합니다.');
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration))) throw new TypeError('녹음 구간은 유한한 숫자여야 합니다.');
  const startFrame = Math.min(length, Math.floor(Math.max(0, start) * sampleRate));
  const requestedFrames = duration === undefined ? length - startFrame : Math.floor(Math.max(0, duration) * sampleRate);
  const frameCount = Math.min(length - startFrame, requestedFrames, sampleRate * 60);
  const channelData = Array.from({ length: channels }, (_, channel) => {
    const data = buffer.getChannelData(channel);
    if (!data || data.length < startFrame + frameCount) throw new TypeError('오디오 채널 데이터가 부족합니다.');
    return data;
  });
  const blockAlign = channels * 2, dataBytes = frameCount * blockAlign;
  const bytes = new ArrayBuffer(44 + dataBytes), view = new DataView(bytes);
  const ascii = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const input = channelData[channel][startFrame + frame];
      const sample = Number.isFinite(input) ? Math.max(-1, Math.min(1, input)) : 0;
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Encode raw mono Float32 capture chunks as signed little-endian PCM24 WAV.
 * No lossy codec, normalization, gate, monitoring effect or amplitude boost.
 * The 24-bit container does not establish the physical ADC's precision.
 * Chunks remain separate so encoding does not duplicate a long Float32 buffer.
 */
export function pcm24ChunksToWav(chunks, sampleRate = 48000) {
  if (!Array.isArray(chunks) || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new TypeError('PCM 채널과 샘플레이트가 올바르지 않습니다.');
  let frameCount = 0;
  for (const chunk of chunks) {
    if (!(chunk instanceof Float32Array)) throw new TypeError('원음 PCM은 Float32 채널이어야 합니다.');
    frameCount += chunk.length;
  }
  if (!Number.isSafeInteger(frameCount) || frameCount > sampleRate * 300) throw new TypeError('원음 녹음은 5분 이내로 저장해 주세요.');
  const dataBytes = frameCount * 3, header = new ArrayBuffer(44), view = new DataView(header);
  const ascii = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + dataBytes + (dataBytes % 2), true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 3, true);
  view.setUint16(32, 3, true); view.setUint16(34, 24, true); ascii(36, 'data'); view.setUint32(40, dataBytes, true);
  const parts = [header];
  for (const chunk of chunks) {
    const bytes = new Uint8Array(chunk.length * 3);
    for (let i = 0; i < chunk.length; i++) {
      const raw = chunk[i], sample = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      const value = Math.round(sample * (sample < 0 ? 8388608 : 8388607));
      bytes[i * 3] = value & 255; bytes[i * 3 + 1] = (value >> 8) & 255; bytes[i * 3 + 2] = (value >> 16) & 255;
    }
    parts.push(bytes);
  }
  if (dataBytes % 2) parts.push(new Uint8Array(1)); // RIFF chunks are word-aligned; data length excludes padding.
  return new Blob(parts, { type: 'audio/wav' });
}
