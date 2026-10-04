/**
 * Combines detections from independent sources. When imagery and GPS traces
 * agree on a corridor, keep the GPS geometry (people actually walked it) and
 * raise its confidence; imagery-only and GPS-only detections pass through.
 */
import { haversine } from '../geo/geodesy';
import type { Trail } from '../trails/types';

const AGREE_M = 25;
const AGREE_SHARE = 0.5;

function distToLine(p: [number, number], line: Array<[number, number]>): number {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110540;
  let best = Infinity;
  for (let k = 1; k < line.length; k++) {
    const [x0, y0] = line[k - 1], [x1, y1] = line[k];
    const ax = (x1 - x0) * kx, ay = (y1 - y0) * ky, px = (p[0] - x0) * kx, py = (p[1] - y0) * ky;
    const L2 = ax * ax + ay * ay;
    const t = L2 ? Math.max(0, Math.min(1, (px * ax + py * ay) / L2)) : 0;
    best = Math.min(best, Math.hypot(px - t * ax, py - t * ay));
  }
  return best;
}

/** Densify to ~10 m so agreement is measured along the whole line, not just vertices. */
function samples(t: Trail): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k < t.coords.length; k++) {
    const a = t.coords[k - 1], b = t.coords[k];
    const n = Math.max(1, Math.ceil(haversine(...a, ...b) / 10));
    for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  }
  out.push(t.coords[t.coords.length - 1]);
  return out;
}

function agreement(a: Trail, b: Trail): number {
  const s = samples(a);
  let near = 0;
  for (const p of s) if (distToLine(p, b.coords) <= AGREE_M) near++;
  return near / s.length;
}

export function mergeDetections(gps: Trail[], imagery: Trail[]): Trail[] {
  const boosted = gps.map((g) => ({ ...g }));
  const keptImagery: Trail[] = [];
  for (const im of imagery) {
    let matched = false;
    for (const g of boosted) {
      if (agreement(im, g) >= AGREE_SHARE) {
        matched = true;
        // Two independent sources: combine as independent evidence.
        g.confidence = 1 - (1 - g.confidence) * (1 - im.confidence);
        g.tags = { ...g.tags, 'detected:sources': 'gps;imagery' };
      }
    }
    if (!matched) keptImagery.push(im);
  }
  return [...boosted, ...keptImagery];
}
