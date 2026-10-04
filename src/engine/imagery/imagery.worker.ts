/// <reference lib="webworker" />
/**
 * Imagery worker: COG range reads -> UTM->Mercator reprojection -> PNG tile.
 * Runs off the main thread so panning stays smooth on phones.
 */
import { groundResolution, tileYToLat } from '../geo/mercator';
import { zoneFromEpsg } from '../geo/utm';
import { getCog, readWindow } from './cog';
import {
  buildNdviLut,
  buildToneLut,
  chooseLevel,
  DEFAULT_LOOK,
  paintWindow,
  projectTilePixels,
  utmExtent,
  windowFor,
  type PaintContext,
  type MaskWindow,
  type RasterWindow,
} from './renderTile';
import { deriveSceneFiles, getSceneAssets, type SceneAssets } from './stac';
import type { RenderRequest, WorkerReply, WorkerRequest } from './protocolTypes';

const TILE_CACHE = 'nature-engine-tiles-v1';
const SIZE = 256;
const ctxBase = {
  toneLut: buildToneLut(DEFAULT_LOOK),
  ndviLut: buildNdviLut(),
  saturation: DEFAULT_LOOK.saturation,
};
const inflight = new Map<number, AbortController>();

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    inflight.get(msg.id)?.abort();
    return;
  }
  const ac = new AbortController();
  inflight.set(msg.id, ac);
  render(msg, ac.signal)
    .then((data) => reply({ type: 'done', id: msg.id, data }, [data]))
    .catch((err: unknown) => reply({ type: 'error', id: msg.id, message: String((err as Error)?.message ?? err) }))
    .finally(() => inflight.delete(msg.id));
};

function reply(msg: WorkerReply, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
}

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in self ? await caches.open(TILE_CACHE) : null;
  } catch {
    return null;
  }
}

/** Use the 320 m preview COG when the tile is at least this coarse (m/px). */
const PREVIEW_MIN_RES = 300;

type Projected = { pixels: Float64Array; ext: [number, number, number, number] };

async function fetchFrom(
  files: SceneAssets & { preview?: string },
  req: RenderRequest,
  proj: Projected,
  targetRes: number,
  signal: AbortSignal,
): Promise<RasterWindow | null> {
  const usePreview = req.mode === 'truecolor' && !!files.preview && targetRes >= PREVIEW_MIN_RES;
  const urls = usePreview ? [files.preview!] : req.mode === 'truecolor' ? [files.visual] : [files.red, files.nir];
  const cogs = await Promise.all(urls.map((u) => getCog(u)));
  const li = chooseLevel(cogs[0].levels, targetRes);
  const w = windowFor(cogs[0].levels[li], proj.ext);
  if (!w) return null;
  // The preview is already a low-res overview; per-pixel cloud masking pays off from z9 up.
  const maskP = usePreview ? Promise.resolve(undefined) : readMask(files.scl, proj, targetRes, signal);
  const [reads, mask] = await Promise.all([Promise.all(cogs.map((c) => readWindow(c, li, w, signal))), maskP]);
  const { level, win } = reads[0];
  const width = win[2] - win[0];
  const height = win[3] - win[1];
  if (req.mode === 'truecolor') {
    return { level, x0: win[0], y0: win[1], width, height, data: reads[0].data, bands: 3, mask };
  }
  // Interleave red + nir into one 2-band window.
  const n = width * height;
  const both = new Uint16Array(n * 2);
  const red = reads[0].data;
  const nir = reads[1].data;
  for (let i = 0; i < n; i++) {
    both[i * 2] = red[i];
    both[i * 2 + 1] = nir[i];
  }
  return { level, x0: win[0], y0: win[1], width, height, data: both, bands: 2, mask };
}

/** Reads the SCL window covering the tile. A missing/broken mask never blocks imagery. */
async function readMask(url: string, proj: Projected, targetRes: number, signal: AbortSignal): Promise<MaskWindow | undefined> {
  try {
    const cog = await getCog(url);
    const li = chooseLevel(cog.levels, targetRes);
    const w = windowFor(cog.levels[li], proj.ext);
    if (!w) return undefined;
    const r = await readWindow(cog, li, w, signal);
    return { level: r.level, x0: r.win[0], y0: r.win[1], width: r.win[2] - r.win[0], height: r.win[3] - r.win[1], data: r.data };
  } catch (err) {
    if (signal.aborted) throw err;
    return undefined;
  }
}

async function fetchScene(
  scene: RenderRequest['scenes'][number],
  req: RenderRequest,
  proj: Projected,
  targetRes: number,
  signal: AbortSignal,
): Promise<RasterWindow | null> {
  const derived = deriveSceneFiles(scene.id);
  if (derived) {
    try {
      return await fetchFrom(derived, req, proj, targetRes, signal);
    } catch (err) {
      if (signal.aborted) throw err;
      // Fall through: layout may have changed, ask STAC for the real hrefs.
    }
  }
  return fetchFrom(await getSceneAssets(scene.id), req, proj, targetRes, signal);
}

async function render(req: RenderRequest, signal: AbortSignal): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(req.cacheKey);
  if (hit) return hit.arrayBuffer();

  const { z, x, y } = req;
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  const ctx: PaintContext = { mode: req.mode, ...ctxBase };
  const targetRes = groundResolution(tileYToLat(y + 0.5, z), z, SIZE);
  const projected = new Map<number, Projected>();
  const projFor = (epsg: number) => {
    let p = projected.get(epsg);
    if (!p) {
      const pixels = projectTilePixels(z, x, y, zoneFromEpsg(epsg), SIZE);
      p = { pixels, ext: utmExtent(pixels) };
      projected.set(epsg, p);
    }
    return p;
  };

  // Primary scenes (one per grid square) are fetched in parallel; fallbacks
  // for swath-edge gaps only on demand.
  const seen = new Set<string>();
  let primaryCount = 0;
  for (const s of req.scenes) {
    const grid = s.id.split('_')[1];
    if (seen.has(grid)) break;
    seen.add(grid);
    primaryCount++;
  }
  const prefetched = req.scenes.slice(0, primaryCount).map((s) => {
    const p = fetchScene(s, req, projFor(s.epsg), targetRes, signal);
    p.catch(() => {}); // awaited below; avoid unhandled rejection if we stop early
    return p;
  });

  let filled = 0;
  let failures = 0;
  let lastError: unknown;
  for (let i = 0; i < req.scenes.length && filled < SIZE * SIZE; i++) {
    signal.throwIfAborted();
    const scene = req.scenes[i];
    let win: RasterWindow | null;
    try {
      win = await (i < primaryCount ? prefetched[i] : fetchScene(scene, req, projFor(scene.epsg), targetRes, signal));
    } catch (err) {
      if (signal.aborted) throw err;
      failures++;
      lastError = err;
      continue;
    }
    if (win) filled += paintWindow(rgba, projFor(scene.epsg).pixels, win, ctx);
  }
  if (filled === 0 && failures > 0) throw lastError;

  const out = filled === 0 ? new ArrayBuffer(0) : await encodePng(rgba);
  // Cache only when every scene we needed was read; a failed scene may succeed next time.
  if (cache && failures === 0 && !signal.aborted) {
    await cache.put(req.cacheKey, new Response(out.slice(0), { headers: { 'Content-Type': 'image/png' } })).catch(() => {});
  }
  return out;
}

async function encodePng(rgba: Uint8ClampedArray): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const g = canvas.getContext('2d')!;
  g.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}
