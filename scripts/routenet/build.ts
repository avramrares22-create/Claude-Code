/**
 * Map-matches GPS traces onto OSM ways and turns them into RouteNet training rows:
 * (mode, features of way + DEM slope) → observed speed.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/routenet/build.ts [rawDir] [out.json]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { Trace } from '../../src/engine/detect/gps';
import { haversine } from '../../src/engine/geo/geodesy';
import { latToTileY, lngToTileX, tilesInBBox } from '../../src/engine/geo/mercator';
import { routeFeatures } from '../../src/engine/routing/routeFeatures';
import { expertModel } from '../../src/engine/routing/routeModel';
import { decodeTerrarium } from '../../src/engine/terrain/elevation';
import { classifyWay } from '../../src/engine/trails/classify';
import type { OsmWay, Trail, TravelMode } from '../../src/engine/trails/types';

const RAW = process.argv[2] ?? 'ml/route_raw';
const OUT = process.argv[3] ?? 'ml/route_rows.json';
const MATCH_M = 12;
const CHUNK_M = 100;

export interface Row {
  region: string;
  mode: TravelMode;
  x: number[];
  /** log(observed speed) − log(expert speed) */
  y: number;
  w: number;
  vObs: number;
  vExpert: number;
}

/** Terrarium DEM for Node (pngjs instead of OffscreenCanvas). */
class NodeDem {
  private tiles = new Map<string, Float32Array>();
  constructor(private z = 12) {}
  async prepare(b: number[]) {
    for (const [z, x, y] of tilesInBBox(b as [number, number, number, number], this.z)) {
      const key = `${x}/${y}`;
      if (this.tiles.has(key)) continue;
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
      const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
      const e = new Float32Array(256 * 256);
      for (let i = 0; i < e.length; i++) e[i] = decodeTerrarium(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]);
      this.tiles.set(key, e);
    }
  }
  get(lng: number, lat: number): number {
    const fx = lngToTileX(lng, this.z), fy = latToTileY(lat, this.z);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const e = this.tiles.get(`${tx}/${ty}`);
    if (!e) return NaN;
    const px = Math.min(254.999, Math.max(0, (fx - tx) * 256 - 0.5));
    const py = Math.min(254.999, Math.max(0, (fy - ty) * 256 - 0.5));
    const ix = Math.floor(px), iy = Math.floor(py), ax = px - ix, ay = py - iy, i = iy * 256 + ix;
    return (e[i] * (1 - ax) + e[i + 1] * ax) * (1 - ay) + (e[i + 256] * (1 - ax) + e[i + 257] * ax) * ay;
  }
}

/** Segment index: nearest way within MATCH_M of a point. */
class SegIndex {
  private b = new Map<string, Array<[number, number, number, number, number]>>();
  private static C = 0.0004;
  constructor(trails: Trail[]) {
    trails.forEach((t, ti) => {
      for (let k = 1; k < t.coords.length; k++) {
        const [x0, y0] = t.coords[k - 1], [x1, y1] = t.coords[k];
        const minx = Math.floor(Math.min(x0, x1) / SegIndex.C), maxx = Math.floor(Math.max(x0, x1) / SegIndex.C);
        const miny = Math.floor(Math.min(y0, y1) / SegIndex.C), maxy = Math.floor(Math.max(y0, y1) / SegIndex.C);
        for (let cx = minx; cx <= maxx; cx++)
          for (let cy = miny; cy <= maxy; cy++) {
            const key = `${cx}:${cy}`;
            const list = this.b.get(key) ?? [];
            list.push([ti, x0, y0, x1, y1]);
            this.b.set(key, list);
          }
      }
    });
  }
  match(lng: number, lat: number): number {
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
    const cx = Math.floor(lng / SegIndex.C), cy = Math.floor(lat / SegIndex.C);
    let best = -1, bestD = MATCH_M;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const [ti, x0, y0, x1, y1] of this.b.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const ax = (x1 - x0) * kx, ay = (y1 - y0) * ky, px = (lng - x0) * kx, py = (lat - y0) * ky;
          const L2 = ax * ax + ay * ay;
          const t = L2 ? Math.max(0, Math.min(1, (px * ax + py * ay) / L2)) : 0;
          const d = Math.hypot(px - t * ax, py - t * ay);
          if (d < bestD) {
            bestD = d;
            best = ti;
          }
        }
    return best;
  }
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

/** How the trace was travelled, from its typical moving speed. */
export function traceMode(speeds: number[]): TravelMode {
  const m = median(speeds);
  return m < 8 / 3.6 ? 'foot' : m < 30 / 3.6 ? 'bike' : 'moto';
}

async function main() {
  const rows: Row[] = [];
  const dem = new NodeDem();
  for (const f of readdirSync(RAW).filter((f) => f.endsWith('.json'))) {
    const region = f.replace('.json', '');
    const { bbox, ways, traces } = JSON.parse(readFileSync(`${RAW}/${f}`, 'utf8')) as { bbox: number[]; ways: OsmWay[]; traces: Trace[] };
    const trails = ways.map((w) => classifyWay(w, []));
    const idx = new SegIndex(trails);
    await dem.prepare(bbox);
    let regionRows = 0;
    for (const tr of traces) {
      if (!tr.every((p) => p.t !== undefined)) continue;
      // 1) Chunks: contiguous stretches on one way, ~CHUNK_M long.
      type Chunk = { trail: number; d: number; t: number; a: [number, number]; b: [number, number] };
      const chunks: Chunk[] = [];
      let cur: Chunk | null = null;
      for (let k = 1; k < tr.length; k++) {
        const p0 = tr[k - 1], p1 = tr[k];
        const dt = (p1.t! - p0.t!) / 1000;
        const d = haversine(p0.lon, p0.lat, p1.lon, p1.lat);
        const ti = idx.match((p0.lon + p1.lon) / 2, (p0.lat + p1.lat) / 2);
        const broken = ti < 0 || dt <= 0 || dt > 30 || d > 80 || (cur && cur.trail !== ti);
        if (broken) {
          cur = null;
          if (ti < 0 || dt <= 0 || dt > 30 || d > 80) continue;
        }
        if (!cur) {
          cur = { trail: ti, d: 0, t: 0, a: [p0.lon, p0.lat], b: [p1.lon, p1.lat] };
          chunks.push(cur);
        }
        cur.d += d;
        cur.t += dt;
        cur.b = [p1.lon, p1.lat];
        if (cur.d >= CHUNK_M) cur = null;
      }
      const good = chunks.filter((c) => c.d >= CHUNK_M * 0.6 && c.t >= 10 && c.d / c.t > 0.3);
      if (good.length < 3) continue;
      const mode = traceMode(good.map((c) => c.d / c.t));
      // 2) Rows with DEM slope between chunk ends.
      for (const c of good) {
        const t = trails[c.trail];
        const flat = haversine(...c.a, ...c.b);
        if (flat < 30) continue; // switchbacks / loops: endpoint slope is meaningless
        const slope = (dem.get(...c.b) - dem.get(...c.a)) / flat;
        if (!Number.isFinite(slope) || Math.abs(slope) > 0.6) continue;
        const vObs = c.d / c.t;
        const vExpert = expertModel.speed(mode, t, slope);
        if (!(vExpert > 0)) continue;
        // Bike/moto traces on footpaths are often walking/pushing segments; keep them — that's the point.
        rows.push({
          region, mode, x: Array.from(routeFeatures(t, slope)),
          y: Math.max(-2, Math.min(1.5, Math.log(vObs / vExpert))), w: Math.min(c.d, 200), vObs, vExpert,
        });
        regionRows++;
      }
    }
    console.log(region.padEnd(16), 'traces', traces.length, 'rows', regionRows);
  }
  writeFileSync(OUT, JSON.stringify(rows));
  const by = rows.reduce<Record<string, number>>((a, r) => ((a[r.mode] = (a[r.mode] ?? 0) + 1), a), {});
  console.log('total', rows.length, by);
}

void main();
