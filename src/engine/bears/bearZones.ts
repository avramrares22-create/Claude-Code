import { riskIndex, type BearGrid } from './bearRisk';

/**
 * Bear-zones overlay: one ~200 m tile drawn as a soft heat layer on the same
 * 1–100 scale as the bear meter, so what you see on the map matches the widget.
 * Low areas stay clear (cities, farmland); yellow → orange → red where bears live.
 */
const STOPS: Array<[number, [number, number, number, number]]> = [
  [0, [255, 213, 79, 0]],
  [18, [255, 213, 79, 0]],
  [30, [255, 202, 40, 0.14]],
  [50, [251, 140, 0, 0.24]],
  [70, [229, 57, 53, 0.32]],
  [100, [183, 28, 28, 0.42]],
];

function colour(index: number): [number, number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i];
    if (index <= b) {
      const [a, ca] = STOPS[i - 1];
      const t = (index - a) / (b - a);
      return [0, 1, 2, 3].map((k) => ca[k] + (cb[k] - ca[k]) * t) as [number, number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** 256-entry lookup: encoded byte → RGBA (season applied to density). */
export function zonePalette(grid: BearGrid, season: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let q = 0; q < 256; q++) {
    const d = grid.decode(q) * season;
    const [r, g, b, a] = d > 0 ? colour(riskIndex(d)) : [0, 0, 0, 0];
    lut.set([r, g, b, Math.round(a * 255)], q * 4);
  }
  return lut;
}

/** Draws one 1° tile to a PNG data URL (null when the whole tile is clear). */
export function renderZoneTile(bytes: Uint8Array, size: number, lut: Uint8ClampedArray): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  let any = false;
  for (let i = 0; i < bytes.length; i++) {
    const o = bytes[i] * 4;
    if (lut[o + 3] === 0) continue;
    any = true;
    img.data[i * 4] = lut[o];
    img.data[i * 4 + 1] = lut[o + 1];
    img.data[i * 4 + 2] = lut[o + 2];
    img.data[i * 4 + 3] = lut[o + 3];
  }
  if (!any) return null;
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
