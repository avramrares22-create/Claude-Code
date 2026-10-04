/// <reference lib="webworker" />
/**
 * Imagery worker: runs the tile pipeline off the main thread, encodes PNG and
 * keeps rendered tiles in the Cache API so revisits are instant and offline.
 */
import type { RenderRequest, WorkerReply, WorkerRequest } from './protocolTypes';
import { renderTileRGBA, SIZE } from './tilePipeline';

const TILE_CACHE = 'nature-engine-tiles-v1';
/** Rendered tiles kept on the device (~25 KB each → ~100 MB); oldest are evicted. */
const MAX_CACHED_TILES = 4000;
let putsSinceTrim = 0;
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

async function render(req: RenderRequest, signal: AbortSignal): Promise<ArrayBuffer> {
  const cache = await openCache();
  const hit = await cache?.match(req.cacheKey);
  if (hit) return hit.arrayBuffer();
  const { rgba, filled, failures } = await renderTileRGBA(req, signal);
  const out = filled === 0 ? new ArrayBuffer(0) : await encodePng(rgba);
  // Cache only when every scene we needed was read; a failed scene may succeed next time.
  if (cache && failures === 0 && !signal.aborted) {
    await cache.put(req.cacheKey, new Response(out.slice(0), { headers: { 'Content-Type': 'image/png' } })).catch(() => {});
    if (++putsSinceTrim >= 200) {
      putsSinceTrim = 0;
      void trim(cache);
    }
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

/** Cache keys come back in insertion order, so the first ones are the oldest. */
async function trim(cache: Cache) {
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_CACHED_TILES; i++) await cache.delete(keys[i]);
  } catch {
    // best effort
  }
}
