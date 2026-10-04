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

describe('merging detections', () => {
  const mk = (id: number, coords: Array<[number, number]>, source: 'gps' | 'imagery', confidence: number) =>
    ({ wayId: id, nodeIds: coords.map((_, i) => -id * 100 - i), coords, kind: 'detected', hiddenScore: 1, difficulty: 0,
      surfaceClass: 'unknown', trackGrade: 0, mtbScale: -1, access: { foot: 'yes', bike: 'unknown', moto: 'no' },
      routes: [], source, confidence, tags: { highway: 'path' } }) as import('../src/engine/trails/types').Trail;

  it('fuses agreeing corridors and keeps independent ones', async () => {
    const { mergeDetections } = await import('../src/engine/detect/merge');
    const gps = [mk(1, [[25, 45], [25.01, 45]], 'gps', 0.6)];
    const same = mk(2, [[25.0005, 45.0001], [25.0098, 45.0001]], 'imagery', 0.5); // ~11 m away
    const other = mk(3, [[25, 45.01], [25.01, 45.01]], 'imagery', 0.5); // ~1.1 km away
    const out = mergeDetections(gps, [same, other]);
    expect(out).toHaveLength(2);
    expect(out[0].confidence).toBeCloseTo(0.8, 5);
    expect(out[0].tags['detected:sources']).toBe('gps;imagery');
    expect(out[1].wayId).toBe(3);
  });
});

describe('hysteresis', () => {
  it('grows strong seeds through weak cells but drops weak-only blobs', async () => {
    const { hysteresis } = await import('../src/engine/detect/raster');
    // Row 1: strong seed then a weak tail. Row 4: weak only.
    const w = 8, h = 6;
    const s = new Float32Array(w * h);
    s[1 * w + 1] = 0.9;
    for (let x = 2; x < 7; x++) s[1 * w + x] = 0.3;
    for (let x = 1; x < 7; x++) s[4 * w + x] = 0.3;
    const m = hysteresis(s, w, h, 0.25, 0.5);
    expect([...m.slice(w, 2 * w)].reduce((a, v) => a + v, 0)).toBe(6);
    expect([...m.slice(4 * w, 5 * w)].reduce((a, v) => a + v, 0)).toBe(0);
  });
});

describe('AI trail alignment', async () => {
  const { alignWays } = await import('../src/engine/detect/align');
  const { lngLatToUtm } = await import('../src/engine/geo/utm');
  // Synthetic 10 m probability raster in UTM 35 with a bright E–W ridge at a known northing.
  const zone = { zone: 35, south: false };
  const [e0, n0] = lngLatToUtm(25.0, 45.0, zone);
  const res = 10, W = 200, H = 100;
  const originX = Math.floor(e0 / 10) * 10 - 500, originY = Math.ceil(n0 / 10) * 10 + 500;
  const ridgeN = n0 + 20; // the real trail is ~20 m north of the mapped line
  const prob = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const n = originY - (y + 0.5) * res;
    for (let x = 0; x < W; x++) prob[y * W + x] = Math.exp(-((n - ridgeN) ** 2) / (2 * 6 ** 2)) * 0.9;
  }
  const raster = { epsg: 32635, originX, originY, res, width: W, height: H, prob };
  const mapped: import('../src/engine/trails/types').OsmWay = {
    type: 'way', id: 1, nodes: [10, 11, 12, 13],
    geometry: [{ lon: 24.998, lat: 45 }, { lon: 25.0, lat: 45 }, { lon: 25.002, lat: 45 }, { lon: 25.004, lat: 45 }],
    tags: { highway: 'track' },
  };

  it('moves a misaligned way onto the imagery ridge, keeping vertex count', () => {
    const [a] = alignWays(raster, [mapped]);
    expect(a).toBeDefined();
    expect(a.coords).toHaveLength(4);
    expect(a.shift).toBeGreaterThan(14);
    expect(a.shift).toBeLessThan(26);
    // Interior vertices move ~20 m north (≈0.00018°); ends are anchored.
    const dLat = (a.coords[1][1] - 45) * 110540;
    expect(dLat).toBeGreaterThan(10);
    expect(dLat).toBeLessThan(26);
    expect(a.coords[0]).toEqual([24.998, 45]);
    expect(a.coords[3]).toEqual([25.004, 45]);
  });

  it('leaves well-placed ways alone and needs consistent evidence', () => {
    const onRidge = { ...mapped, geometry: mapped.geometry.map((g) => ({ ...g, lat: 45 + 20 / 110540 })) };
    expect(alignWays(raster, [onRidge])).toHaveLength(0);
    const flat = { ...raster, prob: new Float32Array(W * H) };
    expect(alignWays(flat, [mapped])).toHaveLength(0);
  });

  it('keeps shared junctions fixed', () => {
    const other = { ...mapped, id: 2, nodes: [99, 11, 98], geometry: [{ lon: 25.0, lat: 44.999 }, { lon: 25.0, lat: 45 }, { lon: 25.0, lat: 45.001 }] };
    const [a] = alignWays(raster, [mapped, other]).filter((x) => x.wayId === 1);
    expect(a.coords[1]).toEqual([25.0, 45]); // node 11 is a junction
  });
});
