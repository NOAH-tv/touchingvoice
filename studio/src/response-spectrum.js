// Shared exact FFT; original offline numerical implementation preserved.
const FILE_FFT_SIZE=4096, FILE_SPECTRUM_FLOOR_DB=-120;
/**
 * Reusable radix-2 FFT with the Web Audio Blackman window and 1/N magnitude
 * normalization. No analyser temporal smoothing is applied offline.
 * https://webaudio.github.io/web-audio-api/#fft-windowing-and-smoothing-over-time
 * The returned spectrum is scratch storage; copy it if retaining a frame.
 */
export function createFileSpectrumAnalyzer(size = FILE_FFT_SIZE) {
  if (!Number.isInteger(size) || size < 32 || size > 32768 || (size & (size - 1))) {
    throw new TypeError('FFT 크기는 32–32768 범위의 2의 거듭제곱이어야 합니다.');
  }
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  const window = new Float64Array(size), reversed = new Uint32Array(size);
  const cosines = new Float64Array(size / 2), sines = new Float64Array(size / 2);
  const spectrum = new Float32Array(size / 2);
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    window[i] = .42 - .5 * Math.cos(2 * Math.PI * i / size) + .08 * Math.cos(4 * Math.PI * i / size);
    let value = i, reverse = 0;
    for (let bit = 0; bit < bits; bit++) { reverse = (reverse << 1) | (value & 1); value >>>= 1; }
    reversed[i] = reverse;
  }
  for (let i = 0; i < size / 2; i++) {
    cosines[i] = Math.cos(-2 * Math.PI * i / size);
    sines[i] = Math.sin(-2 * Math.PI * i / size);
  }
  return waveform => {
    if (!waveform || waveform.length !== size) throw new TypeError('FFT 입력 길이가 올바르지 않습니다.');
    imaginary.fill(0);
    for (let i = 0; i < size; i++) {
      const sample = waveform[i];
      if (!Number.isFinite(sample)) throw new TypeError('오디오에 유효하지 않은 샘플이 있습니다.');
      real[reversed[i]] = sample * window[i];
    }
    for (let length = 2; length <= size; length *= 2) {
      const half = length / 2, step = size / length;
      for (let start = 0; start < size; start += length) {
        for (let j = 0; j < half; j++) {
          const a = start + j, b = a + half, twiddle = j * step;
          const re = real[b] * cosines[twiddle] - imaginary[b] * sines[twiddle];
          const im = real[b] * sines[twiddle] + imaginary[b] * cosines[twiddle];
          real[b] = real[a] - re;
          imaginary[b] = imaginary[a] - im;
          real[a] += re;
          imaginary[a] += im;
        }
      }
    }
    for (let i = 0; i < spectrum.length; i++) {
      const magnitude = Math.hypot(real[i], imaginary[i]) / size;
      spectrum[i] = magnitude > 0 ? Math.max(FILE_SPECTRUM_FLOOR_DB, 20 * Math.log10(magnitude)) : FILE_SPECTRUM_FLOOR_DB;
    }
    return spectrum;
  };
}

