/**
 * Route following: projects GPS fixes onto the planned line to get progress,
 * remaining distance/time/climb, and detects going off-route (with hysteresis
 * so a single bad fix under trees doesn't trigger it).
 */
import { haversine } from './geo/geodesy';

export interface NavState {
  /** Metres along the route of the snapped position. */
  along: number;
  remaining: number;
  /** Estimated seconds left, scaled from the planned duration. */
  remainingTime: number;
  /** Metres of climbing left. */
  climbLeft: number;
  /** Distance from the route line (m). */
  offset: number;
  offRoute: boolean;
  arrived: boolean;
  snapped: [number, number];
}

const OFF_ROUTE_M = 45;
const OFF_ROUTE_FIXES = 3;
const ARRIVE_M = 30;

export class RouteFollower {
  private cum: number[] = [0];
  private climbFrom: number[];
  private offCount = 0;
  private lastSeg = 0;

  constructor(
    private coords: Array<[number, number]>,
    elevations: number[],
    private duration: number,
  ) {
    for (let i = 1; i < coords.length; i++) this.cum.push(this.cum[i - 1] + haversine(...coords[i - 1], ...coords[i]));
    // climbFrom[i] = ascent from vertex i to the end.
    this.climbFrom = new Array(coords.length).fill(0);
    for (let i = coords.length - 2; i >= 0; i--) {
      const a = elevations[i], b = elevations[i + 1];
      this.climbFrom[i] = this.climbFrom[i + 1] + (Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : 0);
    }
  }

  get length(): number {
    return this.cum[this.cum.length - 1];
  }

  update(lng: number, lat: number, accuracy = 10): NavState {
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
    let best = Infinity, bestSeg = 0, bestT = 0;
    // Search near the last match first (routes can cross themselves), then everywhere.
    const n = this.coords.length - 1;
    const scan = (from: number, to: number) => {
      for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
        const [x0, y0] = this.coords[i], [x1, y1] = this.coords[i + 1];
        const ax = (x1 - x0) * kx, ay = (y1 - y0) * ky, px = (lng - x0) * kx, py = (lat - y0) * ky;
        const L2 = ax * ax + ay * ay;
        const t = L2 ? Math.max(0, Math.min(1, (px * ax + py * ay) / L2)) : 0;
        const d = Math.hypot(px - t * ax, py - t * ay);
        if (d < best) {
          best = d;
          bestSeg = i;
          bestT = t;
        }
      }
    };
    scan(this.lastSeg - 20, this.lastSeg + 60);
    if (best > OFF_ROUTE_M) scan(0, n);
    this.lastSeg = bestSeg;
    const segLen = this.cum[bestSeg + 1] - this.cum[bestSeg];
    const along = this.cum[bestSeg] + bestT * segLen;
    const remaining = Math.max(0, this.length - along);
    // Generous with poor GPS accuracy (forest, canyons).
    const off = best > Math.max(OFF_ROUTE_M, accuracy * 1.5);
    this.offCount = off ? this.offCount + 1 : 0;
    const [x0, y0] = this.coords[bestSeg], [x1, y1] = this.coords[Math.min(n, bestSeg + 1)];
    return {
      along,
      remaining,
      remainingTime: this.length > 0 ? (this.duration * remaining) / this.length : 0,
      climbLeft: this.climbFrom[Math.min(n, bestSeg + 1)],
      offset: best,
      offRoute: this.offCount >= OFF_ROUTE_FIXES,
      arrived: remaining < ARRIVE_M,
      snapped: [x0 + (x1 - x0) * bestT, y0 + (y1 - y0) * bestT],
    };
  }
}
