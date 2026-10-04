/** Turns raw OSM tags into nature-app semantics: marked / path / track / hidden. */
import type {
  Access,
  Marking,
  OsmNode,
  OsmRelation,
  OsmWay,
  Poi,
  PoiKind,
  SurfaceClass,
  Tags,
  Trail,
  TrailKind,
  TrailRoute,
  TravelMode,
} from './types';

const SAC: Record<string, number> = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
};

/** Paint colours of Romanian trail markings. */
export const MARK_COLORS: Record<string, string> = {
  red: '#d7263d',
  blue: '#1f6fd1',
  yellow: '#f2c418',
  green: '#2e9e44',
  white: '#f5f5f5',
  black: '#222222',
  orange: '#f28c18',
  purple: '#8e44ad',
  brown: '#8b5a2b',
};

/**
 * Parses `osmc:symbol` (waycolor:background[:foreground][:text...]), e.g.
 * "red:white:red_stripe" (bandă roșie) or "blue:white:blue_cross" (cruce albastră).
 */
export function parseOsmcSymbol(sym: string | undefined, colour?: string): Marking | undefined {
  const parts = sym?.split(':') ?? [];
  const fg = parts[2] ?? '';
  const colorName = (fg.split('_')[0] || parts[0] || colour || '').toLowerCase();
  const color = MARK_COLORS[colorName] ?? (colour?.startsWith('#') ? colour : undefined);
  if (!color) return undefined;
  const shape = /stripe|bar/.test(fg)
    ? 'stripe'
    : /cross/.test(fg)
      ? 'cross'
      : /dot|circle/.test(fg)
        ? 'dot'
        : /triangle/.test(fg)
          ? 'triangle'
          : parts.length < 3
            ? 'stripe'
            : 'other';
  return { color, shape };
}

export function routeFromRelation(r: OsmRelation): TrailRoute {
  return {
    id: r.id,
    name: r.tags.name ?? r.tags.ref,
    marking: parseOsmcSymbol(r.tags['osmc:symbol'], r.tags.colour),
  };
}

/**
 * How "hidden" a way is: unmarked, faint on the ground, informal, unnamed,
 * demanding. These are exactly the paths mainstream maps drop.
 */
export function hiddenScore(tags: Tags, inRoute: boolean): number {
  if (inRoute) return 0;
  let s = 0.3;
  const vis = tags.trail_visibility;
  if (vis === 'intermediate') s += 0.15;
  else if (vis === 'bad') s += 0.3;
  else if (vis === 'horrible' || vis === 'no') s += 0.4;
  if (tags.informal === 'yes') s += 0.2;
  if (!tags.name) s += 0.1;
  if (tags.highway === 'path') s += 0.1;
  if ((SAC[tags.sac_scale] ?? 0) >= 3) s += 0.1;
  if (tags.highway === 'track' && (tags.tracktype === 'grade1' || tags.tracktype === 'grade2')) s -= 0.2;
  return Math.max(0, Math.min(1, s));
}

export const HIDDEN_THRESHOLD = 0.6;

export const ROAD_HIGHWAYS = new Set(['tertiary', 'unclassified', 'residential', 'service']);
const PATH_HIGHWAYS = new Set(['path', 'footway', 'bridleway', 'cycleway', 'steps', 'via_ferrata']);

const ACCESS_KEYS: Record<TravelMode, string[]> = {
  foot: ['access', 'foot'],
  bike: ['access', 'vehicle', 'bicycle'],
  moto: ['access', 'vehicle', 'motor_vehicle', 'motorcycle'],
};

function accessValue(v: string | undefined): Access | null {
  if (!v) return null;
  if (/^(yes|designated|permissive|destination|customers)$/.test(v)) return 'yes';
  if (/^(no|private|forestry|agricultural|delivery|military|discouraged)$/.test(v)) return 'no';
  return null;
}

/**
 * Legal access for a travel mode. The most specific tag wins
 * (motorcycle > motor_vehicle > vehicle > access); otherwise OSM defaults by
 * road type. Romanian forest roads are usually closed to the public's motor
 * vehicles (Codul Silvic) but rarely tagged, so untagged tracks stay 'unknown'.
 */
export function accessFor(tags: Tags, mode: TravelMode): Access {
  const keys = ACCESS_KEYS[mode];
  for (let i = keys.length - 1; i >= 0; i--) {
    const a = accessValue(tags[keys[i]]);
    if (a) return a;
  }
  const hw = tags.highway;
  if (mode === 'moto') {
    if (PATH_HIGHWAYS.has(hw)) return 'no';
    if (tags['4wd_only'] === 'yes') return 'unknown';
    return hw === 'track' ? 'unknown' : 'yes';
  }
  if (mode === 'bike') {
    if (hw === 'steps' || hw === 'via_ferrata') return 'no';
    return hw === 'cycleway' || ROAD_HIGHWAYS.has(hw) ? 'yes' : 'unknown';
  }
  return hw === 'cycleway' && tags.foot !== 'yes' ? 'unknown' : 'yes';
}

const SURFACES: Array<[RegExp, SurfaceClass]> = [
  [/^(asphalt|concrete.*|paved|paving_stones|sett|cobblestone|metal|wood)$/, 'paved'],
  [/^(gravel|fine_gravel|compacted|pebblestone|chipseal)$/, 'gravel'],
  [/^(dirt|earth|ground|mud|unpaved|sand|clay|soil)$/, 'dirt'],
  [/^(grass|grass_paver|meadow)$/, 'grass'],
  [/^(rock|stone|bare_rock|scree|stepping_stones)$/, 'rock'],
];
const GRADE_SURFACE: SurfaceClass[] = ['unknown', 'gravel', 'gravel', 'dirt', 'grass', 'grass'];

export function surfaceClass(tags: Tags): SurfaceClass {
  const s = tags.surface;
  if (s) for (const [re, c] of SURFACES) if (re.test(s)) return c;
  const grade = trackGrade(tags);
  if (grade) return GRADE_SURFACE[grade];
  if (ROAD_HIGHWAYS.has(tags.highway) && tags.highway !== 'service') return 'paved';
  return 'unknown';
}

export function trackGrade(tags: Tags): number {
  const m = /^grade([1-5])$/.exec(tags.tracktype ?? '');
  return m ? Number(m[1]) : 0;
}

export function classifyWay(way: OsmWay, routes: TrailRoute[]): Trail {
  const t = way.tags;
  const inRoute = routes.length > 0;
  const isRoad = ROAD_HIGHWAYS.has(t.highway);
  const hs = isRoad ? 0 : hiddenScore(t, inRoute);
  const kind: TrailKind = inRoute
    ? 'marked'
    : isRoad
      ? 'road'
      : hs >= HIDDEN_THRESHOLD
        ? 'hidden'
        : t.highway === 'track'
          ? 'track'
          : 'path';
  const mtb = Number.parseInt(t['mtb:scale'] ?? '', 10);
  return {
    wayId: way.id,
    nodeIds: way.nodes,
    coords: way.geometry.map((g) => [g.lon, g.lat]),
    name: t.name,
    kind,
    hiddenScore: hs,
    difficulty: SAC[t.sac_scale] ?? 0,
    surface: t.surface,
    surfaceClass: surfaceClass(t),
    trackGrade: trackGrade(t),
    mtbScale: Number.isFinite(mtb) ? Math.max(0, Math.min(6, mtb)) : -1,
    access: { foot: accessFor(t, 'foot'), bike: accessFor(t, 'bike'), moto: accessFor(t, 'moto') },
    routes,
    source: 'osm',
    confidence: 1,
    tags: t,
  };
}

export function classifyPoi(n: OsmNode): Poi | null {
  const t = n.tags;
  let kind: PoiKind | null = null;
  if (t.natural === 'peak') kind = 'peak';
  else if (t.natural === 'saddle') kind = 'saddle';
  else if (t.waterway === 'waterfall') kind = 'waterfall';
  else if (t.natural === 'spring') kind = 'spring';
  else if (t.natural === 'cave_entrance') kind = 'cave';
  else if (t.tourism === 'viewpoint') kind = 'viewpoint';
  else if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') kind = 'hut';
  else if (t.amenity === 'shelter') kind = 'shelter';
  else if (t.tourism === 'camp_site') kind = 'camp';
  if (!kind) return null;
  const ele = t.ele ? Number.parseFloat(t.ele.replace(',', '.')) : undefined;
  return { id: n.id, kind, name: t.name, ele: Number.isFinite(ele) ? ele : undefined, lng: n.lon, lat: n.lat, tags: t };
}
