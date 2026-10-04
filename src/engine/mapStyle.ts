/**
 * The drawn map ("Map" mode): a clean vector basemap from OpenFreeMap
 * (OpenMapTiles schema) in light and dark, plus road/label overlays for
 * "Hybrid" and labels for "Satellite". Inspired by the calm look of modern
 * phone maps: soft landcover, road hierarchy with outlines, 3D buildings,
 * gentle hillshade and clear labels. Our trails are drawn on top by the engine.
 *
 * Every layer id starts with "bm-". `basemapLayers` is the single source of
 * truth; `applyBasemap` re-applies paint and visibility when the map type or
 * theme changes (no style reload, so trails and routes stay put).
 */
import type { ExpressionSpecification, LayerSpecification, Map as MlMap } from 'maplibre-gl';

export type BaseMode = 'map' | 'satellite' | 'hybrid';
export type Theme = 'light' | 'dark';

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

interface Palette {
  land: string; wood: string; grass: string; farmland: string; scrub: string; rock: string; ice: string; sand: string; wetland: string;
  residential: string; industrial: string; park: string; cemetery: string; water: string; waterLine: string;
  building: string; buildingTop: string; road: string; roadCase: string; major: string; majorCase: string; motorway: string; motorwayCase: string;
  rail: string; text: string; halo: string; place: string; waterText: string; peakText: string; boundary: string;
  shadow: string; highlight: string; aeroway: string;
}

const LIGHT: Palette = {
  land: '#f3f0ea', wood: '#cde4bf', grass: '#dcedcb', farmland: '#efece2', scrub: '#d8e7c9', rock: '#e4e0da', ice: '#f7fafd', sand: '#f1e8d2',
  wetland: '#d2e6dd', residential: '#ece9e3', industrial: '#ebe6ee', park: '#cfe8bd', cemetery: '#d9e4d2', water: '#9ecdf3', waterLine: '#86bfec',
  building: '#e2ddd5', buildingTop: '#ebe7e0', road: '#ffffff', roadCase: '#d7d1c7', major: '#ffeaa8', majorCase: '#e5c56f',
  motorway: '#ffc35c', motorwayCase: '#df9c33', rail: '#b8b3aa', text: '#45413b', halo: 'rgba(255,255,255,0.92)', place: '#23211e',
  waterText: '#2a6aa5', peakText: '#6e4c2b', boundary: '#9b8fc0', shadow: 'rgba(66,52,36,0.42)', highlight: 'rgba(255,255,255,0.45)', aeroway: '#e6e2ea',
};

const DARK: Palette = {
  land: '#1c1f23', wood: '#1d2b22', grass: '#202c25', farmland: '#202326', scrub: '#1f2a23', rock: '#27292c', ice: '#2c3237', sand: '#2a2823',
  wetland: '#1d2b2b', residential: '#222428', industrial: '#25232b', park: '#1c2b20', cemetery: '#20281f', water: '#1b3450', waterLine: '#284a6e',
  building: '#2b2d32', buildingTop: '#33363c', road: '#3c3f45', roadCase: '#26282c', major: '#5b5546', majorCase: '#2d2b26',
  motorway: '#b98a40', motorwayCase: '#6f5326', rail: '#4a4c51', text: '#d9d5cd', halo: 'rgba(20,22,25,0.9)', place: '#f0eee9',
  waterText: '#93bde6', peakText: '#dcbf95', boundary: '#8f84b8', shadow: 'rgba(0,0,0,0.5)', highlight: 'rgba(255,255,255,0.07)', aeroway: '#29272e',
};

/** On imagery: white labels with a dark halo, roads semi-transparent. */
const SAT = { text: '#ffffff', halo: 'rgba(0,0,0,0.78)', place: '#ffffff', waterText: '#cfe8ff', peakText: '#ffe7c2' };

type Group = 'fill' | 'road' | 'label';
interface Spec {
  layer: LayerSpecification;
  group: Group;
}

const z = (stops: Array<[number, number]>, base = 1.5): ExpressionSpecification =>
  ['interpolate', ['exponential', base], ['zoom'], ...stops.flat()] as ExpressionSpecification;

const cls = (...c: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', c]];

export function basemapLayers(theme: Theme, mode: BaseMode): Spec[] {
  const P = theme === 'dark' ? DARK : LIGHT;
  const onImagery = mode !== 'map';
  const T = onImagery ? { ...P, ...SAT } : P;
  const src = { source: 'reference' as const };
  const out: Spec[] = [];
  const fill = (id: string, sourceLayer: string, filter: ExpressionSpecification | null, color: string | ExpressionSpecification, extra: Record<string, unknown> = {}) =>
    out.push({
      group: 'fill',
      layer: { id: `bm-${id}`, type: 'fill', ...src, 'source-layer': sourceLayer, ...(filter ? { filter } : {}), paint: { 'fill-color': color, 'fill-antialias': true, ...extra } } as LayerSpecification,
    });

  // ---- land & landcover
  fill('residential', 'landuse', cls('residential', 'suburb', 'neighbourhood', 'commercial', 'retail'), P.residential, { 'fill-opacity': z([[10, 0.5], [14, 1]]) });
  fill('industrial', 'landuse', cls('industrial', 'quarry', 'railway'), P.industrial);
  fill('farmland', 'landcover', cls('farmland'), P.farmland);
  fill('grass', 'landcover', cls('grass'), P.grass);
  fill('wood', 'landcover', cls('wood'), P.wood, { 'fill-opacity': z([[6, 0.6], [11, 1]]) });
  fill('scrub', 'landcover', ['all', cls('grass'), ['in', ['get', 'subclass'], ['literal', ['scrub', 'heath']]]] as ExpressionSpecification, P.scrub);
  fill('rock', 'landcover', cls('rock'), P.rock);
  fill('ice', 'landcover', cls('ice'), P.ice);
  fill('sand', 'landcover', cls('sand'), P.sand);
  fill('wetland', 'landcover', cls('wetland'), P.wetland);
  fill('park', 'park', null, P.park, { 'fill-opacity': 0.7 });
  fill('cemetery', 'landuse', cls('cemetery'), P.cemetery);
  fill('aeroway', 'aeroway', ['==', ['geometry-type'], 'Polygon'] as ExpressionSpecification, P.aeroway);
  fill('water', 'water', ['!=', ['get', 'brunnel'], 'tunnel'] as ExpressionSpecification, P.water);
  out.push({
    group: 'fill',
    layer: {
      id: 'bm-waterway', type: 'line', ...src, 'source-layer': 'waterway', filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': P.waterLine,
        'line-opacity': ['match', ['get', 'class'], 'river', 1, 0.6],
        // Zoom interpolation outermost; river vs stream inside each stop.
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, ['match', ['get', 'class'], 'river', 0.8, 0.2], 14, ['match', ['get', 'class'], 'river', 3, 0.6], 18, ['match', ['get', 'class'], 'river', 10, 2]],
      },
    },
  });
  // Buildings: flat footprints, rising into soft 3D when zoomed in.
  fill('building', 'building', null, P.building, { 'fill-opacity': z([[14, 0], [15, 1]], 1), 'fill-outline-color': P.buildingTop });
  out.push({
    group: 'fill',
    layer: {
      id: 'bm-building-3d', type: 'fill-extrusion', ...src, 'source-layer': 'building', minzoom: 15.5, filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': P.buildingTop,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
      },
    },
  });

  // ---- roads: casing then fill, minor to major so major roads sit on top
  const ROADS: Array<{ id: string; f: ExpressionSpecification; w: Array<[number, number]>; color: string; casing: string; minzoom?: number }> = [
    { id: 'service', f: cls('service'), w: [[14, 0.6], [16, 3], [19, 10]], color: P.road, casing: P.roadCase, minzoom: 14 },
    { id: 'minor', f: cls('minor'), w: [[12, 0.6], [15, 4], [19, 16]], color: P.road, casing: P.roadCase, minzoom: 11 },
    { id: 'tertiary', f: cls('tertiary'), w: [[10, 0.6], [14, 4], [19, 20]], color: P.road, casing: P.roadCase, minzoom: 9 },
    { id: 'secondary', f: cls('secondary'), w: [[8, 0.6], [14, 5], [19, 24]], color: P.major, casing: P.majorCase, minzoom: 8 },
    { id: 'primary', f: cls('primary'), w: [[7, 0.7], [14, 6], [19, 28]], color: P.major, casing: P.majorCase, minzoom: 6 },
    { id: 'trunk', f: cls('trunk'), w: [[6, 0.8], [14, 6.5], [19, 30]], color: P.motorway, casing: P.motorwayCase, minzoom: 5 },
    { id: 'motorway', f: cls('motorway'), w: [[5, 0.8], [14, 7], [19, 32]], color: P.motorway, casing: P.motorwayCase, minzoom: 5 },
  ];
  const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
  for (const r of ROADS) {
    out.push({
      group: 'road',
      layer: {
        id: `bm-road-${r.id}-case`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: r.minzoom ?? 0, filter: ['all', r.f, notTunnel],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': onImagery ? 'rgba(0,0,0,0.35)' : r.casing,
          'line-width': z(r.w.map(([a, b]) => [a, b * 1.35 + 1] as [number, number])),
          'line-opacity': onImagery ? 0.6 : 1,
        },
      },
    });
  }
  for (const r of ROADS) {
    out.push({
      group: 'road',
      layer: {
        id: `bm-road-${r.id}`, type: 'line', ...src, 'source-layer': 'transportation', minzoom: r.minzoom ?? 0, filter: ['all', r.f, notTunnel],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': r.color, 'line-width': z(r.w), 'line-opacity': onImagery ? (r.id === 'motorway' || r.id === 'trunk' || r.id === 'primary' ? 0.85 : 0.55) : 1 },
      },
    });
  }
  out.push({
    group: 'road',
    layer: {
      id: 'bm-rail', type: 'line', ...src, 'source-layer': 'transportation', minzoom: 9, filter: ['all', cls('rail'), notTunnel],
      paint: { 'line-color': P.rail, 'line-width': z([[9, 0.6], [15, 1.6], [19, 3]]), 'line-dasharray': [3, 2] },
    },
  });
  out.push({
    group: 'fill',
    layer: {
      id: 'bm-boundary', type: 'line', ...src, 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': P.boundary, 'line-width': z([[3, 1], [10, 2.2]]), 'line-dasharray': [4, 2], 'line-opacity': 0.8 },
    },
  });

  // ---- labels
  const label = (id: string, layer: Omit<LayerSpecification, 'id' | 'source'>) =>
    out.push({ group: 'label', layer: { id: `bm-label-${id}`, ...src, ...layer } as LayerSpecification });
  label('road', {
    type: 'symbol', 'source-layer': 'transportation_name', minzoom: 13,
    filter: cls('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'),
    layout: {
      'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT,
      'text-size': z([[13, 10], [17, 13]], 1.2), 'text-max-angle': 30, 'text-padding': 4,
    },
    paint: { 'text-color': T.text, 'text-halo-color': T.halo, 'text-halo-width': 1.6 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('water', {
    type: 'symbol', 'source-layer': 'water_name',
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT_ITALIC, 'text-size': z([[8, 11], [16, 14]], 1.2), 'text-max-width': 8 },
    paint: { 'text-color': T.waterText, 'text-halo-color': T.halo, 'text-halo-width': 1.2 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('waterway', {
    type: 'symbol', 'source-layer': 'waterway', minzoom: 13, filter: cls('river', 'stream'),
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_ITALIC, 'text-size': 11, 'symbol-spacing': 400 },
    paint: { 'text-color': T.waterText, 'text-halo-color': T.halo, 'text-halo-width': 1.1 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('peak', {
    type: 'symbol', 'source-layer': 'mountain_peak', minzoom: 9, maxzoom: 12, filter: ['has', 'name'],
    layout: {
      'text-field': ['format', ['get', 'name'], {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.82 }],
      'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.3],
    },
    paint: { 'text-color': T.peakText, 'text-halo-color': T.halo, 'text-halo-width': 1.3 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('place-small', {
    type: 'symbol', 'source-layer': 'place', minzoom: 11, filter: cls('suburb', 'neighbourhood', 'quarter', 'hamlet', 'isolated_dwelling', 'locality'),
    layout: {
      'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': z([[11, 10], [16, 13]], 1.2),
      'text-transform': ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter'], 'uppercase', 'none'], 'text-letter-spacing': ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter'], 0.08, 0],
    },
    paint: { 'text-color': T.text, 'text-halo-color': T.halo, 'text-halo-width': 1.4, 'text-opacity': 0.9 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('village', {
    type: 'symbol', 'source-layer': 'place', minzoom: 9, filter: cls('village'),
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': z([[9, 10.5], [15, 15]], 1.2), 'text-max-width': 8 },
    paint: { 'text-color': T.place, 'text-halo-color': T.halo, 'text-halo-width': 1.5 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('town', {
    type: 'symbol', 'source-layer': 'place', minzoom: 6, filter: cls('town'),
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': z([[6, 11], [14, 17]], 1.2), 'text-max-width': 8 },
    paint: { 'text-color': T.place, 'text-halo-color': T.halo, 'text-halo-width': 1.6 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  label('city', {
    type: 'symbol', 'source-layer': 'place', minzoom: 4, filter: cls('city'),
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': z([[4, 12], [12, 20]], 1.2), 'text-max-width': 8 },
    paint: { 'text-color': T.place, 'text-halo-color': T.halo, 'text-halo-width': 1.8 },
  } as Omit<LayerSpecification, 'id' | 'source'>);
  return out;
}

/** Layers to draw below the imagery/hillshade (fills) and above them (roads, labels). */
export function basemapForStyle(theme: Theme, mode: BaseMode): { below: LayerSpecification[]; above: LayerSpecification[] } {
  const specs = basemapLayers(theme, mode);
  const vis = (g: Group) => (g === 'label' || (g === 'road' && mode !== 'satellite') || (g === 'fill' && mode === 'map') ? 'visible' : 'none');
  const withVis = (s: Spec) => ({ ...s.layer, layout: { ...(s.layer as { layout?: object }).layout, visibility: vis(s.group) } }) as LayerSpecification;
  return { below: specs.filter((s) => s.group === 'fill').map(withVis), above: specs.filter((s) => s.group !== 'fill').map(withVis) };
}

/** Switches map type / theme in place. */
export function applyBasemap(map: MlMap, theme: Theme, mode: BaseMode) {
  for (const s of basemapLayers(theme, mode)) {
    if (!map.getLayer(s.layer.id)) continue;
    const show = s.group === 'label' || (s.group === 'road' && mode !== 'satellite') || (s.group === 'fill' && mode === 'map');
    map.setLayoutProperty(s.layer.id, 'visibility', show ? 'visible' : 'none');
    const paint = (s.layer as { paint?: Record<string, unknown> }).paint ?? {};
    for (const [k, v] of Object.entries(paint)) map.setPaintProperty(s.layer.id, k as Parameters<MlMap['setPaintProperty']>[1], v as never);
  }
  const P = theme === 'dark' ? DARK : LIGHT;
  map.setPaintProperty('background', 'background-color', mode === 'map' ? P.land : '#14231a');
  if (map.getLayer('hillshade')) {
    map.setPaintProperty('hillshade', 'hillshade-shadow-color', mode === 'map' ? P.shadow : 'rgba(10,20,30,0.55)');
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', mode === 'map' ? P.highlight : 'rgba(255,250,235,0.25)');
    map.setPaintProperty(
      'hillshade',
      'hillshade-exaggeration',
      mode === 'map' ? ['interpolate', ['linear'], ['zoom'], 6, 0.75, 12, 0.7, 16, 0.45] : ['interpolate', ['linear'], ['zoom'], 12, 0.3, 15, 0.12],
    );
  }
}

export const PALETTES = { light: LIGHT, dark: DARK };
