import { describe, expect, it } from 'vitest';
import { TrailGraph } from '../src/engine/routing/graph';
import { edgeTime, findRoute, toblerSpeed } from '../src/engine/routing/router';
import { classifyWay } from '../src/engine/trails/classify';
import type { ElevationProvider } from '../src/engine/terrain/elevation';
import type { OsmWay, Trail } from '../src/engine/trails/types';

/** Builds a Trail from explicit OSM node ids + coords. */
function trail(id: number, nodes: Array<[number, number, number]>, tags: Record<string, string>, marked = false): Trail {
  const w: OsmWay = {
    type: 'way',
    id,
    nodes: nodes.map((n) => n[0]),
    geometry: nodes.map(([, lon, lat]) => ({ lon, lat })),
    tags,
  };
  return classifyWay(w, marked ? [{ id: 1000 + id, name: `Route ${id}` }] : []);
}

const flat: ElevationProvider = { prepare: async () => {}, get: () => 1000 };

const A: [number, number] = [25.0, 45.0];
const B: [number, number] = [25.01, 45.0];

// Marked trail straight A→B (~786 m) and a slightly longer hidden detour south.
const marked = trail(10, [[1, ...A], [3, 25.005, 45.0], [2, ...B]], { highway: 'path', name: 'Bandă roșie' }, true);
const hidden = trail(11, [[1, ...A], [4, 25.0, 44.9995], [5, 25.01, 44.9995], [2, ...B]], { highway: 'path', trail_visibility: 'bad' });

describe('Tobler time model', () => {
  it('is fastest on a gentle descent and slows on steep ground', () => {
    expect(toblerSpeed(-0.05) * 3.6).toBeCloseTo(6, 5);
    expect(toblerSpeed(0) * 3.6).toBeCloseTo(5.04, 2);
    expect(toblerSpeed(0.3)).toBeLessThan(toblerSpeed(0) / 2);
  });

  it('charges more uphill than downhill on the same edge', () => {
    expect(edgeTime(500, 1000, 1150, marked)).toBeGreaterThan(edgeTime(500, 1150, 1000, marked));
  });
});

describe('findRoute', () => {
  it('connects through shared OSM nodes', () => {
    const g = new TrailGraph([marked, hidden]);
    expect(g.size).toBe(5);
    g.attachElevation(flat);
    const r = findRoute(g, A, B)!;
    expect(r).not.toBeNull();
    expect(r.wayIds).toEqual([10]);
    expect(r.distance).toBeGreaterThan(780);
    expect(r.distance).toBeLessThan(790);
    expect(r.hiddenShare).toBe(0);
  });

  it('seeks hidden trails when asked', () => {
    const g = new TrailGraph([marked, hidden]);
    g.attachElevation(flat);
    const r = findRoute(g, A, B, { hidden: 1, maxDifficulty: 6 })!;
    expect(r.wayIds).toEqual([11]);
    expect(r.hiddenShare).toBeGreaterThan(0.9);
  });

  it('avoids a steep climb when a flat detour exists', () => {
    // Marked trail goes over a 250 m bump; hidden detour stays flat.
    const bumpy: ElevationProvider = { prepare: async () => {}, get: (lng, lat) => (lng === 25.005 && lat === 45.0 ? 1250 : 1000) };
    const g = new TrailGraph([marked, hidden]);
    g.attachElevation(bumpy);
    const r = findRoute(g, A, B)!;
    expect(r.wayIds).toEqual([11]);
    expect(r.ascent).toBe(0);
  });

  it('respects max difficulty', () => {
    const alpine = trail(12, [[1, ...A], [2, ...B]], { highway: 'path', sac_scale: 'difficult_alpine_hiking', name: 'x' });
    const g = new TrailGraph([alpine]);
    g.attachElevation(flat);
    expect(findRoute(g, A, B, { hidden: 0, maxDifficulty: 4 })).toBeNull();
    expect(findRoute(g, A, B, { hidden: 0, maxDifficulty: 6 })).not.toBeNull();
  });

  it('returns null when a point is far from any trail', () => {
    const g = new TrailGraph([marked]);
    expect(findRoute(g, [26, 46], B)).toBeNull();
  });

  it('reports ascent/descent and duration', () => {
    const climb: ElevationProvider = { prepare: async () => {}, get: (lng) => 1000 + (lng - 25) * 10000 };
    const g = new TrailGraph([marked]);
    g.attachElevation(climb);
    const r = findRoute(g, A, B)!;
    expect(r.ascent).toBeCloseTo(100, 0);
    expect(r.descent).toBe(0);
    const back = findRoute(g, B, A)!;
    expect(back.descent).toBeCloseTo(100, 0);
    expect(r.duration).toBeGreaterThan(back.duration);
  });
});

describe('bike: keep off car roads', () => {
  // Street with cars straight A→B (~786 m) vs a sidewalk detour (~900 m).
  const street = trail(20, [[1, ...A], [6, 25.005, 45.0], [2, ...B]], { highway: 'residential', name: 'Strada Lungă' });
  const sidewalk = trail(21, [[1, ...A], [7, 25.0, 45.0006], [8, 25.01, 45.0006], [2, ...B]], { highway: 'footway', footway: 'sidewalk' });
  const g = new TrailGraph([street, sidewalk]);
  g.attachElevation(flat);
  const prefs = { mode: 'bike' as const, hidden: 0, offroad: 0, maxDifficulty: 4, maxMtbScale: 3, strictAccess: false };

  it('takes the sidewalk when avoiding car roads (default)', () => {
    expect(findRoute(g, A, B, { ...prefs, avoidCarRoads: true })!.wayIds).toEqual([21]);
  });
  it('takes the shorter street when the option is off', () => {
    expect(findRoute(g, A, B, { ...prefs, avoidCarRoads: false })!.wayIds).toEqual([20]);
  });
});
