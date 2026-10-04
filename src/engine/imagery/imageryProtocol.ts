/**
 * Registers the `s2://{mode}/{z}/{x}/{y}` MapLibre protocol backed by the imagery workers.
 */
import * as maplibregl from 'maplibre-gl';
import { IMAGERY } from '../config';
import { tileBBox } from '../geo/mercator';
import { hashString } from './hash';
import { dataUrl } from '../util/base';
import type { ImageryMode } from './renderTile';
import type { SceneIndex } from './sceneIndex';
import { ImageryWorkerPool } from './workerPool';

export const IMAGERY_PROTOCOL = 's2';

export function imageryTileUrl(mode: ImageryMode): string {
  return `${IMAGERY_PROTOCOL}://${mode}/{z}/{x}/{y}`;
}

/** Live counters for perf tuning (exposed as engine.imageryStats). */
export const imageryStats = { requested: 0, done: 0, failed: 0, aborted: 0, totalMs: 0, maxMs: 0, lastError: '' };

let staticMeta: Promise<number> | null = null;

/** Highest zoom of the pre-rendered mosaic, or -1 if none is published (or it is stale). */
function staticMaxZoom(): Promise<number> {
  staticMeta ??= fetch(dataUrl('s2/meta.json'))
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { generated: string; maxZoom: number } | null) =>
      m && Date.now() - Date.parse(m.generated) < 3 * 86_400_000 ? m.maxZoom : -1,
    )
    .catch(() => -1);
  return staticMeta;
}

export interface ImageryHandle {
  unregister(): void;
  /** Renders (and caches on device) a tile without displaying it — for offline areas. */
  prefetch(z: number, x: number, y: number, mode?: ImageryMode, signal?: AbortSignal): Promise<void>;
}

export function registerImageryProtocol(index: Promise<SceneIndex>): ImageryHandle {
  const pool = new ImageryWorkerPool();
  const jobFor = async (mode: ImageryMode, z: number, x: number, y: number) => {
    const scenes = (await index).scenesFor(tileBBox(z, x, y)).map((s) => ({ id: s.id, epsg: s.epsg }));
    const sig = hashString(scenes.map((s) => s.id).join(','));
    const cacheKey = `https://tiles.nature.local/s2/v${IMAGERY.rendererVersion}/${mode}/${z}/${x}/${y}.png?s=${sig}`;
    return { z, x, y, mode, scenes, cacheKey };
  };
  maplibregl.addProtocol(IMAGERY_PROTOCOL, async (params, abort) => {
    const m = /^s2:\/\/(truecolor|ndvi)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Bad imagery url ${params.url}`);
    const mode = m[1] as ImageryMode;
    const [z, x, y] = [Number(m[2]), Number(m[3]), Number(m[4])];
    // Country-scale zooms come pre-rendered from the daily CI build when available.
    if (mode === 'truecolor' && z <= (await staticMaxZoom())) {
      const res = await fetch(dataUrl(`s2/${z}/${x}/${y}.png`), { signal: abort.signal }).catch(() => null);
      if (res?.ok) return { data: await res.arrayBuffer() };
    }
    const job = await jobFor(mode, z, x, y);
    if (job.scenes.length === 0) return { data: new ArrayBuffer(0) };
    const t0 = performance.now();
    imageryStats.requested++;
    try {
      const data = await pool.render(job, abort.signal);
      const ms = performance.now() - t0;
      imageryStats.done++;
      imageryStats.totalMs += ms;
      imageryStats.maxMs = Math.max(imageryStats.maxMs, ms);
      return { data };
    } catch (err) {
      if (abort.signal.aborted) imageryStats.aborted++;
      else {
        imageryStats.failed++;
        imageryStats.lastError = String((err as Error).message ?? err);
      }
      throw err;
    }
  });
  return {
    unregister() {
      maplibregl.removeProtocol(IMAGERY_PROTOCOL);
      pool.terminate();
    },
    async prefetch(z, x, y, mode = 'truecolor', signal) {
      const job = await jobFor(mode, z, x, y);
      if (job.scenes.length) await pool.render(job, signal);
    },
  };
}
