/**
 * Pre-renders the Sentinel-2 mosaic for Romania so the app shows imagery
 * instantly instead of reading COGs on the phone.
 *
 * - z12 tiles are rendered with the exact same pipeline as the app (same scene
 *   choice, cloud masking and colour), encoded as WebP q90.
 * - z6–z11 are built by downsampling their four children (Lanczos), which is
 *   both faster and sharper than rendering from coarse overviews.
 * - Incremental: a manifest stores each z12 tile's scene set; only tiles whose
 *   scenes changed since the last run are re-rendered (CI keeps the folder in cache).
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/data/prerender-mosaic.ts <outDir> [maxZoom] [bbox w,s,e,n]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ROMANIA_BBOX, STAC, type BBox } from '../../src/engine/config';
import { tileBBox, tilesInBBox } from '../../src/engine/geo/mercator';
import { bboxTouchesRomania } from '../../src/engine/geo/romania';
import { hashString } from '../../src/engine/imagery/hash';
import { SceneIndex } from '../../src/engine/imagery/sceneIndex';
import { searchScenes } from '../../src/engine/imagery/stac';
import { renderTileRGBA, SIZE } from '../../src/engine/imagery/tilePipeline';

const OUT = process.argv[2] ?? 'dist/data';
const MAX_Z = Number(process.argv[3] ?? 12);
const AREA: BBox = (process.argv[4]?.split(',').map(Number) as BBox) ?? ROMANIA_BBOX;
const MIN_Z = 6;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 12);
const QUALITY = 90;
const RENDERER = 'v1'; // bump to force a full re-render after renderer changes

type Key = string;
const key = (z: number, x: number, y: number): Key => `${z}/${x}/${y}`;
const file = (z: number, x: number, y: number) => `${OUT}/s2/${z}/${x}/${y}.webp`;

async function main() {
  const t0 = Date.now();
  const from = new Date(Date.now() - STAC.lookbackDays * 86_400_000);
  const scenes = await searchScenes({ bbox: ROMANIA_BBOX, from, maxCloud: STAC.maxCloudCover });
  const index = new SceneIndex(scenes);
  mkdirSync(`${OUT}/s2`, { recursive: true });
  writeFileSync(`${OUT}/scenes.json`, JSON.stringify({ generated: new Date().toISOString(), scenes }));
  console.log(`scene index: ${scenes.length} scenes, ${index.size} grid squares`);

  const manifestPath = `${OUT}/s2/manifest.json`;
  const prev: { renderer?: string; tiles: Record<Key, string> } = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { tiles: {} };
  const old = prev.renderer === RENDERER ? prev.tiles : {};
  const manifest: Record<Key, string> = {};

  // 1) z = MAX_Z: render tiles whose scene set changed.
  const top = tilesInBBox(AREA, MAX_Z).filter(([z, x, y]) => bboxTouchesRomania(tileBBox(z, x, y)));
  const todo: Array<[number, number, number, Array<{ id: string; epsg: number }>]> = [];
  for (const [z, x, y] of top) {
    const sc = index.scenesFor(tileBBox(z, x, y)).map((s) => ({ id: s.id, epsg: s.epsg }));
    if (!sc.length) continue;
    const sig = hashString(sc.map((s) => s.id).join(','));
    manifest[key(z, x, y)] = sig;
    if (old[key(z, x, y)] !== sig || !existsSync(file(z, x, y))) todo.push([z, x, y, sc]);
  }
  console.log(`z${MAX_Z}: ${Object.keys(manifest).length} tiles in Romania, ${todo.length} to (re)render`);

  const dirty = new Set<Key>();
  let done = 0, failed = 0, empty = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        const [z, x, y, sc] = j;
        try {
          const r = await renderTileRGBA({ z, x, y, mode: 'truecolor', scenes: sc }, new AbortController().signal);
          if (r.failures) {
            failed++;
            if (process.env.DEBUG) console.log(`  ${z}/${x}/${y}: ${r.errors.join(' | ')}`);
          }
          if (r.filled === 0) {
            empty++;
            delete manifest[key(z, x, y)];
            continue;
          }
          mkdirSync(`${OUT}/s2/${z}/${x}`, { recursive: true });
          await sharp(Buffer.from(r.rgba.buffer), { raw: { width: SIZE, height: SIZE, channels: 4 } })
            .webp({ quality: QUALITY, alphaQuality: 100, effort: 4 })
            .toFile(file(z, x, y));
          // A tile with failed scenes is retried next run.
          if (r.failures) delete manifest[key(z, x, y)];
          for (let pz = z - 1, px = x >> 1, py = y >> 1; pz >= MIN_Z; pz--, px >>= 1, py >>= 1) dirty.add(key(pz, px, py));
        } catch (e) {
          failed++;
          delete manifest[key(z, x, y)];
          console.log(`tile ${z}/${x}/${y} failed: ${(e as Error).message}`);
        }
        if (++done % 100 === 0) console.log(`  ${done}/${todo.length} rendered, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }),
  );

  // 2) Lower zooms: downsample the four children of every dirty parent.
  for (let z = MAX_Z - 1; z >= MIN_Z; z--) {
    const parents = [...dirty].filter((k) => k.startsWith(`${z}/`)).map((k) => k.split('/').map(Number) as [number, number, number]);
    for (const [, x, y] of parents) {
      const children = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const f = file(z + 1, 2 * x + dx, 2 * y + dy);
        if (existsSync(f)) children.push({ input: f, left: dx * SIZE, top: dy * SIZE });
      }
      if (!children.length) continue;
      const big = await sharp({ create: { width: SIZE * 2, height: SIZE * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(children)
        .png()
        .toBuffer();
      mkdirSync(`${OUT}/s2/${z}/${x}`, { recursive: true });
      await sharp(big).resize(SIZE, SIZE, { kernel: 'lanczos3' }).webp({ quality: QUALITY, alphaQuality: 100, effort: 4 }).toFile(file(z, x, y));
    }
    console.log(`z${z}: ${parents.length} tiles rebuilt from children`);
  }

  writeFileSync(manifestPath, JSON.stringify({ renderer: RENDERER, tiles: manifest }));
  writeFileSync(`${OUT}/s2/meta.json`, JSON.stringify({ generated: new Date().toISOString(), maxZoom: MAX_Z, minZoom: MIN_Z, format: 'webp', tiles: Object.keys(manifest).length }));
  console.log(`done: ${done} rendered (${empty} empty, ${failed} with failures) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

void main();
