/**
 * TrailNet on-device: reads Sentinel-2 B02/B03/B04/B08 for an area in the
 * scene's native UTM grid (the grid the model was trained on), runs the
 * network in overlapping patches, and turns the probability map into
 * routable "detected" trails that are not in OSM yet.
 */
import type { BBox } from '../config';
import { lngLatToUtm, zoneFromEpsg } from '../geo/utm';
import type { OsmWay, Trail } from '../trails/types';
import { dilate, erode, Grid, hysteresis, rasterizeLines, removeSmall, skeletonize, traceSkeleton } from './raster';
import { chainsToTrails } from './vectorize';

/** Runs the network on one normalised CHW patch, returns logits (H×W). */
export type Infer = (input: Float32Array, h: number, w: number) => Promise<Float32Array>;

export const PATCH = 256;
export const OVERLAP = 24;

/** Must match ml/train_trailnet.py normalize(). */
export function normalizeBand(dn: ArrayLike<number>, out: Float32Array, offset: number) {
  for (let i = 0; i < dn.length; i++) {
    const r = Math.min(0.5, Math.max(0, dn[i] * 1e-4 - 0.1));
    out[offset + i] = r / 0.25 - 1;
  }
}

/** UTM raster of class probabilities. */
export interface ProbRaster {
  epsg: number;
  originX: number;
  originY: number;
  res: number;
  width: number;
  height: number;
  prob: Float32Array;
}

/**
 * Sliding-window inference over a 4-band image (CHW, already normalised).
 * Patches overlap and only their centres are kept, so there are no seams.
 */
export async function predict(img: Float32Array, h: number, w: number, infer: Infer): Promise<Float32Array> {
  const prob = new Float32Array(h * w);
  const step = PATCH - 2 * OVERLAP;
  const ph = Math.min(PATCH, Math.ceil(h / 8) * 8);
  const pw = Math.min(PATCH, Math.ceil(w / 8) * 8);
  const patch = new Float32Array(4 * ph * pw);
  for (let y0 = 0; y0 < h; y0 += step) {
    for (let x0 = 0; x0 < w; x0 += step) {
      // Clamp the window inside the image (edge patches shift inward).
      const py = Math.max(0, Math.min(y0 - OVERLAP, h - ph));
      const px = Math.max(0, Math.min(x0 - OVERLAP, w - pw));
      patch.fill(-1);
      for (let c = 0; c < 4; c++)
        for (let y = 0; y < ph && py + y < h; y++)
          for (let x = 0; x < pw && px + x < w; x++) patch[c * ph * pw + y * pw + x] = img[c * h * w + (py + y) * w + px + x];
      const logits = await infer(patch, ph, pw);
      // Keep the central part of the patch for the cells this step owns.
      for (let y = Math.max(y0, py); y < Math.min(y0 + step, py + ph, h); y++)
        for (let x = Math.max(x0, px); x < Math.min(x0 + step, px + pw, w); x++)
          prob[y * w + x] = 1 / (1 + Math.exp(-logits[(y - py) * pw + (x - px)]));
    }
  }
  return prob;
}

export interface ImageryDetectOptions {
  threshold: number;
  /** Output grid cell (m). */
  cell: number;
  knownRadius: number;
}

const PARALLEL_RADIUS = 40;
const PARALLEL_SHARE = 0.6;

/** Probability map → new trails not already in OSM. */
export function detectFromProbability(p: ProbRaster, bbox: BBox, osmWays: Iterable<OsmWay>, o: ImageryDetectOptions): Trail[] {
  const g = new Grid(bbox, o.cell);
  const zone = zoneFromEpsg(p.epsg);
  // Resample UTM probabilities onto the metric Mercator grid (nearest neighbour).
  const score = new Float32Array(g.size);
  const tmp = [0, 0];
  for (let cy = 0; cy < g.height; cy++) {
    for (let cx = 0; cx < g.width; cx++) {
      const [lng, lat] = g.toLngLat(cx, cy);
      lngLatToUtm(lng, lat, zone, tmp);
      const ix = Math.floor((tmp[0] - p.originX) / p.res);
      const iy = Math.floor((p.originY - tmp[1]) / p.res);
      if (ix >= 0 && iy >= 0 && ix < p.width && iy < p.height) score[cy * g.width + cx] = p.prob[iy * p.width + ix];
    }
  }
  const ways = [...osmWays];
  const lines = () => ways.map((w) => w.geometry.map((q) => [q.lon, q.lat] as [number, number]));
  const known = rasterizeLines(g, lines(), o.knownRadius);
  const nearKnown = rasterizeLines(g, lines(), PARALLEL_RADIUS);
  const allow = new Uint8Array(g.size);
  for (let i = 0; i < g.size; i++) allow[i] = known[i] ? 0 : 1;
  let m = hysteresis(score, g.width, g.height, o.threshold * 0.5, o.threshold, allow);
  // Bridge small gaps (canopy breaks) before thinning.
  m = erode(erode(dilate(dilate(m, g.width, g.height), g.width, g.height), g.width, g.height), g.width, g.height);
  m = removeSmall(m, g.width, g.height, Math.ceil(600 / (o.cell * o.cell)));
  const chains = traceSkeleton(skeletonize(m, g.width, g.height), g.width, g.height).filter((c) => {
    let near = 0;
    for (const i of c) near += nearKnown[i];
    return near / c.length < PARALLEL_SHARE;
  });
  return chainsToTrails(g, chains, ways, {
    source: 'imagery',
    minLength: 120,
    simplifyM: 5,
    snapM: o.knownRadius + 25,
    score,
    confidence: (mean) => Math.min(1, Math.max(0, (mean - o.threshold) / (1 - o.threshold)) * 0.8 + 0.2),
  });
}
