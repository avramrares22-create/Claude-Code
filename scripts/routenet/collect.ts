/**
 * Collects RouteNet training data: OSM ways (with tags) + public GPS traces
 * for Romanian outdoor areas. Polite to the OSM API: sequential, paced, capped.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/routenet/collect.ts [outDir]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseGpx, type Trace } from '../../src/engine/detect/gps';
import type { OsmWay } from '../../src/engine/trails/types';
import { ROUTE_REGIONS } from './regions';

const OUT = process.argv[2] ?? 'ml/route_raw';
// Box size in degrees; dense towns need smaller boxes (OSM API node limit).
const SIZE = Number(process.env.SIZE ?? 0.04);
const MAX_PAGES = 8;
const PAUSE_MS = 1500;
const HEADERS = { 'User-Agent': 'natura-routenet/1.0 (one-off research extract)' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`gave up ${url}`);
}

async function osmWays(b: number[]): Promise<OsmWay[]> {
  const res = await get(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.join(',')}`);
  const els = (await res.json()).elements as Array<Record<string, any>>;
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const e of els) if (e.type === 'node') nodes.set(e.id, { lat: e.lat, lon: e.lon });
  const ways: OsmWay[] = [];
  for (const e of els) {
    if (e.type !== 'way' || !e.tags?.highway) continue;
    const geometry = e.nodes.map((n: number) => nodes.get(n)).filter(Boolean);
    if (geometry.length === e.nodes.length && geometry.length > 1) ways.push({ type: 'way', id: e.id, nodes: e.nodes, geometry, tags: e.tags });
  }
  return ways;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY?.split(',');
  for (const [name, [lng, lat]] of Object.entries(ROUTE_REGIONS)) {
    if (only && !only.includes(name)) continue;
    const file = `${OUT}/${name}.json`;
    if (existsSync(file)) {
      console.log(name, 'cached');
      continue;
    }
    const b = [lng, lat, lng + SIZE, lat + SIZE];
    try {
      const ways = await osmWays(b);
      await sleep(PAUSE_MS);
      const traces: Trace[] = [];
      for (let p = 0; p < MAX_PAGES; p++) {
        const xml = await (await get(`https://api.openstreetmap.org/api/0.6/trackpoints?bbox=${b.join(',')}&page=${p}`)).text();
        traces.push(...parseGpx(xml));
        await sleep(PAUSE_MS);
        if ((xml.match(/<trkpt/g)?.length ?? 0) < 5000) break;
      }
      writeFileSync(file, JSON.stringify({ bbox: b, ways, traces }));
      console.log(name, 'ways', ways.length, 'traces', traces.length, 'points', traces.reduce((a, t) => a + t.length, 0));
    } catch (e) {
      console.log(name, 'ERROR', (e as Error).message);
    }
  }
}

void main();
