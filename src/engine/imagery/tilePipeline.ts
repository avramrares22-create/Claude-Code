/**
 * Tile pipeline core: COG range reads → cloud mask → UTM→Mercator reprojection
 * → composited RGBA. Shared by the browser worker and the Node pre-renderer.
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
  type ImageryMode,
  type MaskWindow,
  type PaintContext,
  type RasterWindow,
} from './renderTile';
import { deriveSceneFiles, getSceneAssets, type SceneAssets } from './stac';

export const SIZE = 256;

export interface TileJob {
  z: number;
  x: number;
  y: number;
  mode: ImageryMode;
  scenes: Array<{ id: string; epsg: number }>;
}

export interface TileResult {
  rgba: Uint8ClampedArray;
  filled: number;
  /** Scenes that failed to load; such tiles should not be cached. */
  failures: number;
  /** Messages of those failures (diagnostics). */
  errors: string[];
}

const ctxBase = {
  toneLut: buildToneLut(DEFAULT_LOOK),
  ndviLut: buildNdviLut(),
  saturation: DEFAULT_LOOK.saturation,
};

/** Use the 320 m preview COG when the tile is at least this coarse (m/px). */
const PREVIEW_MIN_RES = 300;

type Projected = { pixels: Float64Array; ext: [number, number, number, number] };

async function fetchFrom(
  files: SceneAssets & { preview?: string },
  req: TileJob,
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
    return { level, x0: win[0], y0: win[1], width, height, data: reads[0].data, bands: 3, mask, nodataMax: usePreview ? 8 : 0 };
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

const SCENE_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads one scene's window, retrying transient network failures with backoff. */
async function fetchScene(
  scene: TileJob['scenes'][number],
  req: TileJob,
  proj: Projected,
  targetRes: number,
  signal: AbortSignal,
): Promise<RasterWindow | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchSceneOnce(scene, req, proj, targetRes, signal);
    } catch (err) {
      if (signal.aborted || attempt >= SCENE_ATTEMPTS) throw err;
      await sleep(300 * 2 ** attempt + Math.random() * 300);
    }
  }
}

async function fetchSceneOnce(
  scene: TileJob['scenes'][number],
  req: TileJob,
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

export async function renderTileRGBA(req: TileJob, signal: AbortSignal): Promise<TileResult> {
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
  const errors: string[] = [];
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
      errors.push(`${scene.id}: ${(err as Error)?.message ?? err}`);
      continue;
    }
    if (win) filled += paintWindow(rgba, projFor(scene.epsg).pixels, win, ctx);
  }
  if (filled === 0 && failures > 0) throw lastError;
  return { rgba, filled, failures, errors };
}
