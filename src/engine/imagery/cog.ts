/** Remote Cloud-Optimized GeoTIFF access via HTTP range requests (geotiff.js). */
import { fromUrl, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import type { Level } from './renderTile';

export interface OpenCog {
  tiff: GeoTIFF;
  base: GeoTIFFImage;
  /** Expected pyramid (factor-2 overviews); a level is only fetched when used. */
  levels: Level[];
}

// 256 KB blocks: Sentinel internal tiles are 512² deflate (~100–400 KB), so one
// block usually holds a whole tile and the header + all IFDs fit in the first block.
const BLOCK_SIZE = 256 * 1024;
// Kept small on purpose: iOS Safari kills tabs that hold too much memory.
// Worst case per worker is MAX_OPEN * BLOCK_CACHE * 256 KB = 24 MB.
const BLOCK_CACHE = 8;
const MAX_OPEN = 12;
const MIN_OVERVIEW = 256;

const open = new Map<string, Promise<OpenCog>>();

async function openCog(url: string): Promise<OpenCog> {
  const options = { allowFullFile: false, cacheSize: BLOCK_CACHE, blockSize: BLOCK_SIZE } as Parameters<typeof fromUrl>[1];
  const tiff = await fromUrl(url, options);
  const base = await tiff.getImage(0);
  const [originX, originY] = base.getOrigin();
  const [resX, resY] = base.getResolution();
  const levels: Level[] = [];
  // Avoid getImageCount(): it walks every IFD. GDAL overviews halve until small.
  for (let i = 0, w = base.getWidth(), h = base.getHeight(); i === 0 || w >= MIN_OVERVIEW; i++) {
    levels.push({ width: w, height: h, originX, originY, resX: Math.abs(resX) * 2 ** i, resY: Math.abs(resY) * 2 ** i });
    w = Math.ceil(w / 2);
    h = Math.ceil(h / 2);
  }
  return { tiff, base, levels };
}

/** LRU cache of opened COGs (a scene is hit by many neighbouring tiles). */
export function getCog(url: string): Promise<OpenCog> {
  let p = open.get(url);
  if (p) {
    open.delete(url);
    open.set(url, p);
    return p;
  }
  // Not tied to the caller's signal: other tiles will want this COG too.
  p = openCog(url);
  p.catch(() => open.delete(url));
  open.set(url, p);
  if (open.size > MAX_OPEN) open.delete(open.keys().next().value!);
  return p;
}

/**
 * Reads a pixel window from a pyramid level. If the file has fewer overviews
 * than expected, steps down to the next finer level (window coords doubled).
 * Callers must paint with the returned level/window.
 */
export async function readWindow(
  cog: OpenCog,
  levelIndex: number,
  win: [number, number, number, number],
  signal?: AbortSignal,
): Promise<{ data: ArrayLike<number>; level: Level; win: [number, number, number, number] }> {
  let image: GeoTIFFImage;
  try {
    image = levelIndex === 0 ? cog.base : await cog.tiff.getImage(levelIndex);
  } catch {
    return readWindow(cog, levelIndex - 1, win.map((v) => v * 2) as typeof win, signal);
  }
  const level = cog.levels[levelIndex];
  if (image.getWidth() !== level.width) throw new Error(`Unexpected COG overview size at level ${levelIndex}`);
  const clamped: [number, number, number, number] = [
    Math.max(0, win[0]),
    Math.max(0, win[1]),
    Math.min(level.width, win[2]),
    Math.min(level.height, win[3]),
  ];
  const data = await image.readRasters({ window: clamped, interleave: true, signal });
  return { data: data as unknown as ArrayLike<number>, level, win: clamped };
}
