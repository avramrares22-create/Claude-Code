/// <reference lib="webworker" />
/** Runs trail detectors off the main thread (rasters are millions of cells). */
import type { BBox } from '../config';
import type { OsmWay, Trail } from '../trails/types';
import { detectFromTraces, type Trace } from './gps';
import { alignWays, type Alignment } from './align';
import { detectFromProbability } from './trailnet';
import { runTrailNet, type TrailNetConfig } from './trailnetRunner';

export type DetectRequest =
  | { type: 'gps'; id: number; bbox: BBox; traces: Trace[]; ways: OsmWay[] }
  | { type: 'imagery'; id: number; bbox: BBox; ways: OsmWay[]; cfg: TrailNetConfig; threshold: number };
export type DetectReply = { id: number; trails?: Trail[]; aligned?: Alignment[]; scene?: string; error?: string };

const reply = (r: DetectReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

self.onmessage = async (ev: MessageEvent<DetectRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'gps') {
      reply({ id: msg.id, trails: detectFromTraces(msg.traces, msg.bbox, msg.ways).trails });
    } else {
      const { raster, scene } = await runTrailNet(msg.bbox, msg.cfg);
      // Align first: detection then measures "unmapped" against the corrected geometry.
      const aligned = alignWays(raster, msg.ways, { minProb: msg.threshold });
      const byId = new Map(aligned.map((a) => [a.wayId, a.coords]));
      const ways = msg.ways.map((w) => {
        const c = byId.get(w.id);
        return c ? { ...w, geometry: c.map(([lon, lat]) => ({ lon, lat })) } : w;
      });
      const trails = detectFromProbability(raster, msg.bbox, ways, { threshold: msg.threshold, cell: 5, knownRadius: 20 });
      reply({ id: msg.id, trails, aligned, scene });
    }
  } catch (err) {
    reply({ id: msg.id, error: String((err as Error).message ?? err) });
  }
};
