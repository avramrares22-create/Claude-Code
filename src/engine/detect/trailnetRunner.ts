/**
 * Worker-side TrailNet pipeline: pick a clear summer scene, range-read the four
 * 10 m bands for the area, run the ONNX model with onnxruntime-web (WASM).
 */
import * as ort from 'onnxruntime-web/wasm';
import type { BBox } from '../config';
import { lngLatToUtm, zoneFromEpsg } from '../geo/utm';
import { getCog, readWindow } from '../imagery/cog';
import { windowFor } from '../imagery/renderTile';
import { deriveSceneFiles, searchScenes, type Scene } from '../imagery/stac';
import { normalizeBand, predict, type ProbRaster } from './trailnet';

let session: Promise<ort.InferenceSession> | null = null;

export interface TrailNetConfig {
  modelUrl: string;
  /** Directory holding ort-wasm-simd-threaded.{mjs,wasm}. */
  wasmBase: string;
}

function getSession(cfg: TrailNetConfig) {
  session ??= (async () => {
    ort.env.wasm.wasmPaths = cfg.wasmBase;
    // Threads need cross-origin isolation (COOP/COEP); static hosts usually lack it.
    ort.env.wasm.numThreads = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ? 4 : 1;
    return ort.InferenceSession.create(cfg.modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })();
  session.catch(() => (session = null));
  return session;
}

/** Leaf-on months show trail cuts and paths best; prefer the clearest recent one. */
export async function pickTrainingLikeScene(bbox: BBox, signal?: AbortSignal): Promise<Scene | null> {
  const scenes = await searchScenes({ bbox, from: new Date(Date.now() - 450 * 86_400_000), maxCloud: 10, signal, maxItems: 500 });
  const covers = (s: Scene) => s.bbox[0] <= bbox[0] && s.bbox[1] <= bbox[1] && s.bbox[2] >= bbox[2] && s.bbox[3] >= bbox[3];
  const summer = (s: Scene) => {
    const m = new Date(s.datetime).getUTCMonth();
    return m >= 5 && m <= 8;
  };
  const ranked = scenes.filter((s) => covers(s) && s.nodata < 5).sort((a, b) => a.cloud - b.cloud || b.datetime.localeCompare(a.datetime));
  return ranked.find(summer) ?? ranked[0] ?? null;
}

export async function runTrailNet(bbox: BBox, cfg: TrailNetConfig, signal?: AbortSignal): Promise<{ raster: ProbRaster; scene: string }> {
  const scene = await pickTrainingLikeScene(bbox, signal);
  if (!scene) throw new Error('No clear Sentinel-2 scene covers this area');
  const files = deriveSceneFiles(scene.id);
  if (!files) throw new Error(`Unrecognised scene id ${scene.id}`);
  const zone = zoneFromEpsg(scene.epsg);
  const corners = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]].map(([x, y]) => lngLatToUtm(x, y, zone));
  const ext: [number, number, number, number] = [
    Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])),
    Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1])),
  ];
  const urls = [files.blue, files.green, files.red, files.nir];
  const cogs = await Promise.all(urls.map((u) => getCog(u)));
  const level = cogs[0].levels[0];
  const win = windowFor(level, ext);
  if (!win) throw new Error('Area outside the scene');
  const reads = await Promise.all(cogs.map((c) => readWindow(c, 0, win, signal)));
  const w = reads[0].win[2] - reads[0].win[0];
  const h = reads[0].win[3] - reads[0].win[1];
  const img = new Float32Array(4 * w * h);
  reads.forEach((r, c) => normalizeBand(r.data, img, c * w * h));

  const s = await getSession(cfg);
  const prob = await predict(img, h, w, async (input, ph, pw) => {
    signal?.throwIfAborted();
    const out = await s.run({ image: new ort.Tensor('float32', input, [1, 4, ph, pw]) });
    return out.logits.data as Float32Array;
  });
  return {
    scene: scene.id,
    raster: {
      epsg: scene.epsg,
      originX: level.originX + reads[0].win[0] * level.resX,
      originY: level.originY - reads[0].win[1] * level.resY,
      res: level.resX,
      width: w,
      height: h,
      prob,
    },
  };
}
