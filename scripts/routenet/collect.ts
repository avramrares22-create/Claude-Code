/**
 * Collects RouteNet training data: OSM ways (with tags) + public GPS traces
 * for Romanian outdoor areas. Polite to the OSM API: sequential, paced, capped.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/routenet/collect.ts [outDir]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseGpx, type Trace } from '../../src/engine/detect/gps';
import type { OsmWay } from '../../src/engine/trails/types';

const OUT = process.argv[2] ?? 'ml/route_raw';
const SIZE = 0.04;
const MAX_PAGES = 5;
const PAUSE_MS = 1500;
const HEADERS = { 'User-Agent': 'natura-routenet/1.0 (one-off research extract)' };

// Popular outdoor areas (hiking, MTB, enduro) — where public traces exist.
export const ROUTE_REGIONS: Record<string, [number, number]> = {
  bucegi: [25.44, 45.39], piatra_craiului: [25.22, 45.52], postavarul: [25.55, 45.57], ciucas: [25.92, 45.5],
  baiului: [25.62, 45.38], rodna: [24.78, 47.57], gutai: [23.82, 47.7], maramures: [24.35, 47.73],
  ceahlau: [25.95, 46.95], rarau: [25.58, 47.45], hasmas: [25.82, 46.68], suhard: [25.3, 47.38],
  calimani: [25.2, 47.1], padis: [22.7, 46.6], vladeasa: [22.8, 46.75], bihor: [22.65, 46.48],
  trascau: [23.55, 46.3], retezat: [22.86, 45.37], parang: [23.53, 45.36], cozia: [24.33, 45.31],
  semenic: [22.05, 45.17], mehedinti: [22.62, 44.98], cindrel: [23.85, 45.58], macin: [28.25, 45.2],
  brasov_hills: [25.6, 45.62], sinaia: [25.53, 45.34], busteni: [25.52, 45.41], sibiu_hills: [24.1, 45.75],
  cluj_hills: [23.55, 46.73], iasi_hills: [27.55, 47.1],
};

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
  for (const [name, [lng, lat]] of Object.entries(ROUTE_REGIONS)) {
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
