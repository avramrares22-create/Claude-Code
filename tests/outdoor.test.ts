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

describe('turn-by-turn maneuvers', async () => {
  const { buildManeuvers, announce, legName } = await import('../src/engine/navigation');
  // East 500 m on a red-stripe trail, then a left turn north onto a forest track for 400 m.
  const coords: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) coords.push([25 + i * 0.000635, 45]);
  for (let i = 1; i <= 8; i++) coords.push([25.00635, 45 + i * 0.00045]);
  const segs = coords.slice(1).map((_, i) =>
    i < 10 ? { wayId: 1, kind: 'marked', marking: 'red stripe' } : { wayId: 2, kind: 'track' },
  );

  it('finds the left turn and names the trails', () => {
    const m = buildManeuvers(coords, segs);
    expect(m.map((x) => x.type)).toEqual(['depart', 'left', 'arrive']);
    expect(m[0].text).toBe('Head out on the red stripe trail');
    expect(m[1].text).toBe('Turn left onto the forest track');
    expect(m[1].along).toBeGreaterThan(480);
    expect(m[1].along).toBeLessThan(520);
  });

  it('ignores OSM splits of the same trail going straight', () => {
    const split = segs.map((s, i) => (i < 5 ? { ...s, wayId: 7 } : s));
    expect(buildManeuvers(coords, split).map((x) => x.type)).toEqual(['depart', 'left', 'arrive']);
  });

  it('phrases spoken announcements by distance', () => {
    const [, left] = buildManeuvers(coords, segs);
    expect(announce(left, 180)).toBe('In 200 metres, turn left onto the forest track');
    expect(announce(left, 12)).toBe('Turn left onto the forest track');
    expect(legName({ wayId: 1, kind: 'path', name: 'Drumul Familiar' })).toBe('Drumul Familiar');
  });
});
