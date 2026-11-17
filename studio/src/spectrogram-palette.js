// Display colors only. Preserve the existing normalized intensity p and signal processing.
// User-specified RX color order. Approximate chosen stops, not a verified RX LUT.
export const SPECTROGRAM_PALETTE = Object.freeze({
  id: 'user-rx-order-v2',
  label: '사용자 지정 RX 색 순서',
  stops: Object.freeze([
    [0.00, 0, 0, 0],
    [0.12, 0, 8, 45],
    [0.25, 0, 42, 180],
    [0.38, 0, 122, 150],
    [0.50, 0, 175, 50],
    [0.62, 155, 155, 12],
    [0.75, 245, 35, 18],
    [0.84, 255, 55, 50],
    [0.94, 255, 185, 185],
    [1.00, 255, 255, 255],
  ].map(Object.freeze)),
});

export function writeSpectrogramColor(rgba, offset, intensity) {
  const p = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;
  const stops = SPECTROGRAM_PALETTE.stops;
  let i = 1;
  while (i < stops.length - 1 && p > stops[i][0]) i++;
  const a = stops[i - 1], b = stops[i], t = (p - a[0]) / (b[0] - a[0]);
  for (let c = 0; c < 3; c++) rgba[offset + c] = Math.round(a[c + 1] + t * (b[c + 1] - a[c + 1]));
  rgba[offset + 3] = 255;
}
