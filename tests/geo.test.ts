import proj4 from 'proj4';
import { describe, expect, it } from 'vitest';
import { latToTileY, lngToTileX, tileBBox, tilesInBBox, tileXToLng, tileYToLat } from '../src/engine/geo/mercator';
import { lngLatToUtm, zoneFromEpsg } from '../src/engine/geo/utm';
import { haversine } from '../src/engine/geo/geodesy';

const utmDef = (zone: number) => `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;

describe('UTM projection', () => {
  // Romania spans 20°E–30°E: zone 34 (18–24°E) and 35 (24–30°E); Sentinel tiles
  // straddle the boundary so we also test ~3° outside the nominal zone.
  const points: Array<[number, number]> = [
    [25.46, 45.43], // Bucegi
    [22.9, 45.38], // Retezat
    [27.6, 47.17], // Iași
    [20.3, 43.7],
    [29.7, 48.2],
    [23.9, 46.77], // Cluj, near the 24°E boundary
  ];
  for (const zone of [34, 35]) {
    for (const [lng, lat] of points) {
      it(`matches proj4 in zone ${zone} at ${lng},${lat}`, () => {
        const [e, n] = proj4('WGS84', utmDef(zone), [lng, lat]);
        const out = lngLatToUtm(lng, lat, { zone, south: false });
        expect(Math.abs(out[0] - e)).toBeLessThan(0.01);
        expect(Math.abs(out[1] - n)).toBeLessThan(0.01);
      });
    }
  }

  it('maps EPSG codes to zones', () => {
    expect(zoneFromEpsg(32635)).toEqual({ zone: 35, south: false });
    expect(zoneFromEpsg(32734)).toEqual({ zone: 34, south: true });
    expect(() => zoneFromEpsg(3857)).toThrow();
  });
});

describe('Web Mercator tiles', () => {
  it('round-trips lng/lat through tile coords', () => {
    expect(tileXToLng(lngToTileX(25.46, 12), 12)).toBeCloseTo(25.46, 10);
    expect(tileYToLat(latToTileY(45.43, 12), 12)).toBeCloseTo(45.43, 10);
  });

  it('computes tile bounds', () => {
    const [w, s, e, n] = tileBBox(1, 1, 0);
    expect([w, e]).toEqual([0, 180]);
    expect(s).toBeCloseTo(0, 10);
    expect(n).toBeCloseTo(85.0511, 3);
  });

  it('lists tiles covering a bbox', () => {
    const tiles = tilesInBBox([25.4, 45.38, 25.52, 45.48], 11);
    expect(tiles.length).toBeGreaterThan(0);
    for (const [z, x, y] of tiles) {
      const [w, s, e, n] = tileBBox(z, x, y);
      expect(w < 25.52 && e > 25.4 && s < 45.48 && n > 45.38).toBe(true);
    }
  });

  it('haversine is sane', () => {
    // 1° of latitude ≈ 111.2 km
    expect(haversine(25, 45, 25, 46)).toBeGreaterThan(111_000);
    expect(haversine(25, 45, 25, 46)).toBeLessThan(111_400);
  });
});
