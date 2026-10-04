/**
 * Offline maps: whole-country and city/mountain packs, or the area on screen.
 *
 * Everything goes into a dedicated Cache Storage bucket (OFFLINE_CACHE) that is
 * never trimmed; the service worker serves it first, so the map, trails,
 * routing, terrain and labels keep working with no signal.
 *
 * Downloads are resumable: URLs already in the offline cache are skipped, so
 * running a pack again after a dropped connection continues where it stopped.
 */
import { REFERENCE, ROMANIA_BBOX, TERRAIN, type BBox, type HiresProvider } from './config';
import { tilesInBBox, tileBBox } from './geo/mercator';
import { bboxTouchesRomania } from './geo/romania';
import type { ImageryHandle } from './imagery/imageryProtocol';
import { dataUrl } from './util/base';
import { fetchJson, fetchSafe } from './util/net';
import { kvGet, kvSet } from './util/kvStore';

export const OFFLINE_CACHE = 'nature-offline-v1';

type Tile = [number, number, number];
type Range = [number, number] | null;

export interface PackLevels {
  /** Sentinel-2 zooms; above the published static max zoom they are rendered on the device. */
  imagery: Range;
  terrain: Range;
  labels: Range;
  /** ANCPI orthophoto zooms (Esri is never stored: its terms forbid it). */
  hires: Range;
}

export interface PackDef {
  id: string;
  name: string;
  kind: 'country' | 'mountains' | 'city' | 'area';
  bbox: BBox;
  levels: PackLevels;
}

const DETAILED: PackLevels = { imagery: [9, 14], terrain: [8, 12], labels: [8, 14], hires: null };
const COUNTRY: PackLevels = { imagery: [6, 12], terrain: [6, 10], labels: [6, 11], hires: null };

/** Ready-made packs. Mountain packs include the nearest town / trailheads. */
export const PACKS: PackDef[] = [
  { id: 'romania', name: 'All of Romania (overview)', kind: 'country', bbox: ROMANIA_BBOX, levels: COUNTRY },
  { id: 'brasov', name: 'Brașov · Postăvarul · Piatra Mare', kind: 'mountains', bbox: [25.35, 45.45, 25.85, 45.78], levels: DETAILED },
  { id: 'bucegi', name: 'Bucegi · Valea Prahovei', kind: 'mountains', bbox: [25.25, 45.3, 25.65, 45.55], levels: DETAILED },
  { id: 'piatra-craiului', name: 'Piatra Craiului · Bran · Zărnești', kind: 'mountains', bbox: [25.1, 45.45, 25.45, 45.65], levels: DETAILED },
  { id: 'fagaras', name: 'Munții Făgăraș', kind: 'mountains', bbox: [24.3, 45.5, 25.1, 45.7], levels: DETAILED },
  { id: 'ciucas', name: 'Ciucaș · Siriu', kind: 'mountains', bbox: [25.8, 45.38, 26.2, 45.6], levels: DETAILED },
  { id: 'retezat', name: 'Retezat', kind: 'mountains', bbox: [22.7, 45.25, 23.05, 45.45], levels: DETAILED },
  { id: 'apuseni', name: 'Apuseni · Padiș · Scărișoara', kind: 'mountains', bbox: [22.5, 46.4, 22.95, 46.7], levels: DETAILED },
  { id: 'rodna', name: 'Munții Rodnei', kind: 'mountains', bbox: [24.5, 47.45, 25.05, 47.65], levels: DETAILED },
  { id: 'ceahlau', name: 'Ceahlău · Bicaz', kind: 'mountains', bbox: [25.75, 46.75, 26.1, 47.05], levels: DETAILED },
  { id: 'sibiu', name: 'Sibiu · Păltiniș · Cindrel', kind: 'mountains', bbox: [23.8, 45.55, 24.25, 45.85], levels: DETAILED },
  { id: 'bucuresti', name: 'București', kind: 'city', bbox: [25.95, 44.33, 26.25, 44.55], levels: DETAILED },
  { id: 'cluj', name: 'Cluj-Napoca · Făget', kind: 'city', bbox: [23.45, 46.68, 23.75, 46.85], levels: DETAILED },
  { id: 'timisoara', name: 'Timișoara', kind: 'city', bbox: [21.1, 45.68, 21.35, 45.83], levels: DETAILED },
  { id: 'iasi', name: 'Iași', kind: 'city', bbox: [27.48, 47.1, 27.7, 47.23], levels: DETAILED },
  { id: 'constanta', name: 'Constanța · Mamaia', kind: 'city', bbox: [28.55, 44.1, 28.7, 44.3], levels: DETAILED },
];

export interface OfflinePlan {
  pack: PackDef;
  imagery: Tile[];
  terrain: Tile[];
  labels: Tile[];
  hires: Tile[];
  trailCells: Tile[];
  /** Rough download size in MB. */
  estimateMB: number;
  /** Imagery tiles that must be rendered on the device (slow part). */
  rendered: number;
}

export interface OfflineArea {
  id: string;
  name: string;
  bbox: BBox;
  savedAt: number;
  tiles: number;
  complete: boolean;
  /** Deepest zoom stored, so removing a pack keeps tiles another pack still needs. */
  maxZoom: number;
  /** Rough size in MB at download time. */
  sizeMB: number;
}

const AREAS_KEY = 'offline:areas:v2';
const AREA_MAX_TILES = 4000;

function range(bbox: BBox, r: Range, clip: boolean): Tile[] {
  if (!r) return [];
  const out: Tile[] = [];
  for (let z = r[0]; z <= r[1]; z++) {
    for (const t of tilesInBBox(bbox, z)) if (!clip || bboxTouchesRomania(tileBBox(...t), 0.02)) out.push(t);
  }
  return out;
}

/** Plans a pack. `staticMaxZoom` = highest pre-rendered mosaic zoom (cheap downloads). */
export function planPack(pack: PackDef, staticMaxZoom: number, provider: HiresProvider | null): OfflinePlan {
  const clip = pack.kind === 'country';
  const imagery = range(pack.bbox, pack.levels.imagery, clip);
  const terrain = range(pack.bbox, pack.levels.terrain, clip);
  const labels = range(pack.bbox, pack.levels.labels, clip);
  const hires = provider?.id === 'ancpi' ? range(pack.bbox, pack.levels.hires, clip) : [];
  const trailCells = range(pack.bbox, [11, 11], clip);
  const rendered = imagery.filter(([z]) => z > staticMaxZoom).length;
  const estimateMB = (imagery.length * 26 + terrain.length * 70 + labels.length * 28 + hires.length * 30 + trailCells.length * 90) / 1024;
  return { pack, imagery, terrain, labels, hires, trailCells, estimateMB, rendered };
}

/** The view as an ad-hoc pack. */
export function planOfflineArea(bbox: BBox, provider: HiresProvider | null, staticMaxZoom = -1): OfflinePlan {
  const id = bbox.map((v) => v.toFixed(3)).join(',');
  return planPack(
    { id, name: 'This area', kind: 'area', bbox, levels: { ...DETAILED, imagery: [9, 14], hires: [15, 17] } },
    staticMaxZoom,
    provider,
  );
}

export function planSize(p: OfflinePlan): number {
  return p.imagery.length + p.terrain.length + p.labels.length + p.hires.length + p.trailCells.length;
}

export const areaTooLarge = (p: OfflinePlan) => p.pack.kind === 'area' && planSize(p) > AREA_MAX_TILES;

export interface DownloadDeps {
  imagery: ImageryHandle;
  hires: HiresProvider | null;
  staticMaxZoom: number;
  staticExt: string;
}

export type Progress = (step: string, done: number, total: number) => void;

const fill = (tpl: string, [z, x, y]: Tile) => tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

function hiresUrl(tpl: string, [z, x, y]: Tile): string {
  // ANCPI uses {bbox-epsg-3857}: compute the tile's Web Mercator bounds.
  const size = (2 * Math.PI * 6378137) / 2 ** z;
  const minx = -Math.PI * 6378137 + x * size;
  const maxy = Math.PI * 6378137 - y * size;
  return tpl.replace('{bbox-epsg-3857}', `${minx},${maxy - size},${minx + size},${maxy}`);
}

/** Stores a URL in the offline cache unless already there. 404s count as done (no data). */
async function store(cache: Cache, url: string, signal?: AbortSignal): Promise<void> {
  if (await cache.match(url, { ignoreVary: true })) return;
  try {
    const res = await fetchSafe(url, { signal, timeoutMs: 30_000 });
    await cache.put(url, res);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return;
    throw err;
  }
}

/** Runs `fn` over items with limited concurrency; failures are counted, not fatal. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>, tick: () => void, signal?: AbortSignal) {
  let failed = 0;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) {
        signal?.throwIfAborted();
        try {
          await fn(it);
        } catch {
          if (signal?.aborted) throw signal.reason;
          failed++;
        }
        tick();
      }
    }),
  );
  return failed;
}

export async function downloadPack(plan: OfflinePlan, deps: DownloadDeps, progress: Progress, signal?: AbortSignal): Promise<{ failed: number; area: OfflineArea }> {
  if (areaTooLarge(plan)) throw new Error('Area too large — zoom in a little, or download a ready-made pack');
  const cache = await caches.open(OFFLINE_CACHE);
  const total = planSize(plan) + 6;
  const lv = plan.pack.levels;
  const area: OfflineArea = {
    id: plan.pack.id,
    name: plan.pack.name,
    bbox: plan.pack.bbox,
    savedAt: Date.now(),
    tiles: total,
    complete: false,
    maxZoom: Math.max(...[lv.imagery, lv.terrain, lv.labels, lv.hires].map((r) => (r ? r[1] : 0))),
    sizeMB: plan.estimateMB,
  };
  // Listed (as incomplete) from the start, so an interrupted download can be resumed or removed.
  await saveArea(area);
  let done = 0;
  const tick = (step: string) => () => progress(step, ++done, total);
  let failed = 0;

  // App data needed offline regardless of area.
  for (const f of ['trails/meta.json', 's2/meta.json', 'scenes.json', 'search/meta.json', 'search/core.json']) {
    await store(cache, dataUrl(f), signal).catch(() => failed++);
    tick('Preparing')();
  }
  // Search: street names and trail outlines for the pack's 1° cells (404 = none there).
  const [w, s_, e, n] = plan.pack.bbox;
  for (let x = Math.floor(w); x <= Math.floor(e); x++)
    for (let y = Math.floor(s_); y <= Math.floor(n); y++)
      for (const kind of ['streets', 'routes']) await store(cache, dataUrl(`search/${kind}/${x}_${y}.json`), signal).catch(() => undefined);
  const tj = await fetchJson<{ tiles: string[] }>(REFERENCE.tilejson, { signal }).catch(() => null);
  await store(cache, REFERENCE.tilejson, signal).catch(() => failed++);
  tick('Preparing')();

  failed += await pool(plan.trailCells, 6, (t) => store(cache, dataUrl(`trails/${t[0]}/${t[1]}/${t[2]}.json`), signal), tick('Trails & places'), signal);

  const staticTiles = plan.imagery.filter(([z]) => z <= deps.staticMaxZoom);
  const liveTiles = plan.imagery.filter(([z]) => z > deps.staticMaxZoom);
  failed += await pool(staticTiles, 8, (t) => store(cache, dataUrl(`s2/${t[0]}/${t[1]}/${t[2]}.${deps.staticExt}`), signal), tick('Satellite imagery'), signal);
  failed += await pool(plan.terrain, 6, (t) => store(cache, fill(TERRAIN.tiles, t), signal), tick('Terrain'), signal);
  if (tj) failed += await pool(plan.labels, 6, (t) => store(cache, fill(tj.tiles[0], t), signal), tick('Labels'), signal);
  else {
    failed += plan.labels.length;
    done += plan.labels.length;
  }
  if (deps.hires && plan.hires.length) {
    const tpl = deps.hires.tiles;
    failed += await pool(plan.hires, 4, (t) => store(cache, hiresUrl(tpl, t), signal), tick('Aerial photos'), signal);
  }
  // Detail imagery is rendered on the device (slowest part; done last so the rest is usable early).
  failed += await pool(liveTiles, 3, ([z, x, y]) => deps.imagery.prefetch(z, x, y, 'truecolor', signal, true), tick('Detailed imagery (rendering on your phone)'), signal);

  area.complete = failed === 0;
  area.savedAt = Date.now();
  await saveArea(area);
  // Ask the browser not to evict our caches under storage pressure.
  void navigator.storage?.persist?.();
  return { failed, area };
}

async function saveArea(area: OfflineArea) {
  const areas = (await listOfflineAreas()).filter((a) => a.id !== area.id);
  await kvSet(AREAS_KEY, [area, ...areas]);
}

export async function listOfflineAreas(): Promise<OfflineArea[]> {
  return (await kvGet<OfflineArea[]>(AREAS_KEY, Infinity)) ?? [];
}

/**
 * Removes a pack from the list and deletes its cached tiles — except tiles a
 * remaining pack still covers (e.g. the country overview under a city pack).
 * App-wide files (metadata, tilejson) are kept while any pack remains.
 */
export async function removeOfflineArea(id: string): Promise<void> {
  const areas = await listOfflineAreas();
  const target = areas.find((a) => a.id === id);
  const rest = areas.filter((a) => a.id !== id);
  await kvSet(AREAS_KEY, rest);
  if (!target) return;
  try {
    if (!rest.length) {
      await caches.delete(OFFLINE_CACHE);
      return;
    }
    const cache = await caches.open(OFFLINE_CACHE);
    const keys = await cache.keys();
    await Promise.all(
      keys.map((req) => {
        const t = tileOfUrl(req.url);
        if (!t || !covers(target, t) || rest.some((a) => covers(a, t))) return null;
        return cache.delete(req);
      }),
    );
  } catch {
    // best effort
  }
}

/** z/x/y of a tile URL (path ends in /z/x/y.ext), or null for other files. */
export function tileOfUrl(url: string): Tile | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = /\/(\d+)\/(\d+)\/(\d+)\.\w+$/.exec(path);
  if (!m) return null;
  const t: Tile = [+m[1], +m[2], +m[3]];
  return t[0] <= 22 && t[1] < 2 ** t[0] && t[2] < 2 ** t[0] ? t : null;
}

function covers(a: Pick<OfflineArea, 'bbox' | 'maxZoom'>, t: Tile): boolean {
  if (t[0] > (a.maxZoom ?? 14)) return false;
  const [w, s, e, n] = tileBBox(...t);
  return w < a.bbox[2] && e > a.bbox[0] && s < a.bbox[3] && n > a.bbox[1];
}

/** Bytes used / available for this app (where the browser reports it). */
export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
