/** Static configuration for the engine. Everything is scoped to Romania. */

export type BBox = [west: number, south: number, east: number, north: number];

/** Romania with a small margin so border mountains (Apuseni, Maramureș) render fully. */
export const ROMANIA_BBOX: BBox = [20.2, 43.6, 29.8, 48.3];
export const ROMANIA_CENTER: [number, number] = [24.97, 45.94];

export const STAC = {
  endpoint: 'https://earth-search.aws.element84.com/v1',
  collection: 'sentinel-2-c1-l2a',
  /** How far back the mosaic looks for cloud-free scenes. */
  lookbackDays: 90,
  maxCloudCover: 15,
  /** Scenes kept per Sentinel-2 grid square; extras fill nodata/edge gaps. */
  scenesPerGrid: 4,
} as const;

export const IMAGERY = {
  tileSize: 256,
  minZoom: 6,
  /** Sentinel-2 is 10 m/px; z14 is ~6.6 m/px at Romania's latitude, beyond that MapLibre overzooms. */
  maxZoom: 14,
  /** Bump to invalidate every cached rendered tile after a renderer change. */
  rendererVersion: 2,
} as const;

/** Mapzen/AWS Terrarium DEM — public, CORS enabled, no key. */
export const TERRAIN = {
  tiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  encoding: 'terrarium' as const,
  maxZoom: 15,
  /** Zoom used when sampling elevation for routing (~30 m/px in Romania). */
  sampleZoom: 12,
};

/** OpenFreeMap vector tiles, used only for reference labels (towns, rivers, roads). */
export const REFERENCE = {
  tilejson: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
};

export const OVERPASS = {
  endpoints: [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
  timeoutMs: 30_000,
  /** Trails load in z11 cells (~20 km). */
  cellZoom: 11,
  minZoom: 11,
} as const;

/**
 * Sub-metre imagery for walking/riding zoom levels. Sentinel-2 (10 m) stays the
 * fresh base layer up to z14; from there the best reachable high-res source
 * takes over and MapLibre overzooms past its native maximum.
 */
export interface HiresProvider {
  id: 'ancpi' | 'esri';
  label: string;
  tiles: string;
  /** Native maximum zoom; higher zooms are upscaled. */
  maxZoom: number;
  attribution: string;
  /** A tile URL used to check the provider is reachable from this device. */
  probe: string;
}

export const HIRES: HiresProvider[] = [
  {
    // ANCPI national orthophoto (2016–2019 flights, ~0.5 m). Dynamic ArcGIS export
    // rendered straight into Web Mercator, so any zoom works.
    id: 'ancpi',
    label: 'ANCPI Ortofoto',
    tiles:
      'https://geoportal.ancpi.ro/maps/rest/services/Ortofoto/Ortofoto2019/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image',
    maxZoom: 19,
    attribution: 'Ortofotoplan © ANCPI',
    probe:
      'https://geoportal.ancpi.ro/maps/rest/services/Ortofoto/Ortofoto2019/MapServer/export?bbox=2834000,5688000,2834300,5688300&bboxSR=3857&imageSR=3857&size=64,64&format=jpg&f=image',
  },
  {
    id: 'esri',
    label: 'Esri World Imagery',
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    probe: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/5766/9278',
  },
];

/** Zoom where high-res imagery fades in over the Sentinel mosaic. */
export const HIRES_FROM_ZOOM = 13.5;
export const MAX_MAP_ZOOM = 21;
