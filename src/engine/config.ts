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
  scenesPerGrid: 3,
} as const;

export const IMAGERY = {
  tileSize: 256,
  minZoom: 6,
  /** Sentinel-2 is 10 m/px; z14 is ~6.6 m/px at Romania's latitude, beyond that MapLibre overzooms. */
  maxZoom: 14,
  /** Bump to invalidate every cached rendered tile after a renderer change. */
  rendererVersion: 1,
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
