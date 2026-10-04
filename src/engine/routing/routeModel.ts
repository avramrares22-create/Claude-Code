/**
 * Route models predict how fast (m/s) a traveller moves along one trail edge.
 * The router is model-agnostic: `ExpertRouteModel` encodes field knowledge,
 * `LearnedRouteModel` (routeNet.ts) is fitted on real GPS traces.
 */
import type { SurfaceClass, Trail, TravelMode } from '../trails/types';

export interface RouteModel {
  readonly name: string;
  /** Speed in m/s along `trail` at `slope` (rise/run, signed). 0 = impassable. */
  speed(mode: TravelMode, trail: Trail, slope: number): number;
  /** Upper bound on speed for a mode (keeps A* admissible). */
  maxSpeed(mode: TravelMode): number;
}

const KMH = 1 / 3.6;

export function toblerSpeed(slope: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(slope + 0.05)) * KMH;
}

const BIKE_SURFACE: Record<SurfaceClass, number> = { paved: 22, gravel: 16, dirt: 13, grass: 9, rock: 6, unknown: 0 };
const MOTO_SURFACE: Record<SurfaceClass, number> = { paved: 50, gravel: 35, dirt: 25, grass: 15, rock: 10, unknown: 0 };
const MOTO_GRADE = [0, 35, 28, 20, 13, 8];
const MTB_FACTOR = [1, 0.85, 0.65, 0.45, 0.25, 0.15, 0.1];

function footSpeed(t: Trail, slope: number): number {
  let f = t.kind === 'hidden' || t.kind === 'detected' ? 0.85 : t.kind === 'path' ? 0.95 : 1;
  if (t.difficulty >= 5) f *= 0.45;
  else if (t.difficulty >= 4) f *= 0.6;
  else if (t.difficulty >= 3) f *= 0.8;
  if (t.surfaceClass === 'rock') f *= 0.85;
  return toblerSpeed(slope) * f;
}

function bikeSpeed(t: Trail, slope: number): number {
  if (t.tags.highway === 'steps' || t.difficulty >= 4) return 2 * KMH; // carry / push
  let base = BIKE_SURFACE[t.surfaceClass];
  if (!base) base = t.kind === 'road' ? 18 : t.kind === 'track' ? 13 : 9;
  if (t.mtbScale >= 0) base *= MTB_FACTOR[t.mtbScale];
  else if (t.difficulty === 3) base *= 0.5;
  // Climbing is power-limited; descending speeds up until it gets technical.
  let v: number;
  if (slope > 0) v = base / (1 + 14 * slope);
  else if (slope > -0.12) v = base * (1 - slope * 3);
  else v = base * 0.7;
  // Below walking pace you push, which is ~3.5 km/h on the flat (slower uphill).
  return Math.max(v * KMH, toblerSpeed(slope) * 0.75);
}

function motoSpeed(t: Trail, slope: number): number {
  let base = t.trackGrade ? MOTO_GRADE[t.trackGrade] : MOTO_SURFACE[t.surfaceClass];
  if (!base) base = t.kind === 'road' ? 40 : t.kind === 'track' ? 20 : 0;
  if (!base) return 0;
  const s = Math.abs(slope);
  if (s > 0.45) return 0;
  return (base / (1 + 3 * s)) * KMH;
}

export class ExpertRouteModel implements RouteModel {
  readonly name = 'expert';

  speed(mode: TravelMode, t: Trail, slope: number): number {
    return mode === 'foot' ? footSpeed(t, slope) : mode === 'bike' ? bikeSpeed(t, slope) : motoSpeed(t, slope);
  }

  maxSpeed(mode: TravelMode): number {
    return mode === 'foot' ? 6 * KMH : mode === 'bike' ? 22 * 1.36 * KMH : 50 * KMH;
  }
}

export const expertModel = new ExpertRouteModel();
