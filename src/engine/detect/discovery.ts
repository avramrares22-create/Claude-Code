/**
 * "Discover hidden trails" for the area on screen: pulls public GPS traces,
 * runs the detector in a worker and caches the result on the device.
 */
import type { BBox } from '../config';
import { haversine } from '../geo/geodesy';
import type { OsmWay, Trail } from '../trails/types';
import { kvGet, kvSet } from '../util/kvStore';
import type { Alignment } from './align';
import type { DetectReply, DetectRequest } from './detect.worker';
import { fetchTraces } from './gps';
import { fetchJson } from '../util/net';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const CACHE_TTL = 30 * 86_400_000;
const SCAN_TIMEOUT_MS = 120_000;
const BASE = import.meta.env.BASE_URL;
/** Largest area scanned at once (the OSM API caps trackpoint boxes at 0.25 deg²). */
const MAX_SPAN = 0.08;

export class Discovery {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: DetectReply) => void>();

  private run(req: DistributiveOmit<DetectRequest, 'id'>): Promise<Trail[]> {
    return this.runFull(req).then((r) => r.trails ?? []);
  }

  private runFull(req: DistributiveOmit<DetectRequest, 'id'>): Promise<DetectReply> {
    if (!this.worker) {
      const w = new Worker(new URL('./detect.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<DetectReply>) => {
        this.pending.get(ev.data.id)?.(ev.data);
        this.pending.delete(ev.data.id);
      };
      // A crash (e.g. memory pressure on iOS) fails in-flight scans; the next scan respawns.
      w.onerror = (ev) => {
        ev.preventDefault();
        this.reset(`Trail detector crashed: ${ev.message || 'unknown error'}`);
      };
      this.worker = w;
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error('Trail scan timed out'));
      }, SCAN_TIMEOUT_MS);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        if (r.error) reject(new Error(r.error));
        else resolve(r);
      });
      this.worker!.postMessage({ ...req, id } as DetectRequest);
    });
  }

  private reset(message: string) {
    this.worker?.terminate();
    this.worker = null;
    for (const done of this.pending.values()) done({ id: -1, error: message });
    this.pending.clear();
  }

  /** Clamps a view to a scan box around its centre, snapped to a grid so caching works. */
  static scanBox(view: BBox): BBox {
    const cx = (view[0] + view[2]) / 2;
    const cy = (view[1] + view[3]) / 2;
    const half = Math.min(MAX_SPAN, Math.max(view[2] - view[0], view[3] - view[1])) / 2;
    const q = (v: number) => Math.round(v * 200) / 200; // 0.005° grid
    return [q(cx - half), q(cy - half), q(cx + half), q(cy + half)];
  }

  async scanGps(view: BBox, ways: Iterable<OsmWay>, signal?: AbortSignal): Promise<{ bbox: BBox; trails: Trail[]; cached: boolean }> {
    const bbox = Discovery.scanBox(view);
    const key = `gps-detect:v1:${bbox.join(',')}`;
    const cached = await kvGet<Trail[]>(key, CACHE_TTL);
    if (cached) return { bbox, trails: cached, cached: true };
    const traces = await fetchTraces(bbox, 12, signal);
    const trails = await this.run({ type: 'gps', bbox, traces, ways: localWays(ways, bbox) });
    void kvSet(key, trails);
    return { bbox, trails, cached: false };
  }

  /**
   * TrailNet on the latest clear Sentinel-2 scene for the area: finds unmapped
   * trails and AI-aligns mapped ones onto what the imagery shows.
   */
  async scanImagery(view: BBox, ways: Iterable<OsmWay>): Promise<{ bbox: BBox; trails: Trail[]; aligned: Alignment[]; cached: boolean }> {
    const bbox = Discovery.scanBox(view);
    const key = `imagery-detect:v3:${bbox.join(',')}`;
    const cached = await kvGet<{ trails: Trail[]; aligned: Alignment[] }>(key, CACHE_TTL);
    if (cached) return { bbox, ...cached, cached: true };
    const meta = await fetchJson<{ threshold: number }>(`${BASE}models/trailnet.json`);
    const origin = self.location.origin;
    const r = await this.runFull({
      type: 'imagery',
      bbox,
      ways: localWays(ways, bbox),
      threshold: meta.threshold,
      cfg: { modelUrl: `${origin}${BASE}models/trailnet.onnx`, wasmBase: `${origin}${BASE}ort/` },
    });
    const result = { trails: r.trails ?? [], aligned: r.aligned ?? [] };
    void kvSet(key, result);
    return { bbox, ...result, cached: false };
  }

  static totalLength(trails: Trail[]): number {
    let m = 0;
    for (const t of trails) for (let k = 1; k < t.coords.length; k++) m += haversine(...t.coords[k - 1], ...t.coords[k]);
    return m;
  }
}

/** Only ways that can matter for this box (keeps the worker message small). */
function localWays(ways: Iterable<OsmWay>, bbox: BBox, pad = 0.002): OsmWay[] {
  const out: OsmWay[] = [];
  for (const w of ways) {
    if (w.geometry.some((p) => p.lon > bbox[0] - pad && p.lon < bbox[2] + pad && p.lat > bbox[1] - pad && p.lat < bbox[3] + pad)) out.push(w);
  }
  return out;
}
