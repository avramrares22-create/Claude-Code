import { describe, expect, it } from 'vitest';
import { daylight, nextSunset } from '../src/engine/sun';

describe('sunset', () => {
  it('finds Brașov sunset at the right local time', () => {
    // 21 June: sunset in Brașov ≈ 21:05 EEST (18:05 UTC).
    const s = nextSunset(new Date('2026-06-21T09:00:00Z'), 25.6, 45.65)!;
    const utcMin = s.getUTCHours() * 60 + s.getUTCMinutes();
    expect(Math.abs(utcMin - (18 * 60 + 5))).toBeLessThan(8);
    // 21 December: ≈ 16:40 EET (14:40 UTC).
    const w = nextSunset(new Date('2026-12-21T08:00:00Z'), 25.6, 45.65)!;
    expect(Math.abs(w.getUTCHours() * 60 + w.getUTCMinutes() - (14 * 60 + 40))).toBeLessThan(8);
  });

  it('reports no daylight left at night', () => {
    const d = daylight(new Date('2026-06-21T22:00:00Z'), 25.6, 45.65);
    expect(d.up).toBe(false);
    expect(d.leftMs).toBe(0);
    expect(daylight(new Date('2026-06-21T15:00:00Z'), 25.6, 45.65).leftMs).toBeGreaterThan(2.5 * 3600_000);
  });
});
