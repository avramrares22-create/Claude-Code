export type Tags = Record<string, string>;

export interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: Array<{ lat: number; lon: number }>;
  tags: Tags;
}

export interface OsmRelation {
  type: 'relation';
  id: number;
  members: Array<{ type: string; ref: number; role: string }>;
  tags: Tags;
}

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Tags;
}

export type OsmElement = OsmWay | OsmRelation | OsmNode;

/**
 * - marked: part of a waymarked hiking/MTB route
 * - path: footpath / bridleway / singletrack
 * - track: forest or agricultural track (drum forestier, drum de câmp)
 * - road: minor rural road, used to reach trailheads
 * - hidden: faint, informal or unmapped-feeling path most apps drop
 * - detected: not in OSM at all; found from GPS traces or imagery
 */
export type TrailKind = 'marked' | 'path' | 'track' | 'road' | 'hidden' | 'detected';

/** Modes routed on our own trail graph. */
export type TrailMode = 'foot' | 'bike' | 'moto';
/** Car is routed on the public road network (OSRM), not the trail graph. */
export type TravelMode = TrailMode | 'car';

/** Legal access for a mode: explicit yes, explicit no, or unknown (no tag, default rules). */
export type Access = 'yes' | 'no' | 'unknown';

export type SurfaceClass = 'paved' | 'gravel' | 'dirt' | 'grass' | 'rock' | 'unknown';

/** Romanian trail markings: colour + shape (bandă, cruce, punct, triunghi). */
export interface Marking {
  color: string;
  shape: 'stripe' | 'cross' | 'dot' | 'triangle' | 'other';
}

export interface TrailRoute {
  id: number;
  name?: string;
  marking?: Marking;
}

export interface Trail {
  wayId: number;
  nodeIds: number[];
  coords: Array<[number, number]>;
  name?: string;
  kind: TrailKind;
  /** 0 = well known / mapped everywhere, 1 = obscure path almost no app shows. */
  hiddenScore: number;
  /** SAC scale 1 (hiking) .. 6 (difficult alpine); 0 = unknown. */
  difficulty: number;
  surface?: string;
  surfaceClass: SurfaceClass;
  /** tracktype grade1 (solid) .. grade5 (soft); 0 = unknown. */
  trackGrade: number;
  /** mtb:scale 0..6; -1 = unknown. */
  mtbScale: number;
  access: Record<TrailMode, Access>;
  routes: TrailRoute[];
  /** Where the geometry came from. */
  source: 'osm' | 'gps' | 'imagery';
  /** 0..1 confidence for detected trails (1 for OSM). */
  confidence: number;
  tags: Tags;
}

export type PoiKind =
  | 'peak'
  | 'saddle'
  | 'waterfall'
  | 'spring'
  | 'cave'
  | 'viewpoint'
  | 'hut'
  | 'shelter'
  | 'camp';

export interface Poi {
  id: number;
  kind: PoiKind;
  name?: string;
  ele?: number;
  lng: number;
  lat: number;
  tags: Tags;
}
