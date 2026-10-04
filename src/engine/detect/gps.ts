/**
 * Finds trails people actually use but nobody mapped, from OpenStreetMap's
 * public GPS traces — an open-data take on a ride/hike heatmap.
 */
import type { BBox } from '../config';
import { haversine } from '../geo/geodesy';
import type { OsmWay, Tags, Trail } from '../trails/types';
import { dilate, erode, forEachCellOnLine, Grid, rasterizeLines, removeSmall, skeletonize, traceSkeleton } from './raster';
import { chainsToTrails } from './vectorize';
import { fetchSafe } from '../util/net';

export interface TracePoint {
  lat: number;
  lon: number;
  /** ms since epoch, if the trace is timed. */
  t?: number;
}

export type Trace = TracePoint[];

/** Minimal GPX 1.0/1.1 parser (regex based: works in workers, no DOMParser). */
export function parseGpx(xml: string): Trace[] {
  const traces: Trace[] = [];
  for (const seg of xml.split(/<trkseg>/).slice(1)) {
    const body = seg.split(/<\/trkseg>/)[0];
    const pts: Trace = [];
    const re = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
    for (let m = re.exec(body); m; m = re.exec(body)) {
      const time = m[3] ? /<time>([^<]+)<\/time>/.exec(m[3]) : null;
      pts.push({ lat: Number(m[1]), lon: Number(m[2]), t: time ? Date.parse(time[1]) : undefined });
    }
    if (pts.length > 1) traces.push(pts);
  }
  return traces;
}

const API = 'https://api.openstreetmap.org/api/0.6/trackpoints';

/**
 * Downloads public trackpoints (5000 per page). The OSM API is a shared
 * resource: callers should request small areas on demand and cache results.
 */
export async function fetchTraces(bbox: BBox, maxPages = 12, signal?: AbortSignal): Promise<Trace[]> {
  const traces: Trace[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchSafe(`${API}?bbox=${bbox.join(',')}&page=${page}`, { signal, timeoutMs: 30_000 });
    const xml = await res.text();
    const got = parseGpx(xml);
    traces.push(...got);
    if ((xml.match(/<trkpt/g)?.length ?? 0) < 5000) break;
  }
  return traces;
}

export interface GpsDetectOptions {
  /** Grid cell size in metres. */
  cell: number;
  /** Distinct traces needed for a corridor to count. */
  minTraces: number;
  /** Mapped ways closer than this are "already known". */
  knownRadius: number;
}

export const GPS_DEFAULTS: GpsDetectOptions = { cell: 4, minTraces: 2, knownRadius: 20 };

/** A detection hugging a mapped way this closely is the same trail, offset by GPS/map error. */
const PARALLEL_RADIUS = 40;
const PARALLEL_SHARE = 0.6;

export interface GpsDetection {
  trails: Trail[];
  /** Distinct traces per cell, for a heat layer. */
  grid: Grid;
  heat: Uint16Array;
  traces: number;
}

const KMH = 1 / 3.6;

export function detectFromTraces(
  traces: Trace[],
  bbox: BBox,
  osmWays: Iterable<OsmWay>,
  opts: Partial<GpsDetectOptions> = {},
): GpsDetection {
  const o = { ...GPS_DEFAULTS, ...opts };
  const g = new Grid(bbox, o.cell);
  const heat = new Uint16Array(g.size);
  const stamp = new Int32Array(g.size).fill(-1);
  const speedSum = new Float32Array(g.size);
  const speedN = new Uint16Array(g.size);
  // GPS error is ~5–10 m: draw each trace as an 8 m wide band.
  const radius = 8 / o.cell;

  traces.forEach((tr, id) => {
    for (let k = 1; k < tr.length; k++) {
      const a = tr[k - 1], b = tr[k];
      const d = haversine(a.lon, a.lat, b.lon, b.lat);
      if (d > 60 || d < 0.5) continue; // signal gaps / standing still
      const dt = a.t !== undefined && b.t !== undefined ? (b.t - a.t) / 1000 : 0;
      const v = dt > 0 ? d / dt : NaN;
      if (v > 40) continue; // teleport / glitch
      forEachCellOnLine(g, g.toCell(a.lon, a.lat), g.toCell(b.lon, b.lat), radius, (i) => {
        if (stamp[i] !== id) {
          stamp[i] = id;
          heat[i]++;
        }
        if (Number.isFinite(v)) {
          speedSum[i] += v;
          speedN[i]++;
        }
      });
    }
  });

  const wayLines = () =>
    (function* () {
      for (const w of osmWays) yield w.geometry.map((p) => [p.lon, p.lat] as [number, number]);
    })();
  const known = rasterizeLines(g, wayLines(), o.knownRadius);
  const nearKnown = rasterizeLines(g, wayLines(), PARALLEL_RADIUS);

  let cand: Uint8Array = new Uint8Array(g.size);
  for (let i = 0; i < g.size; i++) if (heat[i] >= o.minTraces && !known[i]) cand[i] = 1;
  cand = erode(dilate(cand, g.width, g.height), g.width, g.height); // close small gaps
  cand = removeSmall(cand, g.width, g.height, Math.ceil(400 / (o.cell * o.cell)));
  const skel = skeletonize(cand, g.width, g.height);
  const chains = traceSkeleton(skel, g.width, g.height).filter((c) => {
    let near = 0;
    for (const i of c) near += nearKnown[i];
    return near / c.length < PARALLEL_SHARE;
  });

  const usage = (chain: number[]): Tags => {
    let s = 0, n = 0;
    for (const i of chain) {
      s += speedSum[i];
      n += speedN[i];
    }
    if (!n) return {};
    const v = s / n;
    // Moving speed tells how the trail is used — and vehicles mean a track, not a path.
    if (v < 8 * KMH) return { 'detected:usage': 'foot' };
    if (v < 32 * KMH) return { 'detected:usage': 'bike' };
    return { 'detected:usage': 'vehicle', highway: 'track' };
  };

  const trails = chainsToTrails(g, chains, osmWays, {
    source: 'gps',
    minLength: 80,
    simplifyM: 3,
    snapM: o.knownRadius + 20,
    score: heat,
    confidence: (mean) => 1 - Math.exp(-mean / 3),
    tags: usage,
  });
  return { trails, grid: g, heat, traces: traces.length };
}
