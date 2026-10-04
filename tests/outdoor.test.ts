import { describe, expect, it } from 'vitest';
import { buildGpx, parseGpxFile } from '../src/engine/gpx';
import { RouteFollower } from '../src/engine/navigation';

describe('GPX', () => {
  it('round-trips a recorded track', () => {
    const line = [
      { lng: 25.6, lat: 45.6, ele: 600, time: Date.parse('2026-10-04T10:00:00Z') },
      { lng: 25.601, lat: 45.601, ele: 612.5, time: Date.parse('2026-10-04T10:01:00Z') },
    ];
    const g = parseGpxFile(buildGpx('Tâmpa <loop> & back', line));
    expect(g.name).toBe('Tâmpa <loop> & back');
    expect(g.lines).toHaveLength(1);
    expect(g.lines[0][1]).toMatchObject({ lng: 25.601, lat: 45.601, ele: 612.5, time: line[1].time });
  });

  it('reads routes, multiple segments and waypoints from other apps', () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1">
      <wpt lat="45.4459" lon="25.4566"><name>Vf. Omu</name><ele>2505</ele></wpt>
      <trk><name>Day 1</name>
        <trkseg><trkpt lat="45.40" lon="25.46"/><trkpt lat="45.41" lon="25.46"/></trkseg>
        <trkseg><trkpt lat="45.42" lon="25.46"/><trkpt lat="45.43" lon="25.46"/><trkpt lat="45.44" lon="25.46"/></trkseg>
      </trk>
      <rte><rtept lat='45.5' lon='25.5'></rtept><rtept lat='45.51' lon='25.5'></rtept></rte>
    </gpx>`;
    const g = parseGpxFile(xml);
    expect(g.lines.map((l) => l.length)).toEqual([2, 3, 2]);
    expect(g.waypoints).toEqual([{ lat: 45.4459, lng: 25.4566, ele: 2505, time: undefined, name: 'Vf. Omu' }]);
    expect(g.name).toBe('Day 1');
  });

  it('rejects non-GPX files', () => {
    expect(() => parseGpxFile('<kml></kml>')).toThrow();
  });
});

describe('route following', () => {
  // ~1.57 km east along 45°N, climbing 100 m then flat.
  const coords: Array<[number, number]> = [[25, 45], [25.01, 45], [25.02, 45]];
  const f = new RouteFollower(coords, [500, 600, 600], 1800);

  it('tracks progress, remaining time and climb', () => {
    const s = f.update(25.005, 45.0001);
    expect(s.along).toBeGreaterThan(380);
    expect(s.along).toBeLessThan(410);
    expect(s.remaining).toBeCloseTo(f.length - s.along, 5);
    expect(s.remainingTime).toBeCloseTo((1800 * s.remaining) / f.length, 5);
    expect(s.climbLeft).toBe(0); // the first vertex's climb is already underway
    expect(s.offRoute).toBe(false);
  });

  it('needs several far fixes before declaring off-route', () => {
    const g = new RouteFollower(coords, [500, 600, 600], 1800);
    expect(g.update(25.005, 45.002).offRoute).toBe(false); // ~220 m off
    expect(g.update(25.005, 45.002).offRoute).toBe(false);
    expect(g.update(25.005, 45.002).offRoute).toBe(true);
    expect(g.update(25.005, 45.0).offRoute).toBe(false); // back on track resets
  });

  it('detects arrival', () => {
    expect(f.update(25.0199, 45).arrived).toBe(true);
  });
});
