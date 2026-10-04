/**
 * Loads OSM trail data in fixed z11 cells, merges cells, and derives Trails/POIs.
 * Cells are cached in IndexedDB so revisited areas work offline.
 */
import { OVERPASS, type BBox } from '../config';
import { tileBBox, tilesInBBox } from '../geo/mercator';
import { kvGet, kvSet } from '../util/kvStore';
import { classifyPoi, classifyWay, routeFromRelation } from './classify';
import { fetchOverpass } from './overpass';
import type * as GeoJSON from 'geojson';
import type { OsmElement, OsmNode, OsmRelation, OsmWay, Poi, Trail, TrailRoute } from './types';

export type Loader = (bbox: BBox, signal?: AbortSignal) => Promise<OsmElement[]>;

const CELL_TTL = 7 * 86_400_000;
const MAX_CELLS_PER_VIEW = 16;

const DEFAULT_COLORS = { path: '#f3e6c4', track: '#c9a46a', hidden: '#ff5fc8', marked: '#d7263d' } as const;

export class TrailStore {
  private ways = new Map<number, OsmWay>();
  private relations = new Map<number, OsmRelation>();
  private nodes = new Map<number, OsmNode>();
  private cells = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private derived: { trails: Trail[]; pois: Poi[] } | null = null;

  constructor(
    private loader: Loader = fetchOverpass,
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
          els = await this.loader(tileBBox(z, x, y), signal);
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
    const trails = [...this.ways.values()].map((w) => classifyWay(w, routesByWay.get(w.id) ?? []));
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
          color: t.routes[0]?.marking?.color ?? DEFAULT_COLORS[t.kind],
          shape: t.routes[0]?.marking?.shape ?? '',
          routes: t.routes.map((r) => r.name).filter(Boolean).join(' · '),
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
