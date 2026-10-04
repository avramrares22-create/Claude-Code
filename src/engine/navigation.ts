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

// ------------------------------------------------------------------ turn-by-turn

export type TurnType =
  | 'depart'
  | 'straight'
  | 'slight-left'
  | 'slight-right'
  | 'left'
  | 'right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'arrive';

export interface Maneuver {
  /** Vertex index on the route where the maneuver happens. */
  index: number;
  /** Metres from the start of the route. */
  along: number;
  type: TurnType;
  /** Human instruction, e.g. "Turn left onto the red stripe trail". */
  text: string;
  /** Short spoken form without the distance prefix. */
  spoken: string;
}

export interface SegmentLike {
  wayId: number;
  name?: string;
  kind: string;
  marking?: string;
}

const KIND_NAME: Record<string, string> = {
  marked: 'the marked trail',
  path: 'the path',
  track: 'the forest track',
  road: 'the road',
  hidden: 'the hidden trail',
  detected: 'the unmapped trail',
};

export function legName(s: SegmentLike): string {
  if (s.marking) return `the ${s.marking} trail`;
  if (s.name) return s.name;
  return KIND_NAME[s.kind] ?? 'the trail';
}

const bearing = (a: [number, number], b: [number, number]) => {
  const kx = Math.cos((a[1] * Math.PI) / 180);
  return (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI;
};

function turnType(delta: number): TurnType {
  const a = Math.abs(delta);
  const side = delta < 0 ? 'left' : 'right';
  if (a < 22) return 'straight';
  if (a < 50) return `slight-${side}` as TurnType;
  if (a < 125) return side as TurnType;
  if (a < 165) return `sharp-${side}` as TurnType;
  return 'uturn';
}

const VERB: Record<TurnType, string> = {
  depart: 'Head out on',
  straight: 'Continue onto',
  'slight-left': 'Keep left onto',
  'slight-right': 'Keep right onto',
  left: 'Turn left onto',
  right: 'Turn right onto',
  'sharp-left': 'Turn sharp left onto',
  'sharp-right': 'Turn sharp right onto',
  uturn: 'Turn around onto',
  arrive: 'Arrive at your destination',
};

/**
 * Builds maneuvers where the route changes trail. Turn angles are measured
 * ~25 m before and after the junction so zig-zags in the geometry don't count.
 * OSM splits of the same named trail going straight on are merged away.
 */
export function buildManeuvers(coords: Array<[number, number]>, segments: SegmentLike[]): Maneuver[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(...coords[i - 1], ...coords[i]));
  const pointAt = (m: number): [number, number] => {
    const t = Math.max(0, Math.min(cum[cum.length - 1], m));
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < t) i++;
    const f = (t - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
    return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f];
  };
  const out: Maneuver[] = [];
  if (!segments.length) return out;
  const first = legName(segments[0]);
  out.push({ index: 0, along: 0, type: 'depart', text: `${VERB.depart} ${first}`, spoken: `${VERB.depart} ${first}` });
  let curName = first;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].wayId === segments[i - 1].wayId) continue;
    const name = legName(segments[i]);
    const at = cum[i];
    const delta = ((bearing(pointAt(at), pointAt(at + 25)) - bearing(pointAt(at - 25), pointAt(at)) + 540) % 360) - 180;
    const type = turnType(delta);
    // Same trail bending gently at a junction is not a decision point.
    if ((type === 'straight' || type.startsWith('slight')) && name === curName) continue;
    curName = name;
    const text = `${VERB[type]} ${name}`;
    out.push({ index: i, along: at, type, text, spoken: text });
  }
  out.push({ index: coords.length - 1, along: cum[cum.length - 1], type: 'arrive', text: VERB.arrive, spoken: VERB.arrive });
  // Merge maneuvers closer than 15 m (junction clusters): keep the later, more specific one.
  return out.filter((m, k) => k === out.length - 1 || k === 0 || out[k + 1].along - m.along > 15);
}

/** Distance-based announcement: "In 120 m, turn left onto …". */
export function announce(m: Maneuver, metres: number): string {
  if (m.type === 'arrive') return metres < 30 ? 'You have arrived' : `In ${roundDist(metres)}, ${m.spoken.toLowerCase()}`;
  if (metres < 25) return m.spoken;
  const verb = m.spoken.charAt(0).toLowerCase() + m.spoken.slice(1);
  return `In ${roundDist(metres)}, ${verb}`;
}

export function roundDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} kilometres`;
  if (m >= 100) return `${Math.round(m / 50) * 50} metres`;
  return `${Math.max(10, Math.round(m / 10) * 10)} metres`;
}
