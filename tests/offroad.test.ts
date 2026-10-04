import { describe, expect, it } from 'vitest';
import { TrailGraph } from '../src/engine/routing/graph';
import { expertModel } from '../src/engine/routing/routeModel';
import { findRoute } from '../src/engine/routing/router';
import { accessFor, classifyWay, surfaceClass } from '../src/engine/trails/classify';
import type { ElevationProvider } from '../src/engine/terrain/elevation';
import type { OsmWay, Trail } from '../src/engine/trails/types';

function trail(id: number, nodes: Array<[number, number, number]>, tags: Record<string, string>): Trail {
  const w: OsmWay = { type: 'way', id, nodes: nodes.map((n) => n[0]), geometry: nodes.map(([, lon, lat]) => ({ lon, lat })), tags };
  return classifyWay(w, []);
}
const flat: ElevationProvider = { prepare: async () => {}, get: () => 500 };

describe('legal access', () => {
  it('most specific tag wins', () => {
    expect(accessFor({ highway: 'track', access: 'no', foot: 'yes' }, 'foot')).toBe('yes');
    expect(accessFor({ highway: 'track', access: 'no', foot: 'yes' }, 'moto')).toBe('no');
    expect(accessFor({ highway: 'track', motor_vehicle: 'forestry' }, 'moto')).toBe('no');
    expect(accessFor({ highway: 'track', motor_vehicle: 'no', motorcycle: 'yes' }, 'moto')).toBe('yes');
  });

  it('applies OSM defaults by way type', () => {
    expect(accessFor({ highway: 'path' }, 'moto')).toBe('no');
    expect(accessFor({ highway: 'track' }, 'moto')).toBe('unknown');
    expect(accessFor({ highway: 'unclassified' }, 'moto')).toBe('yes');
    expect(accessFor({ highway: 'steps' }, 'bike')).toBe('no');
    expect(accessFor({ highway: 'path' }, 'foot')).toBe('yes');
  });
});

describe('surfaces and kinds', () => {
  it('classifies surfaces, falling back to tracktype', () => {
    expect(surfaceClass({ surface: 'asphalt' })).toBe('paved');
    expect(surfaceClass({ surface: 'compacted' })).toBe('gravel');
    expect(surfaceClass({ highway: 'track', tracktype: 'grade4' })).toBe('grass');
    expect(surfaceClass({ highway: 'path' })).toBe('unknown');
  });

  it('marks rural roads as roads, never hidden', () => {
    const t = trail(1, [[1, 25, 45], [2, 25.01, 45]], { highway: 'unclassified' });
    expect(t.kind).toBe('road');
    expect(t.hiddenScore).toBe(0);
  });
});

describe('travel modes', () => {
  // A–B straight on asphalt (~786 m) vs a gravel forest track detour (~900 m).
  const asphalt = trail(10, [[1, 25, 45], [2, 25.01, 45]], { highway: 'unclassified', surface: 'asphalt' });
  const gravel = trail(11, [[1, 25, 45], [3, 25.005, 44.9995], [2, 25.01, 45]], { highway: 'track', tracktype: 'grade2' });
  const footpath = trail(12, [[1, 25, 45], [4, 25.005, 45.0003], [2, 25.01, 45]], { highway: 'path', sac_scale: 'hiking' });

  it('bike is faster than walking, moto faster than bike on the same track', () => {
    const v = (m: 'foot' | 'bike' | 'moto') => expertModel.speed(m, gravel, 0);
    expect(v('bike')).toBeGreaterThan(v('foot') * 2);
    expect(v('moto')).toBeGreaterThan(v('bike'));
  });

  it('cyclists slow down a lot uphill, but never below pushing pace', () => {
    expect(expertModel.speed('bike', gravel, 0.1)).toBeLessThan(expertModel.speed('bike', gravel, 0) / 2);
    expect(expertModel.speed('bike', gravel, 0.3)).toBeGreaterThan(0.5);
  });

  it('moto never uses footpaths', () => {
    const g = new TrailGraph([footpath]);
    g.attachElevation(flat);
    expect(findRoute(g, [25, 45], [25.01, 45], { mode: 'moto' })).toBeNull();
    expect(findRoute(g, [25, 45], [25.01, 45], { mode: 'foot' })).not.toBeNull();
  });

  it('strict access refuses untagged forest roads for moto', () => {
    const g = new TrailGraph([gravel]);
    g.attachElevation(flat);
    const lax = findRoute(g, [25, 45], [25.01, 45], { mode: 'moto' })!;
    expect(lax.unknownAccessShare).toBe(1);
    expect(findRoute(g, [25, 45], [25.01, 45], { mode: 'moto', strictAccess: true })).toBeNull();
  });

  it('off-road preference swaps asphalt for the gravel track', () => {
    const g = new TrailGraph([asphalt, gravel]);
    g.attachElevation(flat);
    const normal = findRoute(g, [25, 45], [25.01, 45], { mode: 'bike' })!;
    expect(normal.wayIds).toEqual([10]);
    const offroad = findRoute(g, [25, 45], [25.01, 45], { mode: 'bike', offroad: 1 })!;
    expect(offroad.wayIds).toEqual([11]);
    expect(offroad.offroadShare).toBe(1);
  });

  it('respects the MTB difficulty limit', () => {
    const gnarly = trail(13, [[1, 25, 45], [2, 25.01, 45]], { highway: 'path', 'mtb:scale': '4' });
    const g = new TrailGraph([gnarly]);
    g.attachElevation(flat);
    expect(findRoute(g, [25, 45], [25.01, 45], { mode: 'bike', maxMtbScale: 3 })).toBeNull();
    expect(findRoute(g, [25, 45], [25.01, 45], { mode: 'bike', maxMtbScale: 5 })).not.toBeNull();
  });
});
