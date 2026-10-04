/// <reference lib="webworker" />
/** Runs trail detectors off the main thread (rasters are millions of cells). */
import { detectFromTraces, type Trace } from './gps';
import type { BBox } from '../config';
import type { OsmWay, Trail } from '../trails/types';

export type DetectRequest = { type: 'gps'; id: number; bbox: BBox; traces: Trace[]; ways: OsmWay[] };
export type DetectReply = { id: number; trails?: Trail[]; error?: string };

self.onmessage = (ev: MessageEvent<DetectRequest>) => {
  const msg = ev.data;
  try {
    const r = detectFromTraces(msg.traces, msg.bbox, msg.ways);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: msg.id, trails: r.trails } satisfies DetectReply);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: msg.id, error: String((err as Error).message ?? err) } satisfies DetectReply);
  }
};
