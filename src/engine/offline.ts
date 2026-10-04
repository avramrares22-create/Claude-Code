/**
 * Offline areas: everything needed to use a region with no signal — trails,
 * Sentinel-2 imagery (rendered + cached on device), terrain/relief, labels and
 * the DEM used by the router. Network fetches go through the service worker,
 * which keeps them in its cache-first store.
 */
import { REFERENCE, TERRAIN, type BBox, type HiresProvider } from './config';
import { tilesInBBox } from './geo/mercator';
import type { ImageryHandle } from './imagery/imageryProtocol';
import type { TrailStore } from './trails/trailStore';
import { fetchJson, fetchSafe } from './util/net';
import { kvGet, kvSet } from './util/kvStore';

export interface OfflinePlan {
  bbox: BBox;
  imagery: Array<[number, number, number]>;
  terrain: Array<[number, number, number]>;
  labels: Array<[number, number, number]>;
  hires: Array<[number, number, number]>;
  /** Rough download size in MB. */
  estimateMB: number;
}

export interface OfflineArea {
  id: string;
  name: string;
  bbox: BBox;
  savedAt: number;
  tiles: number;
}

const AREAS_KEY = 'offline:areas:v1';
const MAX_TILES = 2500;

export function planOfflineArea(bbox: BBox, provider: HiresProvider | null): OfflinePlan {
  const range = (z0: number, z1: number) => {
    const out: Array<[number, number, number]> = [];
    for (let z = z0; z <= z1; z++) out.push(...tilesInBBox(bbox, z));
    return out;
  };
  const imagery = range(9, 14);
  const terrain = range(8, 13);
  const labels = range(8, 14);
  // Esri's terms forbid offline storage; only the ANCPI orthophoto is cached.
  const hires = provider?.id === 'ancpi' ? range(15, 17) : [];
  const estimateMB = (imagery.length * 40 + terrain.length * 70 + labels.length * 25 + hires.length * 30) / 1024;
  return { bbox, imagery, terrain, labels, hires, estimateMB };
}

export function planSize(p: OfflinePlan): number {
  return p.imagery.length + p.terrain.length + p.labels.length + p.hires.length;
}

export interface DownloadDeps {
  imagery: ImageryHandle;
  trails: TrailStore;
  hires: HiresProvider | null;
}

export type Progress = (step: string, done: number, total: number) => void;

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

const fill = (tpl: string, [z, x, y]: [number, number, number]) =>
  tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

function hiresUrl(tpl: string, [z, x, y]: [number, number, number]): string {
  // ANCPI uses {bbox-epsg-3857}: compute the tile's Web Mercator bounds.
  const size = (2 * Math.PI * 6378137) / 2 ** z;
  const minx = -Math.PI * 6378137 + x * size;
  const maxy = Math.PI * 6378137 - y * size;
  return tpl.replace('{bbox-epsg-3857}', `${minx},${maxy - size},${minx + size},${maxy}`);
}

export async function downloadArea(plan: OfflinePlan, name: string, deps: DownloadDeps, progress: Progress, signal?: AbortSignal): Promise<{ failed: number; area: OfflineArea }> {
  if (planSize(plan) > MAX_TILES) throw new Error('Area too large — zoom in a little and try again');
  const total = planSize(plan) + 1;
  let done = 0;
  const tick = (step: string) => () => progress(step, ++done, total);
  let failed = 0;

  progress('Trails & places', done, total);
  const t = await deps.trails.ensure(plan.bbox, signal);
  failed += t.failed;
  tick('Trails & places')();

  failed += await pool(plan.imagery, 4, ([z, x, y]) => deps.imagery.prefetch(z, x, y, 'truecolor', signal), tick('Satellite imagery'), signal);
  failed += await pool(plan.terrain, 6, (k) => fetchSafe(fill(TERRAIN.tiles, k), { signal }).then(() => {}), tick('Terrain'), signal);
  const tj = await fetchJson<{ tiles: string[] }>(REFERENCE.tilejson, { signal }).catch(() => null);
  if (tj) failed += await pool(plan.labels, 6, (k) => fetchSafe(fill(tj.tiles[0], k), { signal }).then(() => {}), tick('Labels'), signal);
  else {
    failed += plan.labels.length;
    done += plan.labels.length;
  }
  if (deps.hires && plan.hires.length) {
    const tpl = deps.hires.tiles;
    failed += await pool(plan.hires, 4, (k) => fetchSafe(hiresUrl(tpl, k), { signal }).then(() => {}), tick('Aerial photos'), signal);
  }

  const area: OfflineArea = { id: plan.bbox.map((v) => v.toFixed(3)).join(','), name, bbox: plan.bbox, savedAt: Date.now(), tiles: total };
  const areas = (await listOfflineAreas()).filter((a) => a.id !== area.id);
  await kvSet(AREAS_KEY, [area, ...areas]);
  // Ask the browser not to evict our caches under storage pressure.
  void navigator.storage?.persist?.();
  return { failed, area };
}

export async function listOfflineAreas(): Promise<OfflineArea[]> {
  return (await kvGet<OfflineArea[]>(AREAS_KEY, Infinity)) ?? [];
}

export async function removeOfflineArea(id: string): Promise<void> {
  await kvSet(AREAS_KEY, (await listOfflineAreas()).filter((a) => a.id !== id));
}
