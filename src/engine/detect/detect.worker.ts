/// <reference lib="webworker" />
/** Runs trail detectors off the main thread (rasters are millions of cells). */
import type { BBox } from '../config';
import type { OsmWay, Trail } from '../trails/types';
import { detectFromTraces, type Trace } from './gps';
import { detectFromProbability } from './trailnet';
import { runTrailNet, type TrailNetConfig } from './trailnetRunner';

export type DetectRequest =
  | { type: 'gps'; id: number; bbox: BBox; traces: Trace[]; ways: OsmWay[] }
  | { type: 'imagery'; id: number; bbox: BBox; ways: OsmWay[]; cfg: TrailNetConfig; threshold: number };
export type DetectReply = { id: number; trails?: Trail[]; scene?: string; error?: string };

const reply = (r: DetectReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

self.onmessage = async (ev: MessageEvent<DetectRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'gps') {
      reply({ id: msg.id, trails: detectFromTraces(msg.traces, msg.bbox, msg.ways).trails });
    } else {
      const { raster, scene } = await runTrailNet(msg.bbox, msg.cfg);
      const trails = detectFromProbability(raster, msg.bbox, msg.ways, { threshold: msg.threshold, cell: 5, knownRadius: 20 });
      reply({ id: msg.id, trails, scene });
    }
  } catch (err) {
    reply({ id: msg.id, error: String((err as Error).message ?? err) });
  }
};
