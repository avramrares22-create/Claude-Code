import proj4 from 'proj4';
import { describe, expect, it } from 'vitest';
import { lngToTileX, latToTileY, tileXToLng, tileYToLat } from '../src/engine/geo/mercator';
import {
  buildNdviLut,
  buildToneLut,
  chooseLevel,
  paintWindow,
  projectTilePixels,
  utmExtent,
  windowFor,
  type Level,
  type PaintContext,
  type RasterWindow,
} from '../src/engine/imagery/renderTile';

const zone35 = { zone: 35, south: false };
const identity: PaintContext = {
  mode: 'truecolor',
  toneLut: buildToneLut({ black: 0, white: 1, gamma: 1, saturation: 1 }),
  ndviLut: buildNdviLut(),
  saturation: 1,
};

// A z14 tile over the Bucegi plateau.
const z = 14;
const tx = Math.floor(lngToTileX(25.46, z));
const ty = Math.floor(latToTileY(45.43, z));

/** Synthetic 10 m raster whose R channel = column, G = row, so we can check where each pixel sampled. */
function syntheticWindow(ext: [number, number, number, number]): RasterWindow {
  const res = 10;
  const level: Level = {
    width: 10980,
    height: 10980,
    originX: Math.floor(ext[0] / res) * res - 200,
    originY: Math.ceil(ext[3] / res) * res + 200,
    resX: res,
    resY: res,
  };
  const w = windowFor(level, ext)!;
  const width = w[2] - w[0];
  const height = w[3] - w[1];
  const data = new Uint8Array(width * height * 3);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const o = (r * width + c) * 3;
      data[o] = (w[0] + c) % 256;
      data[o + 1] = (w[1] + r) % 256;
      data[o + 2] = 1;
    }
  }
  return { level, x0: w[0], y0: w[1], width, height, data, bands: 3 };
}

describe('projectTilePixels', () => {
  it('approximates exact projection to well under a Sentinel pixel', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    let maxErr = 0;
    for (const [i, j] of [[0, 0], [255, 0], [128, 128], [37, 201], [255, 255]]) {
      const lng = tileXToLng(tx + (i + 0.5) / 256, z);
      const lat = tileYToLat(ty + (j + 0.5) / 256, z);
      const [e, n] = proj4('WGS84', '+proj=utm +zone=35 +datum=WGS84 +units=m', [lng, lat]);
      const o = (j * 256 + i) * 2;
      maxErr = Math.max(maxErr, Math.hypot(px[o] - e, px[o + 1] - n));
    }
    expect(maxErr).toBeLessThan(0.05);
  });
});

describe('paintWindow', () => {
  it('samples the right source pixel for every output pixel', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    const win = syntheticWindow(utmExtent(px));
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    const filled = paintWindow(rgba, px, win, identity);
    expect(filled).toBe(256 * 256);

    for (const [i, j] of [[3, 7], [128, 128], [250, 240]]) {
      const o = (j * 256 + i) * 2;
      const col = (px[o] - win.level.originX) / 10 - 0.5;
      const row = (win.level.originY - px[o + 1]) / 10 - 0.5;
      const p = (j * 256 + i) * 4;
      // Bilinear over integer ramps reproduces the fractional coordinate (mod 256).
      expect(Math.abs(rgba[p] - (col % 256))).toBeLessThanOrEqual(1);
      expect(Math.abs(rgba[p + 1] - (row % 256))).toBeLessThanOrEqual(1);
      expect(rgba[p + 3]).toBe(255);
    }
  });

  it('treats all-zero pixels as nodata and leaves them for the next scene', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    const win = syntheticWindow(utmExtent(px));
    (win.data as Uint8Array).fill(0);
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    expect(paintWindow(rgba, px, win, identity)).toBe(0);
  });

  it('never overwrites pixels painted by a better scene', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    const win = syntheticWindow(utmExtent(px));
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    rgba.fill(77);
    expect(paintWindow(rgba, px, win, identity)).toBe(0);
    expect(rgba[0]).toBe(77);
  });

  it('renders NDVI from red/nir reflectance', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    const ext = utmExtent(px);
    const base = syntheticWindow(ext);
    const n = base.width * base.height;
    const data = new Uint16Array(n * 2);
    // red reflectance 0.05, nir 0.45 → NDVI 0.8 (dense forest).
    for (let i = 0; i < n; i++) {
      data[i * 2] = (0.05 + 0.1) * 1e4;
      data[i * 2 + 1] = (0.45 + 0.1) * 1e4;
    }
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    paintWindow(rgba, px, { ...base, data, bands: 2 }, { ...identity, mode: 'ndvi' });
    // Dense vegetation should be strongly green.
    expect(rgba[1]).toBeGreaterThan(rgba[0] + 40);
    expect(rgba[1]).toBeGreaterThan(rgba[2] + 40);
  });
});

describe('chooseLevel', () => {
  const levels = [10, 20, 40, 80, 160, 320].map((r) => ({ width: 1, height: 1, originX: 0, originY: 0, resX: r, resY: r }));
  it('uses the coarsest level that is still sharp enough', () => {
    expect(chooseLevel(levels, 6.6)).toBe(0);
    expect(chooseLevel(levels, 25)).toBe(1);
    expect(chooseLevel(levels, 170)).toBe(4);
    expect(chooseLevel(levels, 5000)).toBe(5);
  });
});

describe('cloud mask', () => {
  it('skips pixels the SCL marks as cloud, keeps snow', () => {
    const px = projectTilePixels(z, tx, ty, zone35);
    const win = syntheticWindow(utmExtent(px));
    // 20 m mask over the same area: left half cloud (9), right half snow (11).
    const ext = utmExtent(px);
    const mlevel = { ...win.level, resX: 20, resY: 20, width: 5490, height: 5490 };
    const mw = windowFor(mlevel, ext)!;
    const width = mw[2] - mw[0];
    const height = mw[3] - mw[1];
    const data = new Uint8Array(width * height);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data[r * width + c] = c < width / 2 ? 9 : 11;
    const rgba = new Uint8ClampedArray(256 * 256 * 4);
    const filled = paintWindow(rgba, px, { ...win, mask: { level: mlevel, x0: mw[0], y0: mw[1], width, height, data } }, identity);
    expect(filled).toBeGreaterThan(256 * 256 * 0.3);
    expect(filled).toBeLessThan(256 * 256 * 0.7);
    // Left edge masked (cloud), right edge painted (snow is real ground).
    expect(rgba[(128 * 256 + 2) * 4 + 3]).toBe(0);
    expect(rgba[(128 * 256 + 253) * 4 + 3]).toBe(255);
  });
});
