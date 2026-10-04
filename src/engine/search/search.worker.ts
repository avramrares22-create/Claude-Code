/// <reference lib="webworker" />
/**
 * Search worker: holds the Romania gazetteer and runs QueryNet + retrieval +
 * ranking off the main thread. Street shards and trail geometry load on demand.
 */
import type { Cat } from './categories';
import type { CoreFile, Row } from './engine';
import type { QueryNetWeights } from './queryNet';
import { SearchEngine } from './search';
import qnWeights from './querynet.weights.json';

type Req =
  | { type: 'init'; base: string }
  | { type: 'search'; id: number; q: string; focus: [number, number]; focusIsUser?: boolean; limit?: number }
  | { type: 'browse'; id: number; cats: Cat[]; focus: [number, number] }
  | { type: 'route'; id: number; osm: string; lng: number; lat: number };

const se = new SearchEngine();
se.setModels(qnWeights as unknown as QueryNetWeights, null);
let base = '';
let ready: Promise<void> | null = null;
let ctxList: Array<[string, string]> = [];
let streetShards = new Set<string>();
let routeShards = new Set<string>();
const routeCache = new Map<string, Promise<Record<string, number[][][]>>>();

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${base}data/search/${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

function init() {
  ready ??= (async () => {
    const [core, meta] = await Promise.all([getJson<CoreFile>('core.json'), getJson<{ streetShards: string[]; routeShards: string[] }>('meta.json')]);
    ctxList = core.ctx;
    streetShards = new Set(meta.streetShards);
    routeShards = new Set(meta.routeShards);
    se.index.addCore(core);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Loads street shards around a point (the 1° cell and its neighbours). */
async function ensureStreets(p: [number, number]) {
  const cx = Math.floor(p[0]);
  const cy = Math.floor(p[1]);
  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const k = `${cx + dx}_${cy + dy}`;
    if (streetShards.has(k) && !se.index.hasShard(k)) keys.push(k);
  }
  // Own cell first so the common case is fast.
  keys.sort((a, b) => (a === `${cx}_${cy}` ? -1 : b === `${cx}_${cy}` ? 1 : 0));
  await Promise.all(
    keys.map((k) =>
      getJson<Row[]>(`streets/${k}.json`)
        .then((rows) => se.index.addShard(k, rows, ctxList))
        .catch(() => undefined),
    ),
  );
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      base = m.base;
      await init();
      self.postMessage({ type: 'ready', entries: se.index.entries.length });
      return;
    }
    await init();
    if (m.type === 'search') {
      await ensureStreets(m.focus);
      const ctx = { focus: m.focus, focusIsUser: m.focusIsUser };
      let out = se.search(m.q, ctx, m.limit ?? 12);
      // "… lângă Sibiu": make sure the streets there are loaded too.
      const a = out.anchor ? se.index.entries.find((e) => e.name === out.anchor) : null;
      if (a && (Math.abs(Math.floor(a.lng) - Math.floor(m.focus[0])) > 1 || Math.abs(Math.floor(a.lat) - Math.floor(m.focus[1])) > 1)) {
        const before = se.index.entries.length;
        await ensureStreets([a.lng, a.lat]);
        if (se.index.entries.length !== before) out = se.search(m.q, ctx, m.limit ?? 12);
      }
      self.postMessage({ type: 'result', id: m.id, out: { results: out.results, anchor: out.anchor, confidence: out.confidence, cue: out.parsed.cue, nearMe: out.parsed.nearMe } });
    } else if (m.type === 'browse') {
      self.postMessage({ type: 'result', id: m.id, out: { results: se.browse(m.cats, { focus: m.focus }) } });
    } else if (m.type === 'route') {
      const k = `${Math.floor(m.lng)}_${Math.floor(m.lat)}`;
      if (!routeShards.has(k)) return self.postMessage({ type: 'result', id: m.id, out: null });
      let p = routeCache.get(k);
      if (!p) routeCache.set(k, (p = getJson<Record<string, number[][][]>>(`routes/${k}.json`)));
      const shard = await p;
      const segs = shard[m.osm];
      self.postMessage({ type: 'result', id: m.id, out: segs ? segs.map((s) => s.map(([x, y]) => [x / 1e5, y / 1e5])) : null });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: 'id' in m ? m.id : -1, message: String((e as Error).message ?? e) });
  }
};
