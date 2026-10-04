import { describe, expect, it } from 'vitest';
import { detectFromTraces, parseGpx, type Trace } from '../src/engine/detect/gps';
import { Grid, removeSmall, simplify, skeletonize, traceSkeleton } from '../src/engine/detect/raster';
import type { OsmWay } from '../src/engine/trails/types';

const BBOX: [number, number, number, number] = [25.0, 45.0, 25.02, 45.015];

/** A walked line with ~3 m jitter, one point per ~5 m, 1.2 m/s. */
function walk(from: [number, number], to: [number, number], seed: number, offsetLat = 0): Trace {
  const n = 120;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  return Array.from({ length: n + 1 }, (_, i) => ({
    lon: from[0] + ((to[0] - from[0]) * i) / n + rnd() * 0.00003,
    lat: from[1] + ((to[1] - from[1]) * i) / n + offsetLat + rnd() * 0.00002,
    t: Date.parse('2026-08-01T10:00:00Z') + i * 5000,
  }));
}

const way = (id: number, coords: Array<[number, number]>): OsmWay => ({
  type: 'way',
  id,
  nodes: coords.map((_, k) => id * 10 + k),
  geometry: coords.map(([lon, lat]) => ({ lon, lat })),
  tags: { highway: 'path' },
});

describe('GPX parsing', () => {
  it('reads segments, points and times', () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="45.1" lon="25.1"><time>2026-08-14T10:33:38Z</time></trkpt>
      <trkpt lat="45.2" lon="25.2"><time>2026-08-14T10:33:40Z</time></trkpt>
    </trkseg><trkseg><trkpt lat="45.3" lon="25.3"/><trkpt lat="45.4" lon="25.4"/></trkseg></trk></gpx>`;
    const t = parseGpx(xml);
    expect(t).toHaveLength(2);
    expect(t[0][1]).toMatchObject({ lat: 45.2, lon: 25.2, t: Date.parse('2026-08-14T10:33:40Z') });
    expect(t[1][0].t).toBeUndefined();
  });
});

describe('GPS trail detection', () => {
  const A: [number, number] = [25.002, 45.007];
  const B: [number, number] = [25.018, 45.008];

  it('finds a corridor walked by several people that is not mapped', () => {
    const traces = [walk(A, B, 1), walk(A, B, 2), walk(B, A, 3)];
    const r = detectFromTraces(traces, BBOX, []);
    expect(r.trails.length).toBeGreaterThanOrEqual(1);
    const t = r.trails[0];
    expect(t.kind).toBe('detected');
    expect(t.source).toBe('gps');
    expect(t.tags['detected:usage']).toBe('foot');
    expect(t.confidence).toBeGreaterThan(0.5);
    // Roughly spans A→B (~1.26 km).
    const ends = [t.coords[0][0], t.coords.at(-1)![0]].sort();
    expect(ends[0]).toBeLessThan(25.004);
    expect(ends[1]).toBeGreaterThan(25.016);
  });

  it('ignores a single trace (could be anyone wandering)', () => {
    expect(detectFromTraces([walk(A, B, 1)], BBOX, []).trails).toHaveLength(0);
  });

  it('ignores corridors that are already mapped, even if offset by map error', () => {
    const traces = [walk(A, B, 1), walk(A, B, 2), walk(A, B, 3)];
    expect(detectFromTraces(traces, BBOX, [way(1, [A, B])]).trails).toHaveLength(0);
    // OSM line drawn 25 m south of where people actually walk.
    const offset = way(2, [[A[0], A[1] - 0.000225], [B[0], B[1] - 0.000225]]);
    expect(detectFromTraces(traces, BBOX, [offset]).trails).toHaveLength(0);
  });

  it('snaps detected ends onto nearby OSM junctions', () => {
    // People leave a mapped trail at its end node and walk on.
    const mapped = way(7, [[25.0005, 45.007], A]);
    const traces = [walk(A, B, 1), walk(A, B, 2), walk(A, B, 3)];
    const r = detectFromTraces(traces, BBOX, [mapped]);
    const ids = r.trails.flatMap((t) => [t.nodeIds[0], t.nodeIds.at(-1)!]);
    expect(ids).toContain(71); // way 7's second node id (7*10+1)
  });

  it('labels fast traces as vehicle tracks', () => {
    const fast = (seed: number) => walk(A, B, seed).map((p, i) => ({ ...p, t: Date.parse('2026-08-01T10:00:00Z') + i * 500 }));
    const r = detectFromTraces([fast(1), fast(2)], BBOX, []);
    expect(r.trails[0].tags['detected:usage']).toBe('vehicle');
    expect(r.trails[0].tags.highway).toBe('track');
    expect(r.trails[0].access.moto).toBe('unknown');
  });
});

describe('raster toolkit', () => {
  it('thins a thick bar to a single line and traces it', () => {
    const w = 40, h = 11;
    const m = new Uint8Array(w * h);
    for (let y = 3; y <= 7; y++) for (let x = 2; x < 38; x++) m[y * w + x] = 1;
    const sk = skeletonize(m, w, h);
    const cells = sk.reduce((a, v) => a + v, 0);
    expect(cells).toBeGreaterThan(25);
    expect(cells).toBeLessThan(40);
    const chains = traceSkeleton(sk, w, h);
    expect(chains).toHaveLength(1);
  });

  it('drops tiny components', () => {
    const m = new Uint8Array(100);
    m[0] = 1;
    for (let i = 50; i < 60; i++) m[i] = 1;
    expect(removeSmall(m, 10, 10, 5).reduce((a, v) => a + v, 0)).toBe(10);
  });

  it('simplifies collinear points', () => {
    expect(simplify([[0, 0], [1, 0.01], [2, 0], [3, 0.02], [4, 0]], 0.1)).toEqual([[0, 0], [4, 0]]);
  });

  it('round-trips grid cells', () => {
    const g = new Grid(BBOX, 4);
    const [cx, cy] = g.toCell(25.01, 45.005);
    const [lng, lat] = g.toLngLat(Math.floor(cx), Math.floor(cy));
    expect(Math.abs(lng - 25.01)).toBeLessThan(0.0001);
    expect(Math.abs(lat - 45.005)).toBeLessThan(0.0001);
  });
});
