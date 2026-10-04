import { sunElevation } from './bears/bearRisk';

/** Sunset is when the sun's upper edge meets the horizon (refraction included). */
const HORIZON = -0.833;

/**
 * Next sunset after `from` (within 24 h), or null in polar day/night.
 * Steps 10 min then bisects the crossing, so it's within a few seconds.
 */
export function nextSunset(from: Date, lng: number, lat: number): Date | null {
  const step = 10 * 60_000;
  let t = from.getTime();
  let prev = sunElevation(from, lng, lat);
  for (let i = 0; i < 144; i++) {
    const t2 = t + step;
    const e = sunElevation(new Date(t2), lng, lat);
    if (prev >= HORIZON && e < HORIZON) {
      let a = t, b = t2;
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (sunElevation(new Date(m), lng, lat) >= HORIZON) a = m;
        else b = m;
      }
      return new Date((a + b) / 2);
    }
    t = t2;
    prev = e;
  }
  return null;
}

export interface Daylight {
  /** Sun currently above the horizon. */
  up: boolean;
  sunset: Date | null;
  /** Milliseconds of daylight left now (0 when the sun is down). */
  leftMs: number;
}

export function daylight(now: Date, lng: number, lat: number): Daylight {
  const up = sunElevation(now, lng, lat) >= HORIZON;
  const sunset = nextSunset(now, lng, lat);
  return { up, sunset, leftMs: up && sunset ? sunset.getTime() - now.getTime() : 0 };
}
