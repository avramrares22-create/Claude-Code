/**
 * Pre-renders the country-scale Sentinel-2 mosaic (z6–z9) and snapshots the
 * scene index, so the app opens instantly instead of reading dozens of scenes
 * per zoomed-out tile on the phone. Run daily in CI.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/data/prerender-mosaic.ts dist/data [maxZoom]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { ROMANIA_BBOX, STAC } from '../../src/engine/config';
import { tileBBox, tilesInBBox } from '../../src/engine/geo/mercator';
import { SceneIndex } from '../../src/engine/imagery/sceneIndex';
import { searchScenes } from '../../src/engine/imagery/stac';
import { renderTileRGBA, SIZE } from '../../src/engine/imagery/tilePipeline';

const OUT = process.argv[2] ?? 'dist/data';
const MAX_Z = Number(process.argv[3] ?? 9);
const CONCURRENCY = 6;

async function main() {
  const from = new Date(Date.now() - STAC.lookbackDays * 86_400_000);
  const scenes = await searchScenes({ bbox: ROMANIA_BBOX, from, maxCloud: STAC.maxCloudCover });
  const index = new SceneIndex(scenes);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/scenes.json`, JSON.stringify({ generated: new Date().toISOString(), scenes }));
  console.log('scene index', scenes.length, 'scenes,', index.size, 'grid squares');

  const jobs: Array<[number, number, number]> = [];
  for (let z = 6; z <= MAX_Z; z++) jobs.push(...tilesInBBox(ROMANIA_BBOX, z));
  let done = 0, empty = 0, failed = 0;
  const t0 = Date.now();
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) {
      const [z, x, y] = j;
      const tileScenes = index.scenesFor(tileBBox(z, x, y)).map((s) => ({ id: s.id, epsg: s.epsg }));
      if (!tileScenes.length) {
        empty++;
        continue;
      }
      try {
        const r = await renderTileRGBA({ z, x, y, mode: 'truecolor', scenes: tileScenes }, new AbortController().signal);
        if (r.filled === 0) {
          empty++;
          continue;
        }
        const png = new PNG({ width: SIZE, height: SIZE });
        png.data = Buffer.from(r.rgba.buffer);
        mkdirSync(`${OUT}/s2/${z}/${x}`, { recursive: true });
        writeFileSync(`${OUT}/s2/${z}/${x}/${y}.png`, PNG.sync.write(png));
        if (r.failures) failed++;
      } catch (e) {
        failed++;
        console.log(`tile ${z}/${x}/${y} failed: ${(e as Error).message}`);
      }
      if (++done % 25 === 0) console.log(`${done} tiles, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeFileSync(`${OUT}/s2/meta.json`, JSON.stringify({ generated: new Date().toISOString(), maxZoom: MAX_Z, tiles: done }));
  console.log(`done: ${done} tiles, ${empty} empty, ${failed} with failed scenes, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

void main();
