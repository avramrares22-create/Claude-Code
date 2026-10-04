/**
 * Pure tile-rendering core: reprojects UTM rasters into a Web Mercator tile.
 *
 * No I/O here — the worker feeds it raster windows — so it is unit-testable and
 * can be reused by an offline pre-rendering pipeline later.
 */
import { tileXToLng, tileYToLat } from '../geo/mercator';
import { lngLatToUtm, type UtmZone } from '../geo/utm';

export type ImageryMode = 'truecolor' | 'ndvi';

/** One pyramid level of a COG, in its native UTM grid. */
export interface Level {
  width: number;
  height: number;
  /** Top-left corner of the image (pixel corner, not centre). */
  originX: number;
  originY: number;
  /** Pixel size in metres, both positive. */
  resX: number;
  resY: number;
}

/** Sentinel-2 scene classification window (SCL, 20 m), one class code per pixel. */
export interface MaskWindow {
  level: Level;
  x0: number;
  y0: number;
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/**
 * SCL classes treated as "no data" so the next scene fills them:
 * 1 saturated/defective, 3 cloud shadow, 8/9 cloud (medium/high), 10 thin cirrus.
 * Snow (11) and dark terrain (2) are kept — they are real ground in the Carpathians.
 */
export const CLOUD_CLASSES = (() => {
  const t = new Uint8Array(256);
  for (const c of [1, 3, 8, 9, 10]) t[c] = 1;
  return t;
})();

export interface RasterWindow {
  level: Level;
  /** Window offset/size in level pixels. */
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** Band-interleaved samples. */
  data: ArrayLike<number>;
  bands: number;
  /** Optional per-pixel cloud mask for this scene. */
  mask?: MaskWindow;
  /**
   * Pixels whose every band is ≤ this count as nodata. 0 for lossless data;
   * JPEG-compressed previews smear their nodata edges into near-black.
   */
  nodataMax?: number;
}

/**
 * UTM coordinates of every output pixel centre, as [E0, N0, E1, N1, ...].
 * Projects an exact (step+1)² grid and bilinearly interpolates in between —
 * the same approximation GDAL uses; error is far below one Sentinel pixel.
 */
export function projectTilePixels(
  z: number,
  x: number,
  y: number,
  zone: UtmZone,
  size = 256,
  step = 16,
): Float64Array {
  const n = size / step;
  const grid = new Float64Array((n + 1) * (n + 1) * 2);
  const tmp = [0, 0];
  for (let j = 0; j <= n; j++) {
    const lat = tileYToLat(y + (j * step) / size, z);
    for (let i = 0; i <= n; i++) {
      const lng = tileXToLng(x + (i * step) / size, z);
      lngLatToUtm(lng, lat, zone, tmp);
      const k = (j * (n + 1) + i) * 2;
      grid[k] = tmp[0];
      grid[k + 1] = tmp[1];
    }
  }
  const out = new Float64Array(size * size * 2);
  for (let py = 0; py < size; py++) {
    const gy = (py + 0.5) / step;
    const j = Math.min(n - 1, Math.floor(gy));
    const fy = gy - j;
    for (let px = 0; px < size; px++) {
      const gx = (px + 0.5) / step;
      const i = Math.min(n - 1, Math.floor(gx));
      const fx = gx - i;
      const k00 = (j * (n + 1) + i) * 2;
      const k10 = k00 + 2;
      const k01 = k00 + (n + 1) * 2;
      const k11 = k01 + 2;
      const o = (py * size + px) * 2;
      for (let c = 0; c < 2; c++) {
        const top = grid[k00 + c] * (1 - fx) + grid[k10 + c] * fx;
        const bot = grid[k01 + c] * (1 - fx) + grid[k11 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return out;
}

/** UTM extent [minE, minN, maxE, maxN] covered by projected pixels. */
export function utmExtent(pixels: Float64Array): [number, number, number, number] {
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (let i = 0; i < pixels.length; i += 2) {
    const e = pixels[i], nn = pixels[i + 1];
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (nn < minN) minN = nn;
    if (nn > maxN) maxN = nn;
  }
  return [minE, minN, maxE, maxN];
}

/** Coarsest level that is still at least as sharp as the target (avoids aliasing). */
export function chooseLevel(levels: Level[], targetRes: number): number {
  let best = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].resX <= targetRes * 1.01 && levels[i].resX >= levels[best].resX) best = i;
  }
  return best;
}

/** Pixel window (with 1px bilinear margin) needed from a level, or null if disjoint. */
export function windowFor(level: Level, ext: [number, number, number, number]): [number, number, number, number] | null {
  const x0 = Math.max(0, Math.floor((ext[0] - level.originX) / level.resX) - 1);
  const x1 = Math.min(level.width, Math.ceil((ext[2] - level.originX) / level.resX) + 1);
  const y0 = Math.max(0, Math.floor((level.originY - ext[3]) / level.resY) - 1);
  const y1 = Math.min(level.height, Math.ceil((level.originY - ext[1]) / level.resY) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1, y1];
}

export interface TrueColorLook {
  black: number;
  white: number;
  gamma: number;
  saturation: number;
}

/** Sentinel TCI is flat and hazy; this gives a natural, punchier look. */
export const DEFAULT_LOOK: TrueColorLook = { black: 0.02, white: 0.82, gamma: 0.85, saturation: 1.2 };

export function buildToneLut(look: TrueColorLook): Uint8Array {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v / 255 - look.black) / (look.white - look.black)));
    lut[v] = Math.round(255 * t ** look.gamma);
  }
  return lut;
}

/** NDVI -> colour: bare/water brown-grey, sparse yellow, dense forest deep green. */
export function buildNdviLut(): Uint8Array {
  const stops: Array<[number, number, number, number]> = [
    [-0.2, 70, 80, 110],
    [0.0, 150, 130, 100],
    [0.2, 215, 200, 120],
    [0.4, 160, 205, 90],
    [0.6, 70, 160, 60],
    [0.9, 10, 80, 30],
  ];
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = -0.2 + (i / 255) * 1.1;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [v0, r0, g0, b0] = stops[k];
    const [v1, r1, g1, b1] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
    lut[i * 3] = r0 + (r1 - r0) * t;
    lut[i * 3 + 1] = g0 + (g1 - g0) * t;
    lut[i * 3 + 2] = b0 + (b1 - b0) * t;
  }
  return lut;
}

/**
 * Samples `bands` values at fractional window position into `out`.
 * Bilinear when all 4 neighbours have data, nearest otherwise. Returns false on nodata.
 */
function sample(win: RasterWindow, sx: number, sy: number, out: Float64Array): boolean {
  const { data, width, height, bands } = win;
  const nodataMax = win.nodataMax ?? 0;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const isValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const o = (y * width + x) * bands;
    for (let b = 0; b < bands; b++) if (data[o + b] > nodataMax) return true;
    return false;
  };
  if (isValid(ix, iy) && isValid(ix + 1, iy) && isValid(ix, iy + 1) && isValid(ix + 1, iy + 1)) {
    const fx = sx - ix;
    const fy = sy - iy;
    const o00 = (iy * width + ix) * bands;
    const o10 = o00 + bands;
    const o01 = o00 + width * bands;
    const o11 = o01 + bands;
    for (let b = 0; b < bands; b++) {
      out[b] =
        (data[o00 + b] * (1 - fx) + data[o10 + b] * fx) * (1 - fy) +
        (data[o01 + b] * (1 - fx) + data[o11 + b] * fx) * fy;
    }
    return true;
  }
  const nx = Math.round(sx);
  const ny = Math.round(sy);
  if (!isValid(nx, ny)) return false;
  const o = (ny * width + nx) * bands;
  for (let b = 0; b < bands; b++) out[b] = data[o + b];
  return true;
}

function isCloud(m: MaskWindow, e: number, n: number): boolean {
  const mx = Math.floor((e - m.level.originX) / m.level.resX) - m.x0;
  const my = Math.floor((m.level.originY - n) / m.level.resY) - m.y0;
  if (mx < 0 || my < 0 || mx >= m.width || my >= m.height) return false;
  return CLOUD_CLASSES[m.data[my * m.width + mx]] === 1;
}

export interface PaintContext {
  mode: ImageryMode;
  toneLut: Uint8Array;
  ndviLut: Uint8Array;
  saturation: number;
}

/**
 * Paints still-empty pixels of `rgba` from one scene window.
 * `pixels` are UTM coordinates in the scene's zone. Returns pixels newly filled.
 */
export function paintWindow(rgba: Uint8ClampedArray, pixels: Float64Array, win: RasterWindow, ctx: PaintContext): number {
  const { level } = win;
  const v = new Float64Array(Math.max(3, win.bands));
  let filled = 0;
  const count = rgba.length / 4;
  for (let p = 0; p < count; p++) {
    if (rgba[p * 4 + 3] !== 0) continue;
    // Pixel centres sit at origin + (i + 0.5) * res, hence the -0.5.
    const sx = (pixels[p * 2] - level.originX) / level.resX - 0.5 - win.x0;
    const sy = (level.originY - pixels[p * 2 + 1]) / level.resY - 0.5 - win.y0;
    if (sx < -0.5 || sy < -0.5 || sx > win.width - 0.5 || sy > win.height - 0.5) continue;
    if (win.mask && isCloud(win.mask, pixels[p * 2], pixels[p * 2 + 1])) continue;
    if (!sample(win, sx, sy, v)) continue;
    const o = p * 4;
    if (ctx.mode === 'truecolor') {
      let r = ctx.toneLut[Math.round(v[0])];
      let g = ctx.toneLut[Math.round(v[1])];
      let b = ctx.toneLut[Math.round(v[2])];
      if (ctx.saturation !== 1) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * ctx.saturation;
        g = l + (g - l) * ctx.saturation;
        b = l + (b - l) * ctx.saturation;
      }
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
    } else {
      // Collection-1 L2A: reflectance = DN * 1e-4 - 0.1.
      const red = Math.max(0, v[0] * 1e-4 - 0.1);
      const nir = Math.max(0, v[1] * 1e-4 - 0.1);
      const ndvi = red + nir > 0 ? (nir - red) / (nir + red) : 0;
      const i = Math.max(0, Math.min(255, Math.round(((ndvi + 0.2) / 1.1) * 255)));
      rgba[o] = ctx.ndviLut[i * 3];
      rgba[o + 1] = ctx.ndviLut[i * 3 + 1];
      rgba[o + 2] = ctx.ndviLut[i * 3 + 2];
    }
    rgba[o + 3] = 255;
    filled++;
  }
  return filled;
}
