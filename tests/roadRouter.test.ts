import { describe, expect, it } from 'vitest';
import { routeFromOsrm } from '../src/engine/routing/roadRouter';
import { buildManeuvers } from '../src/engine/navigation';

const res = {
  code: 'Ok',
  routes: [
    {
      distance: 1200,
      duration: 150,
      legs: [
        {
          steps: [
            { name: 'Strada Lungă', geometry: { coordinates: [[25.58, 45.64], [25.585, 45.64], [25.59, 45.64]] as Array<[number, number]> } },
            { name: 'Bulevardul Eroilor', geometry: { coordinates: [[25.59, 45.64], [25.59, 45.645], [25.59, 45.65]] as Array<[number, number]> } },
            { name: '', geometry: { coordinates: [[25.59, 45.65], [25.59, 45.65]] as Array<[number, number]> } },
          ],
        },
      ],
    },
  ],
};

describe('car routing (OSRM)', () => {
  it('builds one polyline with a street per segment', () => {
    const r = routeFromOsrm(res)!;
    expect(r.mode).toBe('car');
    expect(r.coords).toHaveLength(5); // shared step endpoints are not duplicated
    expect(r.segments).toHaveLength(4);
    expect(r.segments[0].name).toBe('Strada Lungă');
    expect(r.segments[3].name).toBe('Bulevardul Eroilor');
    expect(r.duration).toBe(150);
    expect(r.elevations.every((e) => Number.isNaN(e))).toBe(true); // no DEM → no fake profile
  });

  it('gives turn-by-turn onto named streets', () => {
    const r = routeFromOsrm(res)!;
    const m = buildManeuvers(r.coords, r.segments);
    expect(m.map((x) => x.type)).toEqual(['depart', 'left', 'arrive']);
    expect(m[1].text).toBe('Turn left onto Bulevardul Eroilor');
  });

  it('returns null when there is no road route', () => {
    expect(routeFromOsrm({ code: 'NoRoute', routes: [] })).toBeNull();
  });
});
