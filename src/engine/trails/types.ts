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

export type TrailKind = 'marked' | 'path' | 'track' | 'hidden';

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
  routes: TrailRoute[];
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
