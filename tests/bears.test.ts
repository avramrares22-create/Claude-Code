import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessBearRisk, BearGrid, chanceWithin, habitatFactor, lightPhase, riskIndex, sunElevation, type BearGridMeta, type Poly } from '../src/engine/bears/bearRisk';

const meta = JSON.parse(readFileSync('public/bears/density.json', 'utf8')) as BearGridMeta;
const grid = new BearGrid(meta, new Uint8Array(readFileSync('public/bears/density.bin')));
const OCT_NOON = new Date('2026-10-04T10:00:00Z'); // 13:00 in Romania

describe('bear density grid', () => {
  it('matches the census scale: Brașov mountains dense, plains and cities near zero', () => {
    const brasov = grid.area(25.6, 45.6, 10);
    expect(brasov.density).toBeGreaterThan(0.15); // census: ~0.3 bears/km² in Brașov county
    expect(brasov.bears).toBeGreaterThan(40);
    expect(grid.area(26.1, 44.43, 10).density).toBeLessThan(0.002); // București
    expect(grid.area(28.63, 44.18, 10).density).toBeLessThan(0.002); // Constanța
    expect(grid.densityAt(10, 10)).toBe(0); // outside the grid
  });

  it('gives the Carpathians a much higher index than the plains', () => {
    const mtn = assessBearRisk(grid, { lng: 25.52, lat: 45.42, when: OCT_NOON }); // Bucegi
    const city = assessBearRisk(grid, { lng: 26.1, lat: 44.43, when: OCT_NOON });
    expect(mtn.r10.index).toBeGreaterThanOrEqual(60);
    expect(mtn.r10.level === 'high' || mtn.r10.level === 'very-high').toBe(true);
    expect(city.r10.index).toBeLessThan(15);
    expect(city.r1.level).toBe('low');
  });

  it('rises at dusk and in autumn, falls in mid-winter', () => {
    const p = { lng: 25.6, lat: 45.6 };
    const noon = assessBearRisk(grid, { ...p, when: OCT_NOON }).r10.index;
    const dusk = assessBearRisk(grid, { ...p, when: new Date('2026-10-04T16:00:00Z') }).r10.index;
    const jan = assessBearRisk(grid, { ...p, when: new Date('2026-01-15T10:00:00Z') }).r10.index;
    expect(dusk).toBeGreaterThan(noon);
    expect(jan).toBeLessThan(noon);
  });

  it('a fresh nearby sighting raises the 1 km risk', () => {
    const p = { lng: 25.6, lat: 45.6, when: OCT_NOON };
    const base = assessBearRisk(grid, p).r1.index;
    const seen = assessBearRisk(grid, { ...p, sightings: [{ lng: 25.601, lat: 45.6005, ageDays: 0.2, obscured: false, accuracy: 30 }] }).r1;
    expect(seen.recent).toBeGreaterThan(0.9);
    expect(seen.index).toBeGreaterThan(base);
  });
});

describe('bear risk helpers', () => {
  it('index is monotonic and bounded', () => {
    expect(riskIndex(0)).toBe(1);
    expect(riskIndex(0.002)).toBe(1);
    expect(riskIndex(3)).toBe(100);
    expect(riskIndex(0.3)).toBeLessThan(70); // Brașov county average reads High, not Very high
    expect(riskIndex(100)).toBe(100);
    expect(riskIndex(0.3)).toBeGreaterThan(riskIndex(0.05));
  });

  it('sun position: noon high, midnight below horizon, dusk twilight', () => {
    expect(sunElevation(new Date('2026-06-21T10:00:00Z'), 25.6, 45.6)).toBeGreaterThan(60);
    expect(lightPhase(new Date('2026-06-21T22:00:00Z'), 25.6, 45.6)).toBe('night');
    expect(lightPhase(new Date('2026-10-04T15:55:00Z'), 25.6, 45.6)).toBe('twilight');
  });

  it('obscured sightings count only partly toward a small radius', () => {
    const s = { lng: 25.65, lat: 45.65, ageDays: 1, obscured: true };
    const p1 = chanceWithin(s, 25.6, 45.6, 1);
    const p10 = chanceWithin(s, 25.6, 45.6, 10);
    expect(p1).toBeGreaterThan(0);
    expect(p1).toBeLessThan(0.02);
    expect(p10).toBeGreaterThan(0.3);
    expect(chanceWithin(s, 27.5, 44.5, 10)).toBe(0); // far away
  });
});

describe('fine-scale habitat', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number): Poly => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const p = { lng: 25.6, lat: 45.64 };
  it('raises the 1 km reading at a forest edge and lowers it in town', () => {
    const forestHere = habitatFactor(p.lng, p.lat, [sq(25.592, 45.635, 25.608, 45.645)], []);
    const forestFar = habitatFactor(p.lng, p.lat, [sq(25.615, 45.63, 25.625, 45.65)], [sq(25.594, 45.636, 25.606, 45.644)]);
    expect(forestHere.forestNear).toBeGreaterThan(0.9);
    expect(forestHere.factor).toBeGreaterThan(1.5);
    expect(forestFar.builtNear).toBeGreaterThan(0.9);
    expect(forestFar.factor).toBeLessThan(0.5);
  });
});
