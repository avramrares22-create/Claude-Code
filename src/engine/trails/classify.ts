/** Turns raw OSM tags into nature-app semantics: marked / path / track / hidden. */
import type { Marking, OsmNode, OsmRelation, OsmWay, Poi, PoiKind, Tags, Trail, TrailRoute } from './types';

const SAC: Record<string, number> = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
};

const COLORS: Record<string, string> = {
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
  const color = COLORS[colorName] ?? (colour?.startsWith('#') ? colour : undefined);
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

export function classifyWay(way: OsmWay, routes: TrailRoute[]): Trail {
  const t = way.tags;
  const inRoute = routes.length > 0;
  const hs = hiddenScore(t, inRoute);
  const kind = inRoute
    ? 'marked'
    : hs >= HIDDEN_THRESHOLD
      ? 'hidden'
      : t.highway === 'track'
        ? 'track'
        : 'path';
  return {
    wayId: way.id,
    nodeIds: way.nodes,
    coords: way.geometry.map((g) => [g.lon, g.lat]),
    name: t.name,
    kind,
    hiddenScore: hs,
    difficulty: SAC[t.sac_scale] ?? 0,
    surface: t.surface,
    routes,
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
