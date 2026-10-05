import { describe, expect, it } from 'vitest';
import { parseOsrm, type OsrmResponse } from '../src/engine/routing/roadRouter';
import { buildManeuvers } from '../src/engine/navigation';

const res: OsrmResponse = {
  code: 'Ok',
  routes: [
    {
      distance: 1234,
      duration: 900,
      legs: [
        {
          steps: [
            { name: 'Strada Lungă', geometry: { coordinates: [[25.0, 45.0], [25.001, 45.0], [25.002, 45.0]] } },
            { name: '', ref: 'DN1', geometry: { coordinates: [[25.002, 45.0], [25.002, 45.001], [25.002, 45.002]] } },
            { name: '', geometry: { coordinates: [[25.002, 45.002], [25.002, 45.002]] } },
          ],
        },
      ],
    },
  ],
};

describe('parseOsrm', () => {
  it('joins step geometries without duplicating the shared vertices', () => {
    const r = parseOsrm(res, 'foot')!;
    expect(r.coords).toEqual([[25.0, 45.0], [25.001, 45.0], [25.002, 45.0], [25.002, 45.001], [25.002, 45.002], [25.002, 45.002]]);
    expect(r.segments).toHaveLength(r.coords.length - 1);
    expect(r.elevations).toHaveLength(r.coords.length);
    expect(r.segments[0].name).toBe('Strada Lungă');
    expect(r.segments[2].name).toBe('DN1');
    expect(r).toMatchObject({ mode: 'foot', model: 'osrm', distance: 1234, duration: 900 });
  });

  it('gives turn-by-turn a turn where the road changes', () => {
    const r = parseOsrm(res, 'foot')!;
    const m = buildManeuvers(r.coords, r.segments);
    expect(m.map((x) => x.type)).toContain('left');
  });

  it('returns null when OSRM finds nothing', () => {
    expect(parseOsrm({ code: 'NoRoute' }, 'bike')).toBeNull();
    expect(parseOsrm({ code: 'Ok', routes: [] }, 'bike')).toBeNull();
  });
});
