/**
 * Loads OSM trail data in fixed z11 cells, merges cells, and derives Trails/POIs.
 * Cells are cached in IndexedDB so revisited areas work offline.
 */
import { OVERPASS, type BBox } from '../config';
import { tileBBox, tilesInBBox } from '../geo/mercator';
import { kvGet, kvSet } from '../util/kvStore';
import { classifyPoi, classifyWay, routeFromRelation } from './classify';
import { fetchOverpass } from './overpass';
import { decodeCell, type TrailCellV1 } from './cellFormat';
import { dataUrl } from '../util/base';
import type * as GeoJSON from 'geojson';
import type { OsmElement, OsmNode, OsmRelation, OsmWay, Poi, Trail, TrailKind, TrailRoute } from './types';
import { fetchJson, HttpError } from '../util/net';

export type Loader = (bbox: BBox, signal?: AbortSignal, cell?: [number, number, number]) => Promise<OsmElement[]>;

let staticMeta: Promise<boolean> | null = null;
/** Whether the CI-built Romania trail cells are published next to the app. */
function hasStaticCells(): Promise<boolean> {
  staticMeta ??= fetch(dataUrl('trails/meta.json'))
    .then((r) => r.ok)
    .catch(() => false);
  return staticMeta;
}

/**
 * Default loader: the pre-built static cell (fast, reliable, whole-country),
 * falling back to live Overpass when the app runs without published data.
 */
export const defaultLoader: Loader = async (bbox, signal, cell) => {
  if (cell && (await hasStaticCells())) {
    try {
      return decodeCell(await fetchJson<TrailCellV1>(dataUrl(`trails/${cell[0]}/${cell[1]}/${cell[2]}.json`), { signal }));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return []; // no trails in this cell (e.g. outside Romania)
      if (signal?.aborted) throw err;
      // Static host hiccup: fall through to live Overpass.
    }
  }
  return fetchOverpass(bbox, signal);
};

const CELL_TTL = 7 * 86_400_000;
const MAX_CELLS_PER_VIEW = 16;

export const KIND_COLORS: Record<TrailKind, string> = {
  marked: '#d7263d',
  path: '#f3e6c4',
  track: '#d9a55b',
  road: '#e8e8e8',
  hidden: '#ff5fc8',
  detected: '#35e0ff',
};

export class TrailStore {
  private ways = new Map<number, OsmWay>();
  private relations = new Map<number, OsmRelation>();
  private nodes = new Map<number, OsmNode>();
  private cells = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private derived: { trails: Trail[]; pois: Poi[] } | null = null;
  /** Trails found outside OSM (GPS traces, imagery), keyed by detector. */
  private detected = new Map<string, Trail[]>();
  /** AI-aligned geometry per OSM way id (and the shift in metres). */
  private aligned = new Map<number, { coords: Array<[number, number]>; shift: number }>();
  /** Whether corrected geometry is shown/used (user setting). */
  useAlignment = true;

  constructor(
    private loader: Loader = defaultLoader,
    private useCache = true,
  ) {}

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Ensures every cell intersecting bbox is loaded. Resolves when all settled. */
  async ensure(bbox: BBox, signal?: AbortSignal): Promise<{ failed: number }> {
    const cells = tilesInBBox(bbox, OVERPASS.cellZoom).slice(0, MAX_CELLS_PER_VIEW);
    let failed = 0;
    await Promise.all(
      cells.map(([z, x, y]) => this.loadCell(z, x, y, signal).catch(() => void failed++)),
    );
    return { failed };
  }

  private loadCell(z: number, x: number, y: number, signal?: AbortSignal): Promise<void> {
    const key = `overpass:v1:${z}/${x}/${y}`;
    let p = this.cells.get(key);
    if (!p) {
      p = (async () => {
        let els = this.useCache ? await kvGet<OsmElement[]>(key, CELL_TTL) : null;
        if (!els) {
          els = await this.loader(tileBBox(z, x, y), signal, [z, x, y]);
          if (this.useCache) void kvSet(key, els);
        }
        this.ingest(els);
      })();
      // Failed/aborted cells may be retried on the next view change.
      p.catch(() => this.cells.delete(key));
      this.cells.set(key, p);
    }
    return p;
  }

  ingest(elements: OsmElement[]) {
    for (const el of elements) {
      if (el.type === 'way' && el.geometry?.length >= 2) this.ways.set(el.id, el);
      else if (el.type === 'relation') this.relations.set(el.id, el);
      else if (el.type === 'node' && el.tags) this.nodes.set(el.id, el);
    }
    this.derived = null;
    for (const fn of this.listeners) fn();
  }

  /** Replaces the detected trails of one detector (e.g. 'gps', 'imagery'). */
  setDetected(source: string, trails: Trail[]) {
    this.detected.set(source, trails);
    this.derived = null;
    for (const fn of this.listeners) fn();
  }

  /** Applies AI-aligned geometry (vertex count must match the OSM way). */
  setAligned(items: Array<{ wayId: number; coords: Array<[number, number]>; shift: number }>) {
    for (const a of items) this.aligned.set(a.wayId, { coords: a.coords, shift: a.shift });
    this.derived = null;
    for (const fn of this.listeners) fn();
  }

  setUseAlignment(on: boolean) {
    this.useAlignment = on;
    this.derived = null;
    for (const fn of this.listeners) fn();
  }

  get alignedCount(): number {
    return this.aligned.size;
  }

  /** Raw OSM node coordinates of loaded ways, for snapping detected trails onto the network. */
  osmWays(): Iterable<OsmWay> {
    return this.ways.values();
  }

  private derive() {
    if (this.derived) return this.derived;
    const routesByWay = new Map<number, TrailRoute[]>();
    for (const r of this.relations.values()) {
      const route = routeFromRelation(r);
      for (const m of r.members) {
        if (m.type !== 'way') continue;
        const list = routesByWay.get(m.ref);
        if (list) list.push(route);
        else routesByWay.set(m.ref, [route]);
      }
    }
    const trails = [...this.ways.values()].map((w) => {
      const t = classifyWay(w, routesByWay.get(w.id) ?? []);
      const a = this.useAlignment ? this.aligned.get(w.id) : undefined;
      if (a && a.coords.length === t.coords.length) {
        t.coords = a.coords;
        t.tags = { ...t.tags, 'natura:aligned_m': String(Math.round(a.shift)) };
      }
      return t;
    });
    for (const list of this.detected.values()) trails.push(...list);
    const pois = [...this.nodes.values()].map(classifyPoi).filter((p): p is Poi => p !== null);
    this.derived = { trails, pois };
    return this.derived;
  }

  get trails(): Trail[] {
    return this.derive().trails;
  }

  get pois(): Poi[] {
    return this.derive().pois;
  }

  trailsGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
    return {
      type: 'FeatureCollection',
      features: this.trails.map((t) => ({
        type: 'Feature',
        id: t.wayId,
        geometry: { type: 'LineString', coordinates: t.coords },
        properties: {
          wayId: t.wayId,
          kind: t.kind,
          name: t.name ?? t.routes[0]?.name ?? '',
          hidden: t.hiddenScore,
          difficulty: t.difficulty,
          color: t.routes[0]?.marking?.color ?? KIND_COLORS[t.kind],
          shape: t.routes[0]?.marking?.shape ?? '',
          routes: t.routes.map((r) => r.name).filter(Boolean).join(' · '),
          surface: t.surfaceClass,
          grade: t.trackGrade,
          mtb: t.mtbScale,
          foot: t.access.foot,
          bike: t.access.bike,
          moto: t.access.moto,
          source: t.source,
          confidence: t.confidence,
          usage: t.tags['detected:usage'] ?? '',
          aligned: Number(t.tags['natura:aligned_m'] ?? 0),
          sources: t.tags['detected:sources'] ?? t.source,
        },
      })),
    };
  }

  poisGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Point> {
    return {
      type: 'FeatureCollection',
      features: this.pois.map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          kind: p.kind,
          name: p.name ?? '',
          label: p.name ? (p.ele ? `${p.name} ${Math.round(p.ele)} m` : p.name) : p.ele ? `${Math.round(p.ele)} m` : '',
        },
      })),
    };
  }
}
