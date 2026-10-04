/**
 * AI trail alignment: many OSM trails were drawn from old, noisy GPS and sit
 * 10–30 m beside the real path. TrailNet's probability map shows where the
 * path actually is, so each way is shifted sideways onto that ridge.
 *
 * Conservative by design: a way moves only when the evidence is consistent
 * along most of its length; junction vertices stay put so the network stays
 * connected; vertex count (and node ids) never change.
 */
import { lngLatToUtm, zoneFromEpsg } from '../geo/utm';
import type { OsmWay } from '../trails/types';
import type { ProbRaster } from './trailnet';

export interface AlignOptions {
  /** Search this far either side of the mapped line (m). */
  maxShift: number;
  /** Probability needed to accept a lateral position. */
  minProb: number;
  /** Fraction of samples that must find the trail. */
  minSupport: number;
  /** Ignore ways already within this distance of the ridge (m). */
  minShift: number;
  /** Offsets fade to 0 within this distance of junctions/ends (m). */
  anchorTaper: number;
}

export const ALIGN_DEFAULTS: AlignOptions = { maxShift: 25, minProb: 0.3, minSupport: 0.6, minShift: 5, anchorTaper: 30 };

export interface Alignment {
  wayId: number;
  coords: Array<[number, number]>;
  /** Median correction (m). */
  shift: number;
  /** Fraction of the way where the trail was found in imagery. */
  support: number;
}

const SAMPLE_M = 10;
const OFFSET_STEP = 2.5;

/** Bilinear probability at a UTM position (0 outside the raster). */
function probAt(p: ProbRaster, e: number, n: number): number {
  const fx = (e - p.originX) / p.res - 0.5;
  const fy = (p.originY - n) / p.res - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  if (ix < 0 || iy < 0 || ix >= p.width - 1 || iy >= p.height - 1) return 0;
  const ax = fx - ix, ay = fy - iy, i = iy * p.width + ix, w = p.width;
  return (p.prob[i] * (1 - ax) + p.prob[i + 1] * ax) * (1 - ay) + (p.prob[i + w] * (1 - ax) + p.prob[i + w + 1] * ax) * ay;
}

function median(a: number[]): number {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

export function alignWays(p: ProbRaster, ways: OsmWay[], opts: Partial<AlignOptions> = {}): Alignment[] {
  const o = { ...ALIGN_DEFAULTS, ...opts };
  const zone = zoneFromEpsg(p.epsg);
  // Junctions: nodes used more than once across the loaded ways.
  const uses = new Map<number, number>();
  for (const w of ways) for (const id of w.nodes) uses.set(id, (uses.get(id) ?? 0) + 1);
  const out: Alignment[] = [];
  const tmp = [0, 0];

  for (const w of ways) {
    const g = w.geometry;
    if (g.length < 2) continue;
    // Local metric frame around the way (east/north metres).
    const lat0 = g[0].lat;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
    const xy = g.map((q) => [(q.lon - g[0].lon) * kx, (q.lat - lat0) * ky] as [number, number]);
    const along = [0];
    for (let i = 1; i < xy.length; i++) along.push(along[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
    const L = along[along.length - 1];
    if (L < 60) continue;

    // Densified samples with unit normals.
    const n = Math.max(2, Math.round(L / SAMPLE_M) + 1);
    const sAlong: number[] = [], sOff: number[] = [];
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const a = (L * k) / (n - 1);
      while (seg < xy.length - 2 && along[seg + 1] < a) seg++;
      const t = (a - along[seg]) / Math.max(1e-9, along[seg + 1] - along[seg]);
      const x = xy[seg][0] + (xy[seg + 1][0] - xy[seg][0]) * t;
      const y = xy[seg][1] + (xy[seg + 1][1] - xy[seg][1]) * t;
      const dx = xy[seg + 1][0] - xy[seg][0], dy = xy[seg + 1][1] - xy[seg][1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      // Scan across the line; prefer small moves on ties.
      let best = -Infinity, bestD = NaN, bestP = 0;
      for (let d = -o.maxShift; d <= o.maxShift + 1e-9; d += OFFSET_STEP) {
        const lng = g[0].lon + (x + nx * d) / kx;
        const lat = lat0 + (y + ny * d) / ky;
        lngLatToUtm(lng, lat, zone, tmp);
        const pr = probAt(p, tmp[0], tmp[1]);
        const score = pr - 0.004 * Math.abs(d);
        if (score > best) {
          best = score;
          bestD = d;
          bestP = pr;
        }
      }
      sAlong.push(a);
      sOff.push(bestP >= o.minProb ? bestD : NaN);
    }

    const valid = sOff.filter(Number.isFinite).length;
    const support = valid / n;
    if (support < o.minSupport) continue;

    // Robust smoothing: running median (window 9), then running mean (window 5).
    const med = sOff.map((_, i) => median(sOff.slice(Math.max(0, i - 4), i + 5)));
    // Fill gaps by linear interpolation between known offsets.
    const known = med.map((v, i) => [i, v] as const).filter(([, v]) => Number.isFinite(v));
    const filled = med.map((v, i) => {
      if (Number.isFinite(v)) return v;
      const prev = [...known].reverse().find(([j]) => j < i), next = known.find(([j]) => j > i);
      if (prev && next) return prev[1] + ((next[1] - prev[1]) * (i - prev[0])) / (next[0] - prev[0]);
      return (prev ?? next)![1];
    });
    const smooth = filled.map((_, i) => {
      const win = filled.slice(Math.max(0, i - 2), i + 3);
      return win.reduce((a, b) => a + b, 0) / win.length;
    });
    const shift = median(smooth.map(Math.abs));
    if (!(shift >= o.minShift)) continue;

    // Anchor ends and junctions (offset fades to 0 near them).
    const anchors = [0, L, ...w.nodes.map((id, i) => ((uses.get(id) ?? 0) > 1 ? along[i] : NaN)).filter(Number.isFinite)];
    const taper = (a: number) => Math.min(1, Math.min(...anchors.map((x) => Math.abs(a - x))) / o.anchorTaper);
    const offsetAt = (a: number) => {
      const f = (a / L) * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      return smooth[i] + (smooth[i + 1] - smooth[i]) * (f - i);
    };

    const coords = g.map((q, i) => {
      // Vertex normal: average of adjacent segment normals.
      const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const d = offsetAt(along[i]) * taper(along[i]);
      return [q.lon + ((-dy / len) * d) / kx, q.lat + ((dx / len) * d) / ky] as [number, number];
    });
    out.push({ wayId: w.id, coords, shift, support });
  }
  return out;
}
