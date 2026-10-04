/**
 * Off-road router: A* over the trail graph minimising travel time for a mode
 * (foot / bike / moto). Edge speeds come from a pluggable RouteModel (expert
 * rules or the learned RouteNet). Preferences then bias the *cost* — not the
 * reported time — e.g. to seek hidden trails or stay off asphalt.
 */
import { haversine } from '../geo/geodesy';
import { HIDDEN_THRESHOLD } from '../trails/classify';
import type { Trail, TravelMode } from '../trails/types';
import type { TrailGraph } from './graph';
import { expertModel, type RouteModel } from './routeModel';

export { toblerSpeed } from './routeModel';

export interface RoutePreferences {
  mode: TravelMode;
  /** -1 avoid hidden trails … 0 neutral … 1 actively seek them. */
  hidden: number;
  /** 0 neutral … 1 strongly prefer unpaved ways over asphalt. */
  offroad: number;
  /** Highest SAC grade allowed for foot (1..6). */
  maxDifficulty: number;
  /** Highest mtb:scale allowed for bike (0..6). */
  maxMtbScale: number;
  /** Refuse ways whose legal access for this mode is unknown (e.g. untagged forest roads for moto). */
  strictAccess: boolean;
}

export const DEFAULT_PREFS: RoutePreferences = {
  mode: 'foot',
  hidden: 0,
  offroad: 0,
  maxDifficulty: 4,
  maxMtbScale: 3,
  strictAccess: false,
};

export interface Route {
  mode: TravelMode;
  coords: Array<[number, number]>;
  elevations: number[];
  distance: number;
  ascent: number;
  descent: number;
  /** Estimated travel time in seconds. */
  duration: number;
  wayIds: number[];
  /** Fraction of distance on hidden or detected trails. */
  hiddenShare: number;
  /** Fraction of distance on unpaved surfaces. */
  offroadShare: number;
  /** Fraction of distance where legal access for this mode is not confirmed. */
  unknownAccessShare: number;
  snapDistance: [number, number];
  model: string;
}

function slopeOf(length: number, elevA: number, elevB: number): number {
  const s = Number.isFinite(elevA) && Number.isFinite(elevB) && length > 0 ? (elevB - elevA) / length : 0;
  return Math.max(-1, Math.min(1, s));
}

/** Seconds to traverse an edge from a to b (Infinity if impassable). */
export function edgeTime(
  length: number,
  elevA: number,
  elevB: number,
  trail: Trail,
  mode: TravelMode = 'foot',
  model: RouteModel = expertModel,
): number {
  const v = model.speed(mode, trail, slopeOf(length, elevA, elevB));
  return v > 0 ? length / v : Infinity;
}

/** Hard constraints: legal access and difficulty limits. */
export function allowed(t: Trail, prefs: RoutePreferences): boolean {
  const a = t.access[prefs.mode];
  if (a === 'no' || (a === 'unknown' && prefs.strictAccess)) return false;
  if (prefs.mode === 'foot' && t.difficulty > prefs.maxDifficulty) return false;
  if (prefs.mode === 'bike' && t.mtbScale > prefs.maxMtbScale) return false;
  return true;
}

const isHidden = (t: Trail) => t.kind === 'detected' || t.hiddenScore >= HIDDEN_THRESHOLD;

/** Cost multiplier from soft preferences; bounded to [MIN_MULT, ∞). */
function preferenceMultiplier(t: Trail, prefs: RoutePreferences): number {
  const hiddenness = t.kind === 'detected' ? 1 : t.hiddenScore;
  let m = 1 - 0.4 * prefs.hidden * hiddenness;
  if (prefs.offroad > 0 && t.surfaceClass === 'paved') m *= 1 + 0.8 * prefs.offroad;
  // Detected trails are less certain to exist: a small, confidence-weighted surcharge.
  if (t.kind === 'detected') m *= 1 + 0.3 * (1 - t.confidence);
  if (t.access[prefs.mode] === 'unknown') m *= 1.1;
  return m;
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(node: number, prio: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(node);
    v.push(prio);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export function findRoute(
  g: TrailGraph,
  from: [number, number],
  to: [number, number],
  prefsIn: Partial<RoutePreferences> = {},
  model: RouteModel = expertModel,
  snapRadius = 500,
): Route | null {
  const prefs: RoutePreferences = { ...DEFAULT_PREFS, ...prefsIn };
  const mode = prefs.mode;
  const a = g.nearest(from[0], from[1], snapRadius);
  const b = g.nearest(to[0], to[1], snapRadius);
  if (!a || !b) return null;
  const elev = g.elev.length === g.size ? g.elev : new Float32Array(g.size).fill(NaN);
  const minMult = Math.min(1, 1 - 0.4 * prefs.hidden);
  const vmax = model.maxSpeed(mode);
  const h = (i: number) => (haversine(g.lng[i], g.lat[i], g.lng[b.node], g.lat[b.node]) / vmax) * minMult;

  const cost = new Float64Array(g.size).fill(Infinity);
  const prev = new Int32Array(g.size).fill(-1);
  const prevEdge: Array<{ trail: number; length: number } | null> = new Array(g.size).fill(null);
  const closed = new Uint8Array(g.size);
  const heap = new MinHeap();
  cost[a.node] = 0;
  heap.push(a.node, h(a.node));

  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    if (u === b.node) break;
    closed[u] = 1;
    for (const e of g.adj[u]) {
      if (closed[e.to]) continue;
      const t = g.trails[e.trail];
      if (!allowed(t, prefs)) continue;
      const dt = edgeTime(e.length, elev[u], elev[e.to], t, mode, model);
      if (!Number.isFinite(dt)) continue;
      const c = cost[u] + dt * preferenceMultiplier(t, prefs);
      if (c < cost[e.to]) {
        cost[e.to] = c;
        prev[e.to] = u;
        prevEdge[e.to] = { trail: e.trail, length: e.length };
        heap.push(e.to, c + h(e.to));
      }
    }
  }
  if (a.node !== b.node && prev[b.node] < 0) return null;

  const path: number[] = [];
  for (let n = b.node; n >= 0; n = prev[n]) path.push(n);
  path.reverse();

  let distance = 0, ascent = 0, descent = 0, duration = 0, hiddenLen = 0, offroadLen = 0, unknownLen = 0;
  const wayIds: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const pe = prevEdge[path[i]]!;
    const t = g.trails[pe.trail];
    const ea = elev[path[i - 1]], eb = elev[path[i]];
    distance += pe.length;
    duration += edgeTime(pe.length, ea, eb, t, mode, model);
    if (Number.isFinite(ea) && Number.isFinite(eb)) {
      if (eb > ea) ascent += eb - ea;
      else descent += ea - eb;
    }
    if (isHidden(t)) hiddenLen += pe.length;
    if (t.surfaceClass !== 'paved') offroadLen += pe.length;
    if (t.access[mode] === 'unknown') unknownLen += pe.length;
    if (wayIds[wayIds.length - 1] !== t.wayId) wayIds.push(t.wayId);
  }
  return {
    mode,
    model: model.name,
    coords: path.map((n) => [g.lng[n], g.lat[n]]),
    elevations: path.map((n) => elev[n]),
    distance,
    ascent,
    descent,
    duration,
    wayIds,
    hiddenShare: distance > 0 ? hiddenLen / distance : 0,
    offroadShare: distance > 0 ? offroadLen / distance : 0,
    unknownAccessShare: distance > 0 ? unknownLen / distance : 0,
    snapDistance: [a.dist, b.dist],
  };
}
