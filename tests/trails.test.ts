import { describe, expect, it } from 'vitest';
import { classifyPoi, classifyWay, hiddenScore, HIDDEN_THRESHOLD, parseOsmcSymbol } from '../src/engine/trails/classify';
import { trailQuery } from '../src/engine/trails/overpass';
import { TrailStore } from '../src/engine/trails/trailStore';
import type { OsmElement, OsmWay } from '../src/engine/trails/types';

const way = (id: number, tags: Record<string, string>, coords: Array<[number, number]> = [[25, 45], [25.01, 45]]): OsmWay => ({
  type: 'way',
  id,
  nodes: coords.map((_, i) => id * 100 + i),
  geometry: coords.map(([lon, lat]) => ({ lon, lat })),
  tags,
});

describe('osmc:symbol (Romanian markings)', () => {
  it('parses bandă roșie / cruce albastră / punct galben / triunghi', () => {
    expect(parseOsmcSymbol('red:white:red_stripe')).toEqual({ color: '#d7263d', shape: 'stripe' });
    expect(parseOsmcSymbol('blue:white:blue_cross')).toEqual({ color: '#1f6fd1', shape: 'cross' });
    expect(parseOsmcSymbol('yellow:white:yellow_dot')).toEqual({ color: '#f2c418', shape: 'dot' });
    expect(parseOsmcSymbol('red:white:red_triangle')).toEqual({ color: '#d7263d', shape: 'triangle' });
  });

  it('falls back to colour tag and ignores garbage', () => {
    expect(parseOsmcSymbol(undefined, 'blue')?.color).toBe('#1f6fd1');
    expect(parseOsmcSymbol('nonsense')).toBeUndefined();
  });
});

describe('hidden trail scoring', () => {
  it('marked routes are never hidden', () => {
    expect(hiddenScore({ highway: 'path', trail_visibility: 'horrible' }, true)).toBe(0);
  });

  it('faint, unnamed, informal paths are hidden', () => {
    const s = hiddenScore({ highway: 'path', trail_visibility: 'bad', informal: 'yes' }, false);
    expect(s).toBeGreaterThanOrEqual(HIDDEN_THRESHOLD);
  });

  it('good forest roads are not hidden', () => {
    expect(hiddenScore({ highway: 'track', tracktype: 'grade1', name: 'Drum forestier' }, false)).toBeLessThan(HIDDEN_THRESHOLD);
  });

  it('classifies kinds and SAC difficulty', () => {
    const marked = classifyWay(way(1, { highway: 'path', sac_scale: 'mountain_hiking' }), [{ id: 9, name: 'Creasta' }]);
    expect(marked.kind).toBe('marked');
    expect(marked.difficulty).toBe(2);
    expect(classifyWay(way(2, { highway: 'path', trail_visibility: 'bad' }), []).kind).toBe('hidden');
    expect(classifyWay(way(3, { highway: 'track', tracktype: 'grade2', name: 'x' }), []).kind).toBe('track');
  });

  it('classifies nature POIs', () => {
    const p = classifyPoi({ type: 'node', id: 5, lat: 45.4, lon: 25.5, tags: { natural: 'peak', name: 'Omu', ele: '2505' } });
    expect(p).toMatchObject({ kind: 'peak', name: 'Omu', ele: 2505 });
    expect(classifyPoi({ type: 'node', id: 6, lat: 0, lon: 0, tags: { shop: 'bakery' } })).toBeNull();
  });
});

describe('Overpass query', () => {
  it('uses south,west,north,east order', () => {
    expect(trailQuery([25.4, 45.38, 25.52, 45.48])).toContain('(45.38,25.4,45.48,25.52)');
  });
});

describe('TrailStore', () => {
  it('merges ways with route relations and emits GeoJSON', async () => {
    const elements: OsmElement[] = [
      way(1, { highway: 'path', name: 'Valea Albă' }),
      way(2, { highway: 'path', trail_visibility: 'horrible' }, [[25.01, 45], [25.02, 45.01]]),
      { type: 'relation', id: 50, members: [{ type: 'way', ref: 1, role: '' }], tags: { route: 'hiking', name: 'Bandă roșie', 'osmc:symbol': 'red:white:red_stripe' } },
      { type: 'node', id: 7, lat: 45.0, lon: 25.0, tags: { waterway: 'waterfall', name: 'Urlătoarea' } },
    ];
    let calls = 0;
    const store = new TrailStore(async () => {
      calls++;
      return elements;
    }, false);
    let changes = 0;
    store.onChange(() => changes++);
    await store.ensure([25.0, 45.0, 25.01, 45.01]);
    expect(calls).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(0);

    const fc = store.trailsGeoJSON();
    const byId = new Map(fc.features.map((f) => [f.properties!.wayId, f.properties!]));
    expect(byId.get(1)).toMatchObject({ kind: 'marked', color: '#d7263d', shape: 'stripe', routes: 'Bandă roșie' });
    expect(byId.get(2)).toMatchObject({ kind: 'hidden' });
    expect(store.poisGeoJSON().features[0].properties).toMatchObject({ kind: 'waterfall', label: 'Urlătoarea' });

    // Same cells again: no refetch.
    const before = calls;
    await store.ensure([25.0, 45.0, 25.01, 45.01]);
    expect(calls).toBe(before);
  });

  it('retries a cell that failed', async () => {
    let fail = true;
    const store = new TrailStore(async () => {
      if (fail) throw new Error('overpass down');
      return [way(1, { highway: 'path' })];
    }, false);
    const r1 = await store.ensure([25.0, 45.0, 25.001, 45.001]);
    expect(r1.failed).toBeGreaterThan(0);
    fail = false;
    const r2 = await store.ensure([25.0, 45.0, 25.001, 45.001]);
    expect(r2.failed).toBe(0);
    expect(store.trails).toHaveLength(1);
  });
});
