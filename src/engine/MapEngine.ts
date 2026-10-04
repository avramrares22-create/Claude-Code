/**
 * MapEngine: the app-facing core. Owns the MapLibre map and wires together
 * the Sentinel-2 imagery engine, terrain, trail intelligence and the router.
 */
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatLike, Map as MLMap } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
// MapLibre 6 locates its worker next to its own module, which breaks once bundled.
// `?worker&url` makes Vite bundle the worker (with its shared chunk) and give us its URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { HIRES, IMAGERY, MAX_MAP_ZOOM, OVERPASS, ROMANIA_BBOX, ROMANIA_CENTER, type BBox, type HiresProvider } from './config';
import { chooseHires } from './imagery/hires';
import { imageryStats, imageryTileUrl, registerImageryProtocol } from './imagery/imageryProtocol';
import type { ImageryMode } from './imagery/renderTile';
import { SceneIndex } from './imagery/sceneIndex';
import { TrailGraph } from './routing/graph';
import { DEFAULT_PREFS, findRoute, type Route, type RoutePreferences } from './routing/router';
import { buildBaseStyle, FONTS, hiresId } from './style';
import { TerrariumElevation } from './terrain/elevation';
import { TrailStore } from './trails/trailStore';
import type { Trail, TrailKind } from './trails/types';
import { Discovery } from './detect/discovery';

export interface EngineEvents {
  'imagery:index': { grids: number };
  'imagery:error': { message: string };
  'imagery:hires': { provider: string | null };
  'trails:loading': Record<string, never>;
  'trails:loaded': { trails: number; pois: number; failedCells: number };
  'trail:click': { wayId: number; name: string; kind: TrailKind; difficulty: number; routes: string; lngLat: [number, number] };
  'poi:click': { id: number; kind: string; name: string; label: string; lngLat: [number, number] };
  'map:click': { lngLat: [number, number] };
}

type Handler<K extends keyof EngineEvents> = (e: EngineEvents[K]) => void;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface EngineOptions {
  container: HTMLElement | string;
  center?: LngLatLike;
  zoom?: number;
}

export class MapEngine {
  readonly map: MLMap;
  readonly trails = new TrailStore();
  readonly elevation = new TerrariumElevation();
  readonly discovery = new Discovery();
  private gpsAreas = new Map<string, Trail[]>();
  readonly ready: Promise<void>;
  readonly imageryStats = imageryStats;
  private sceneIndex: Promise<SceneIndex>;
  private unregisterImagery: () => void;
  private handlers = new Map<keyof EngineEvents, Set<Handler<never>>>();
  private graph: TrailGraph | null = null;
  private trailAbort: AbortController | null = null;
  private pendingSync = false;
  private imageryMode: ImageryMode | 'off' = 'truecolor';
  private hires: HiresProvider | null = null;

  constructor(opts: EngineOptions) {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    this.sceneIndex = SceneIndex.load();
    this.sceneIndex.then(
      (i) => this.emit('imagery:index', { grids: i.size }),
      (e: Error) => this.emit('imagery:error', { message: e.message }),
    );
    this.unregisterImagery = registerImageryProtocol(this.sceneIndex);

    const [w, s, e, n] = ROMANIA_BBOX;
    this.map = new maplibregl.Map({
      container: opts.container,
      style: buildBaseStyle(),
      center: opts.center ?? ROMANIA_CENTER,
      zoom: opts.zoom ?? 6.5,
      maxBounds: [w - 3, s - 2, e + 3, n + 2],
      minZoom: 5,
      maxZoom: MAX_MAP_ZOOM,
      maxPitch: 80,
      attributionControl: { compact: true },
      // Phones: cap pixel ratio so a 3x display doesn't render 9x the pixels.
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    });

    this.trails.onChange(() => {
      this.graph = null;
      this.scheduleSync();
    });

    // 'style.load' (not 'load'): 'load' waits for the first fully-rendered frame,
    // i.e. every imagery tile, which on a slow phone connection takes seconds.
    this.ready = new Promise((resolve) => {
      this.map.once('style.load', () => {
        this.addEngineLayers();
        void chooseHires().then((p) => {
          this.hires = p;
          this.applyImageryVisibility();
          this.emit('imagery:hires', { provider: p?.label ?? null });
        });
        this.bindInteractions();
        this.map.on('moveend', () => void this.loadTrailsForView());
        void this.loadTrailsForView();
        resolve();
      });
    });
  }

  on<K extends keyof EngineEvents>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  private emit<K extends keyof EngineEvents>(type: K, e: EngineEvents[K]) {
    for (const fn of this.handlers.get(type) ?? []) (fn as Handler<K>)(e);
  }

  // ---------------------------------------------------------------- layers

  private addEngineLayers() {
    const m = this.map;
    m.addSource('trails', { type: 'geojson', data: EMPTY, promoteId: 'wayId' });
    m.addSource('pois', { type: 'geojson', data: EMPTY });
    m.addSource('route', { type: 'geojson', data: EMPTY });

    // Zoom interpolation must be the outermost expression, so per-feature
    // variation (marked vs other) goes inside each stop.
    const width = (base: number, markedBase = base): maplibregl.ExpressionSpecification => {
      const at = (k: number): maplibregl.ExpressionSpecification | number =>
        markedBase === base ? base * k : ['match', ['get', 'kind'], 'marked', markedBase * k, base * k];
      return ['interpolate', ['exponential', 1.6], ['zoom'], 11, at(0.6), 14, at(1.5), 17, at(4)];
    };

    m.addLayer({
      id: 'trails-casing',
      type: 'line',
      source: 'trails',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-width': width(2.6) },
    });
    m.addLayer({
      id: 'trails-line',
      type: 'line',
      source: 'trails',
      filter: ['!', ['in', ['get', 'kind'], ['literal', ['hidden', 'detected']]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': width(1.3, 2),
      },
    });
    m.addLayer({
      id: 'trails-hidden',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'hidden'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': width(1.5), 'line-dasharray': [2, 1.5] },
    });
    // Trails found from GPS traces / imagery: glowing cyan, fainter when less certain.
    m.addLayer({
      id: 'trails-detected-glow',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'detected'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#35e0ff', 'line-width': width(4), 'line-blur': 4, 'line-opacity': 0.35 },
    });
    m.addLayer({
      id: 'trails-detected',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'detected'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#35e0ff',
        'line-width': width(1.6),
        'line-opacity': ['interpolate', ['linear'], ['get', 'confidence'], 0, 0.45, 1, 1],
      },
    });
    m.addLayer({
      id: 'trails-label',
      type: 'symbol',
      source: 'trails',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': FONTS.FONT,
        'text-size': 11,
      },
      paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.2 },
    });
    m.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': width(5) },
    });
    m.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff7a00', 'line-width': width(3.2) },
    });
    m.addLayer({
      id: 'pois-circle',
      type: 'circle',
      source: 'pois',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
        'circle-color': [
          'match',
          ['get', 'kind'],
          'peak', '#8b5a2b',
          'saddle', '#a07850',
          'waterfall', '#27a4f2',
          'spring', '#4fc3f7',
          'cave', '#555555',
          'viewpoint', '#f2c418',
          'hut', '#d7263d',
          'shelter', '#e8743b',
          'camp', '#2e9e44',
          '#ffffff',
        ],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
      },
    });
    m.addLayer({
      id: 'pois-label',
      type: 'symbol',
      source: 'pois',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONTS.FONT,
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.2 },
    });
  }

  private bindInteractions() {
    const m = this.map;
    m.on('click', (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ['pois-circle', 'trails-line', 'trails-hidden', 'trails-detected'] })[0];
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (hit?.layer.id === 'pois-circle') {
        const p = hit.properties as { id: number; kind: string; name: string; label: string };
        this.emit('poi:click', { ...p, lngLat });
      } else if (hit) {
        const p = hit.properties as { wayId: number; name: string; kind: TrailKind; difficulty: number; routes: string };
        this.emit('trail:click', { ...p, lngLat });
      } else {
        this.emit('map:click', { lngLat });
      }
    });
    for (const id of ['pois-circle', 'trails-line', 'trails-hidden', 'trails-detected']) {
      m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
    }
  }

  /** Coalesces GeoJSON updates to one per frame (cells often land together). */
  private scheduleSync() {
    if (this.pendingSync) return;
    this.pendingSync = true;
    requestAnimationFrame(() => {
      this.pendingSync = false;
      (this.map.getSource('trails') as GeoJSONSource | undefined)?.setData(this.trails.trailsGeoJSON());
      (this.map.getSource('pois') as GeoJSONSource | undefined)?.setData(this.trails.poisGeoJSON());
    });
  }

  private async loadTrailsForView() {
    if (this.map.getZoom() < OVERPASS.minZoom) return;
    this.trailAbort?.abort();
    const ac = (this.trailAbort = new AbortController());
    const b = this.map.getBounds();
    this.emit('trails:loading', {});
    const { failed } = await this.trails.ensure([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], ac.signal);
    if (ac.signal.aborted) return;
    this.emit('trails:loaded', { trails: this.trails.trails.length, pois: this.trails.pois.length, failedCells: failed });
  }

  // ---------------------------------------------------------------- public API

  setImageryMode(mode: ImageryMode | 'off') {
    this.imageryMode = mode;
    if (mode !== 'off') (this.map.getSource('imagery') as maplibregl.RasterTileSource).setTiles([imageryTileUrl(mode)]);
    this.applyImageryVisibility();
  }

  /** Sentinel mosaic always (unless off); high-res photos only in true colour. */
  private applyImageryVisibility() {
    const mode = this.imageryMode;
    this.map.setLayoutProperty('imagery', 'visibility', mode === 'off' ? 'none' : 'visible');
    for (const p of HIRES) {
      const show = mode === 'truecolor' && this.hires?.id === p.id;
      this.map.setLayoutProperty(hiresId(p.id), 'visibility', show ? 'visible' : 'none');
    }
  }

  get hiresProvider(): HiresProvider | null {
    return this.hires;
  }

  getImageryMode() {
    return this.imageryMode;
  }

  setTerrain3D(on: boolean, exaggeration = 1.4) {
    this.map.setTerrain(on ? { source: 'terrainDem', exaggeration } : null);
    this.map.easeTo({ pitch: on ? 60 : 0, duration: 800 });
  }

  /** Which trail kinds to show (e.g. only hidden ones). */
  setVisibleKinds(kinds: TrailKind[]) {
    const f: maplibregl.FilterSpecification = ['in', ['get', 'kind'], ['literal', kinds]];
    this.map.setFilter('trails-casing', f);
    this.map.setFilter('trails-label', f);
    this.map.setFilter('trails-line', ['all', f, ['!', ['in', ['get', 'kind'], ['literal', ['hidden', 'detected']]]]]);
    this.map.setFilter('trails-hidden', ['all', f, ['==', ['get', 'kind'], 'hidden']]);
    this.map.setFilter('trails-detected', ['all', f, ['==', ['get', 'kind'], 'detected']]);
    this.map.setFilter('trails-detected-glow', ['all', f, ['==', ['get', 'kind'], 'detected']]);
  }

  async planRoute(from: [number, number], to: [number, number], prefs: RoutePreferences = DEFAULT_PREFS): Promise<Route | null> {
    this.graph ??= new TrailGraph(this.trails.trails);
    // Elevation only around the two endpoints keeps DEM downloads bounded.
    const pad = 0.02;
    const bbox: BBox = [
      Math.min(from[0], to[0]) - pad,
      Math.min(from[1], to[1]) - pad,
      Math.max(from[0], to[0]) + pad,
      Math.max(from[1], to[1]) + pad,
    ];
    try {
      await this.elevation.prepare(bbox);
    } catch {
      // Too large or offline: route without slope (Tobler on flat ground).
    }
    this.graph.attachElevation(this.elevation);
    const route = findRoute(this.graph, from, to, prefs);
    this.showRoute(route);
    return route;
  }

  showRoute(route: Route | null) {
    const src = this.map.getSource('route') as GeoJSONSource;
    src.setData(
      route
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coords } }] }
        : EMPTY,
    );
  }

  /**
   * Finds trails people use but nobody mapped, around the centre of the view,
   * from public GPS traces. Results are cached on the device for 30 days.
   */
  async discoverHiddenTrails(signal?: AbortSignal): Promise<{ found: number; meters: number; cached: boolean }> {
    if (this.map.getZoom() < 12) throw new Error('Zoom in closer to scan for hidden trails');
    const b = this.map.getBounds();
    const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const box = Discovery.scanBox(view);
    // OSM must be loaded first so only *unmapped* corridors come back.
    await this.trails.ensure(box, signal);
    const r = await this.discovery.scanGps(view, this.trails.osmWays(), signal);
    this.gpsAreas.set(r.bbox.join(','), r.trails);
    this.trails.setDetected('gps', [...this.gpsAreas.values()].flat());
    return { found: r.trails.length, meters: Discovery.totalLength(r.trails), cached: r.cached };
  }

  flyTo(lngLat: [number, number], zoom = 14) {
    this.map.flyTo({ center: lngLat, zoom, essential: true });
  }

  /** Imagery is limited to the Sentinel source range; exposed for UI hints. */
  static readonly imageryZoomRange = [IMAGERY.minZoom, IMAGERY.maxZoom] as const;

  destroy() {
    this.trailAbort?.abort();
    this.map.remove();
    this.unregisterImagery();
  }
}
