/**
 * MapEngine: the app-facing core. Owns the MapLibre map and wires together
 * the Sentinel-2 imagery engine, terrain, trail intelligence and the router.
 */
import { MARK_COLORS } from './trails/classify';
import { applyBasemap, type BaseMode, type Theme } from './mapStyle';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LngLatLike, Map as MLMap } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
// MapLibre 6 locates its worker next to its own module, which breaks once bundled.
// `?worker&url` makes Vite bundle the worker (with its shared chunk) and give us its URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { HIRES, IMAGERY, MAX_MAP_ZOOM, OVERPASS, ROMANIA_BBOX, ROMANIA_CENTER, type BBox, type HiresProvider } from './config';
import { chooseHires } from './imagery/hires';
import { imageryStats, imageryTileUrl, registerImageryProtocol, type ImageryHandle } from './imagery/imageryProtocol';
import type { ImageryMode } from './imagery/renderTile';
import { SceneIndex } from './imagery/sceneIndex';
import { TrailGraph } from './routing/graph';
import { DEFAULT_PREFS, findRoute, type Route, type RoutePreferences } from './routing/router';
import { LearnedRouteModel, type RouteNetWeights } from './routing/routeNet';
import type { RouteModel } from './routing/routeModel';
import routeNetWeights from './routing/routenet.weights.json';
import { buildBaseStyle, FONTS, hiresId } from './style';
import { TerrariumElevation } from './terrain/elevation';
import { TrailStore } from './trails/trailStore';
import type { Access, Trail, TrailKind } from './trails/types';
import { Discovery } from './detect/discovery';
import { downloadPack, planOfflineArea, planPack, PACKS, type OfflinePlan, type Progress } from './offline';
import { latToTileY, lngToTileX, tilesInBBox } from './geo/mercator';
import { mergeDetections } from './detect/merge';

/** Properties of a trail feature on the map (see TrailStore.trailsGeoJSON). */
export interface TrailProps {
  wayId: number;
  kind: TrailKind;
  name: string;
  difficulty: number;
  routes: string;
  surface: string;
  grade: number;
  mtb: number;
  foot: Access;
  bike: Access;
  moto: Access;
  source: 'osm' | 'gps' | 'imagery';
  confidence: number;
  usage: string;
  sources: string;
  /** AI alignment shift in metres (0 = untouched). */
  aligned: number;
}

export interface DiscoveryResult {
  found: number;
  meters: number;
  /** Mapped trails moved onto the imagery by AI alignment. */
  aligned: number;
  /** Detections per source, or the reason that source failed. */
  gps: number | string;
  imagery: number | string;
}

export interface EngineEvents {
  'imagery:index': { grids: number };
  'imagery:error': { message: string };
  'imagery:hires': { provider: string | null };
  'trails:loading': Record<string, never>;
  'trails:loaded': { trails: number; pois: number; failedCells: number };
  'trail:click': TrailProps & { lngLat: [number, number] };
  'poi:click': { id: number; kind: string; name: string; label: string; lngLat: [number, number] };
  'map:click': { lngLat: [number, number] };
  'align:start': Record<string, never>;
  'align:done': { aligned: number; detected: number };
}

type Handler<K extends keyof EngineEvents> = (e: EngineEvents[K]) => void;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const AUTO_ALIGN_ZOOM = 14;
const AUTO_SCAN_ZOOM = 12;
const AUTO_SCAN_MS = 60_000;

export interface EngineOptions {
  container: HTMLElement | string;
  center?: LngLatLike;
  zoom?: number;
  baseMode?: BaseMode;
  theme?: Theme;
}

export class MapEngine {
  readonly map: MLMap;
  readonly trails = new TrailStore();
  readonly elevation = new TerrariumElevation();
  readonly discovery = new Discovery();
  /** On-device routing model learned from real GPS trips in Romania. */
  routeModel: RouteModel = new LearnedRouteModel(routeNetWeights as unknown as RouteNetWeights);
  private detected = { gps: new Map<string, Trail[]>(), imagery: new Map<string, Trail[]>() };
  readonly ready: Promise<void>;
  readonly imageryStats = imageryStats;
  private sceneIndex: Promise<SceneIndex>;
  private imagery: ImageryHandle;
  private handlers = new Map<keyof EngineEvents, Set<Handler<never>>>();
  private graph: TrailGraph | null = null;
  private trailAbort: AbortController | null = null;
  private pendingSync = false;
  private imageryMode: ImageryMode | 'off' = 'truecolor';
  private baseMode: BaseMode = 'map';
  private theme: Theme = 'light';
  private hires: HiresProvider | null = null;

  constructor(opts: EngineOptions) {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    this.sceneIndex = SceneIndex.load();
    this.sceneIndex.then(
      (i) => this.emit('imagery:index', { grids: i.size }),
      (e: Error) => this.emit('imagery:error', { message: e.message }),
    );
    this.imagery = registerImageryProtocol(this.sceneIndex);

    const [w, s, e, n] = ROMANIA_BBOX;
    this.baseMode = opts.baseMode ?? 'map';
    this.theme = opts.theme ?? 'light';
    this.map = new maplibregl.Map({
      container: opts.container,
      style: buildBaseStyle(this.theme, this.baseMode),
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
        // Place names stay readable above trails, but under the route being followed.
        for (const l of this.map.getStyle().layers) if (l.id.startsWith('bm-label-')) this.map.moveLayer(l.id, 'route-done');
        this.applyLook();
        void chooseHires().then((p) => {
          this.hires = p;
          this.applyImageryVisibility();
          this.emit('imagery:hires', { provider: p?.label ?? null });
        });
        this.bindInteractions();
        this.map.on('moveend', () => void this.loadTrailsForView());
        this.map.on('idle', () => {
          this.scheduleAutoAlign();
          this.lookAhead();
        });
        this.map.on('movestart', () => this.lookAheadAbort?.abort());
        this.startAutoScan();
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

  /** Painted-blaze icons for every marking colour × shape (white plate, coloured symbol), drawn at 2×. */
  private addMarkingIcons() {
    const px = 2;
    const S = 22 * px;
    for (const color of Object.values(MARK_COLORS)) {
      for (const shape of ['stripe', 'cross', 'dot', 'triangle', 'other'] as const) {
        const id = `mark-${color.replace('#', '').toLowerCase()}-${shape}`;
        if (this.map.hasImage(id)) continue;
        const c = new OffscreenCanvas(S, S);
        const g = c.getContext('2d')!;
        const r = 5 * px;
        g.beginPath();
        g.roundRect(1.5 * px, 1.5 * px, S - 3 * px, S - 3 * px, r);
        g.fillStyle = '#ffffff';
        g.fill();
        g.lineWidth = 1.5 * px;
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.stroke();
        g.fillStyle = color;
        const m = S / 2;
        if (shape === 'stripe') g.fillRect(3 * px, m - 3.4 * px, S - 6 * px, 6.8 * px);
        else if (shape === 'cross') {
          g.fillRect(m - 2.4 * px, 4.5 * px, 4.8 * px, S - 9 * px);
          g.fillRect(4.5 * px, m - 2.4 * px, S - 9 * px, 4.8 * px);
        } else if (shape === 'dot') {
          g.beginPath();
          g.arc(m, m, 5.6 * px, 0, Math.PI * 2);
          g.fill();
        } else if (shape === 'triangle') {
          g.beginPath();
          g.moveTo(m, 4.5 * px);
          g.lineTo(S - 4.5 * px, S - 5.5 * px);
          g.lineTo(4.5 * px, S - 5.5 * px);
          g.closePath();
          g.fill();
        } else {
          g.beginPath();
          g.moveTo(m, 4 * px);
          g.lineTo(S - 4 * px, m);
          g.lineTo(m, S - 4 * px);
          g.lineTo(4 * px, m);
          g.closePath();
          g.fill();
        }
        this.map.addImage(id, g.getImageData(0, 0, S, S), { pixelRatio: px });
      }
    }
  }

  private addEngineLayers() {
    const m = this.map;
    this.addMarkingIcons();
    m.addSource('trails', { type: 'geojson', data: EMPTY, promoteId: 'wayId' });
    m.addSource('pois', { type: 'geojson', data: EMPTY });
    m.addSource('route', { type: 'geojson', data: EMPTY });
    m.addSource('route-done', { type: 'geojson', data: EMPTY });
    m.addSource('track', { type: 'geojson', data: EMPTY });
    m.addSource('imported', { type: 'geojson', data: EMPTY });

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
    // Marked trails look like their paint: a white band with the marking colour in the middle.
    m.addLayer({
      id: 'trails-marked-band',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'marked'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': width(2.2), 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 0.95] },
    });
    m.addLayer({
      id: 'trails-line',
      type: 'line',
      source: 'trails',
      filter: ['in', ['get', 'kind'], ['literal', ['marked', 'road']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': width(1.3, 1.25),
        // Roads are context, trails are the point: keep roads quiet.
        'line-opacity': ['match', ['get', 'kind'], 'road', 0.55, 1],
      },
    });
    // Footpaths dashed, tracks long-dashed (like printed hiking maps); colours follow the map type.
    m.addLayer({
      id: 'trails-path',
      type: 'line',
      source: 'trails',
      filter: ['all', ['==', ['get', 'kind'], 'path'], ['!=', ['get', 'sidewalk'], 1]],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#f3e6c4', 'line-width': width(1.15), 'line-dasharray': [1.6, 1.2] },
    });
    m.addLayer({
      id: 'trails-sidewalk',
      type: 'line',
      source: 'trails',
      minzoom: 16,
      filter: ['==', ['get', 'sidewalk'], 1],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#b9b2a6', 'line-width': width(0.8), 'line-opacity': 0.8 },
    });
    m.addLayer({
      id: 'trails-track',
      type: 'line',
      source: 'trails',
      filter: ['==', ['get', 'kind'], 'track'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#d9a55b', 'line-width': width(1.4), 'line-dasharray': [3.2, 1.6] },
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
    // The painted blazes themselves, repeated along marked trails (both, where two routes share a path).
    const markLayer = (id: string, prop: string, offset: number): maplibregl.LayerSpecification => ({
      id,
      type: 'symbol',
      source: 'trails',
      minzoom: 13,
      filter: ['!=', ['get', prop], ''],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 13, 180, 17, 260] as unknown as number,
        'icon-image': ['get', prop],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 16, 1, 18, 1.15],
        'icon-rotation-alignment': 'viewport',
        'icon-offset': [offset, 0],
        'icon-padding': 1,
        'icon-allow-overlap': false,
      },
    });
    m.addLayer(markLayer('trails-mark1', 'mark1', 0));
    m.addLayer(markLayer('trails-mark2', 'mark2', 24));
    m.addLayer({
      id: 'imported-line',
      type: 'line',
      source: 'imported',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#c38bff', 'line-width': width(3), 'line-dasharray': [1.5, 1] },
    });
    // Already-travelled part of a route: muted grey.
    m.addLayer({
      id: 'route-done',
      type: 'line',
      source: 'route-done',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#8a948e', 'line-width': width(3.6), 'line-opacity': 0.85 },
    });
    // The way to follow: soft glow, white casing, bold orange, direction chevrons.
    m.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff7a00', 'line-width': width(10), 'line-blur': 6, 'line-opacity': 0.35 },
    });
    m.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': width(5.2) },
    });
    m.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff7a00', 'line-width': width(3.6) },
    });
    m.addLayer({
      id: 'route-arrows',
      type: 'symbol',
      source: 'route',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 70,
        'text-field': '›',
        'text-font': FONTS.FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 16, 18, 26],
        'text-keep-upright': false,
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-offset': [0, -0.08],
      },
      paint: { 'text-color': '#ffffff' },
    });
    m.addLayer({
      id: 'track-line',
      type: 'line',
      source: 'track',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#3ea6ff', 'line-width': width(3) },
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
        this.emit('trail:click', { ...(hit.properties as TrailProps), lngLat });
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
    let failed = 0;
    try {
      ({ failed } = await this.trails.ensure([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], ac.signal));
    } catch (e) {
      if (ac.signal.aborted) return; // superseded by a newer view
      throw e;
    }
    if (ac.signal.aborted) return;
    this.emit('trails:loaded', { trails: this.trails.trails.length, pois: this.trails.pois.length, failedCells: failed });
  }

  // ---------------------------------------------------------------- public API

  setImageryMode(mode: ImageryMode | 'off') {
    this.imageryMode = mode;
    if (mode !== 'off') (this.map.getSource('imagery') as maplibregl.RasterTileSource).setTiles([imageryTileUrl(mode)]);
    this.applyImageryVisibility();
  }

  /** Imagery in Satellite/Hybrid (unless off); high-res photos only in true colour. */
  private applyImageryVisibility() {
    const mode = this.imageryMode;
    const sat = this.baseMode !== 'map' && mode !== 'off';
    this.map.setLayoutProperty('imagery', 'visibility', sat ? 'visible' : 'none');
    for (const p of HIRES) {
      const show = sat && mode === 'truecolor' && this.hires?.id === p.id;
      this.map.setLayoutProperty(hiresId(p.id), 'visibility', show ? 'visible' : 'none');
    }
  }

  /** Map type: the drawn map, satellite with labels, or satellite with roads and labels. */
  setBaseMode(mode: BaseMode) {
    this.baseMode = mode;
    if (mode !== 'map' && this.imageryMode === 'off') this.imageryMode = 'truecolor';
    this.applyLook();
  }

  getBaseMode(): BaseMode {
    return this.baseMode;
  }

  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.applyLook();
  }

  /** Re-applies basemap, imagery and trail colours for the current map type and theme. */
  private applyLook() {
    if (!this.map.getLayer('trails-line')) return;
    applyBasemap(this.map, this.theme, this.baseMode);
    this.applyImageryVisibility();
    const drawn = this.baseMode === 'map';
    const light = drawn && this.theme === 'light';
    const set = (id: string, k: string, v: unknown) => this.map.getLayer(id) && this.map.setPaintProperty(id, k as 'line-color', v as never);
    set('trails-casing', 'line-color', light ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)');
    set('trails-casing', 'line-opacity', drawn ? ['match', ['get', 'kind'], ['marked', 'detected', 'hidden'], 1, 0] : ['case', ['==', ['get', 'sidewalk'], 1], 0, 1]);
    set('trails-sidewalk', 'line-color', light ? '#b9b2a6' : '#6d6a64');
    set('trails-path', 'line-color', light ? '#9a6a3c' : drawn ? '#d8b98c' : '#f3e6c4');
    set('trails-track', 'line-color', light ? '#a37b4f' : drawn ? '#c9a274' : '#d9a55b');
    // The drawn map already shows rural roads; our copies would double them.
    set('trails-line', 'line-opacity', ['match', ['get', 'kind'], 'road', drawn ? 0 : 0.55, 1]);
    set('trails-label', 'text-color', light ? '#5a3d22' : '#ffffff');
    set('trails-label', 'text-halo-color', light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)');
    set('pois-label', 'text-color', light ? '#2b2620' : '#ffffff');
    set('pois-label', 'text-halo-color', light ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.8)');
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
    this.map.setFilter('trails-line', ['all', f, ['in', ['get', 'kind'], ['literal', ['marked', 'road']]]]);
    this.map.setFilter('trails-path', ['all', f, ['==', ['get', 'kind'], 'path'], ['!=', ['get', 'sidewalk'], 1]]);
    this.map.setFilter('trails-sidewalk', ['all', f, ['==', ['get', 'sidewalk'], 1]]);
    this.map.setFilter('trails-track', ['all', f, ['==', ['get', 'kind'], 'track']]);
    this.map.setFilter('trails-marked-band', ['all', f, ['==', ['get', 'kind'], 'marked']]);
    this.map.setFilter('trails-hidden', ['all', f, ['==', ['get', 'kind'], 'hidden']]);
    this.map.setFilter('trails-detected', ['all', f, ['==', ['get', 'kind'], 'detected']]);
    this.map.setFilter('trails-detected-glow', ['all', f, ['==', ['get', 'kind'], 'detected']]);
  }

  async planRoute(from: [number, number], to: [number, number], prefs: Partial<RoutePreferences> = DEFAULT_PREFS): Promise<Route | null> {
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
    const route = findRoute(this.graph, from, to, prefs, this.routeModel);
    this.showRoute(route);
    return route;
  }

  showRoute(route: Pick<Route, 'coords'> | null) {
    const line = (c: Array<[number, number]>): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [],
    });
    (this.map.getSource('route') as GeoJSONSource).setData(route ? line(route.coords) : EMPTY);
    (this.map.getSource('route-done') as GeoJSONSource).setData(EMPTY);
  }

  /** While navigating: grey out the travelled part, keep the remaining way highlighted. */
  setRouteProgress(coords: Array<[number, number]>, segIndex: number, snapped: [number, number]) {
    const line = (c: Array<[number, number]>): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [],
    });
    (this.map.getSource('route-done') as GeoJSONSource).setData(line([...coords.slice(0, segIndex + 1), snapped]));
    (this.map.getSource('route') as GeoJSONSource).setData(line([snapped, ...coords.slice(segIndex + 1)]));
  }

  /**
   * Finds trails nobody mapped around the centre of the view, from two
   * independent sources: public GPS traces (where people go) and TrailNet on
   * the latest clear Sentinel-2 scene (what the ground shows). Agreeing
   * detections are fused. Results are cached on the device for 30 days.
   */
  async discoverHiddenTrails(signal?: AbortSignal, onStep?: (step: 'map' | 'gps' | 'imagery', status: 'start' | 'done' | 'failed') => void): Promise<DiscoveryResult> {
    if (this.map.getZoom() < 12) throw new Error('Zoom in closer to scan for hidden trails');
    const b = this.map.getBounds();
    const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const box = Discovery.scanBox(view);
    // OSM must be loaded first so only *unmapped* corridors come back.
    onStep?.('map', 'start');
    await this.trails.ensure(box, signal);
    onStep?.('map', 'done');
    const track = <T,>(step: 'gps' | 'imagery', p: Promise<T>) => {
      onStep?.(step, 'start');
      return p.then(
        (v) => (onStep?.(step, 'done'), v),
        (e) => {
          onStep?.(step, 'failed');
          throw e;
        },
      );
    };
    const [gps, img] = await Promise.allSettled([
      track('gps', this.discovery.scanGps(view, this.trails.osmWays(), signal)),
      track('imagery', this.discovery.scanImagery(view, this.trails.osmWays())),
    ]);
    const key = box.join(',');
    if (gps.status === 'fulfilled') this.detected.gps.set(key, gps.value.trails);
    if (img.status === 'fulfilled') {
      this.detected.imagery.set(key, img.value.trails);
      this.trails.setAligned(img.value.aligned);
    }
    const merged = mergeDetections([...this.detected.gps.values()].flat(), [...this.detected.imagery.values()].flat());
    this.trails.setDetected('discovery', merged);
    const here = mergeDetections(
      gps.status === 'fulfilled' ? gps.value.trails : [],
      img.status === 'fulfilled' ? img.value.trails : [],
    );
    return {
      found: here.length,
      meters: Discovery.totalLength(here),
      aligned: img.status === 'fulfilled' ? img.value.aligned.length : 0,
      gps: gps.status === 'fulfilled' ? gps.value.trails.length : (gps.reason as Error).message,
      imagery: img.status === 'fulfilled' ? img.value.trails.length : (img.reason as Error).message,
    };
  }

  /** Shows a recorded track or imported GPX line (null clears it). */
  setLine(which: 'track' | 'imported', coords: Array<[number, number]> | Array<Array<[number, number]>> | null) {
    const lines = !coords || !coords.length ? [] : Array.isArray(coords[0][0]) ? (coords as Array<Array<[number, number]>>) : [coords as Array<[number, number]>];
    (this.map.getSource(which) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: lines.filter((l) => l.length > 1).map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })),
    });
  }

  private lookAheadAbort: AbortController | null = null;

  /**
   * While the map sits idle, quietly render the next zoom level of the view
   * into the on-device cache so zooming in shows imagery instantly. Stops as
   * soon as the user moves; never competes with visible tiles.
   */
  private lookAhead() {
    const z = Math.floor(this.map.getZoom());
    if (this.imageryMode !== 'truecolor' || z < 8 || z >= IMAGERY.maxZoom || !navigator.onLine) return;
    this.lookAheadAbort?.abort();
    const ac = (this.lookAheadAbort = new AbortController());
    const b = this.map.getBounds();
    const tiles = tilesInBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z + 1);
    // Centre first: that is where the user most likely zooms.
    const c = this.map.getCenter();
    const cx = lngToTileX(c.lng, z + 1), cy = latToTileY(c.lat, z + 1);
    tiles.sort((a, b2) => Math.hypot(a[1] + 0.5 - cx, a[2] + 0.5 - cy) - Math.hypot(b2[1] + 0.5 - cx, b2[2] + 0.5 - cy));
    void (async () => {
      for (const [tz, tx, ty] of tiles.slice(0, 24)) {
        if (ac.signal.aborted) return;
        // Yield to visible work: wait while the workers are busy.
        while (this.imagery.busy > 0 && !ac.signal.aborted) await new Promise((r) => setTimeout(r, 250));
        await this.imagery.prefetch(tz, tx, ty, 'truecolor', ac.signal).catch(() => {});
      }
    })();
  }

  private alignTimer: ReturnType<typeof setTimeout> | undefined;
  private alignDone = new Set<string>();
  private aligning = false;
  /** Automatic AI alignment when zoomed in (zoom ≥ AUTO_ALIGN_ZOOM). */
  autoAlign = true;
  /** Automatic hidden-trail scanning (on view settle + every AUTO_SCAN_MS). */
  autoScan = true;
  private autoScanTimer: ReturnType<typeof setInterval> | undefined;
  /** Where to scan when not the view centre (e.g. the user's position while navigating). */
  scanFocus: [number, number] | null = null;

  private scheduleAutoAlign() {
    clearTimeout(this.alignTimer);
    if (this.aligning || this.map.getZoom() < AUTO_SCAN_ZOOM) return;
    if (!this.autoScan && !(this.autoAlign && this.map.getZoom() >= AUTO_ALIGN_ZOOM)) return;
    // Wait until the user settles on an area.
    this.alignTimer = setTimeout(() => void this.alignView(), 1500);
  }

  /** Re-checks every minute so moving (or navigating) keeps finding trails. */
  startAutoScan() {
    clearInterval(this.autoScanTimer);
    this.autoScanTimer = setInterval(() => {
      if (!this.autoScan || document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (this.map.getZoom() < AUTO_SCAN_ZOOM && !this.scanFocus) return;
      void this.alignView();
    }, AUTO_SCAN_MS);
  }

  /**
   * Runs TrailNet on the area in view: corrects mapped trail geometry to match
   * the imagery and adds any unmapped trails it finds. Once per area (cached).
   */
  async alignView() {
    const b = this.map.getBounds();
    const f = this.scanFocus;
    const span = 0.03;
    const view: BBox = f ? [f[0] - span, f[1] - span, f[0] + span, f[1] + span] : [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const box = Discovery.scanBox(view);
    const key = box.join(',');
    // Scanning reads Sentinel-2 and GPS traces over the network: nothing to do without signal.
    if (this.aligning || this.alignDone.has(key) || !navigator.onLine) return;
    this.aligning = true;
    this.emit('align:start', {});
    try {
      await this.trails.ensure(box);
      const ways = () => this.trails.osmWays();
      // Imagery (alignment + TrailNet) always; GPS traces too when auto-scan is on.
      const [img, gps] = await Promise.allSettled([
        this.discovery.scanImagery(view, ways()),
        this.autoScan ? this.discovery.scanGps(view, ways()) : Promise.reject(new Error('off')),
      ]);
      if (img.status === 'rejected' && gps.status === 'rejected') throw img.reason;
      this.alignDone.add(key);
      if (img.status === 'fulfilled') {
        if (this.autoAlign) this.trails.setAligned(img.value.aligned);
        this.detected.imagery.set(key, img.value.trails);
      }
      if (gps.status === 'fulfilled') this.detected.gps.set(key, gps.value.trails);
      const here = mergeDetections(gps.status === 'fulfilled' ? gps.value.trails : [], img.status === 'fulfilled' ? img.value.trails : []);
      this.trails.setDetected('discovery', mergeDetections([...this.detected.gps.values()].flat(), [...this.detected.imagery.values()].flat()));
      this.emit('align:done', { aligned: img.status === 'fulfilled' && this.autoAlign ? img.value.aligned.length : 0, detected: here.length });
    } catch {
      // Offline or no clear scene: keep OSM geometry; try again next time the view settles.
    } finally {
      this.aligning = false;
    }
  }

  /** Plans everything needed to use the current view offline. */
  async planOffline(): Promise<OfflinePlan> {
    const b = this.map.getBounds();
    const { maxZoom } = await this.imagery.staticMosaic();
    return planOfflineArea([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], this.hires, maxZoom);
  }

  /** Plans one of the ready-made packs (country, mountains, cities). */
  async planPack(id: string): Promise<OfflinePlan> {
    const pack = PACKS.find((p) => p.id === id);
    if (!pack) throw new Error(`Unknown pack ${id}`);
    const { maxZoom } = await this.imagery.staticMosaic();
    return planPack(pack, maxZoom, this.hires);
  }

  async downloadOffline(plan: OfflinePlan, progress: Progress, signal?: AbortSignal) {
    const st = await this.imagery.staticMosaic();
    return downloadPack(plan, { imagery: this.imagery, hires: this.hires, staticMaxZoom: st.maxZoom, staticExt: st.ext }, progress, signal);
  }

  flyTo(lngLat: [number, number], zoom = 14) {
    this.map.flyTo({ center: lngLat, zoom, essential: true });
  }

  /** Imagery is limited to the Sentinel source range; exposed for UI hints. */
  static readonly imageryZoomRange = [IMAGERY.minZoom, IMAGERY.maxZoom] as const;

  destroy() {
    this.trailAbort?.abort();
    this.map.remove();
    this.imagery.unregister();
  }
}
