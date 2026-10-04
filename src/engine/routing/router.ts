/**
 * Hiking router: A* over the trail graph minimising walking time.
 *
 * Time model: Tobler's hiking function (6·e^(-3.5·|slope+0.05|) km/h) scaled by
 * trail kind and SAC difficulty. Preferences then bias the *cost* (not the
 * reported time), e.g. to seek out hidden trails.
 */
import { haversine } from '../geo/geodesy';
import { HIDDEN_THRESHOLD } from '../trails/classify';
import type { Trail } from '../trails/types';
import type { TrailGraph } from './graph';

export interface RoutePreferences {
  /** -1 avoid hidden trails … 0 neutral … 1 actively seek them. */
  hidden: number;
  /** Highest SAC grade allowed (1..6). */
  maxDifficulty: number;
}

export const DEFAULT_PREFS: RoutePreferences = { hidden: 0, maxDifficulty: 4 };

export interface Route {
  coords: Array<[number, number]>;
  elevations: number[];
  distance: number;
  ascent: number;
  descent: number;
  /** Estimated walking time in seconds. */
  duration: number;
  wayIds: number[];
  /** Fraction of distance on hidden trails. */
  hiddenShare: number;
  snapDistance: [number, number];
}

const TOBLER_MAX = 6 / 3.6; // m/s on a gentle descent

export function toblerSpeed(slope: number): number {
  return (6 * Math.exp(-3.5 * Math.abs(slope + 0.05))) / 3.6;
}

export function terrainFactor(t: Trail): number {
  let f = t.kind === 'hidden' ? 0.85 : t.kind === 'path' ? 0.95 : 1;
  if (t.difficulty >= 5) f *= 0.45;
  else if (t.difficulty >= 4) f *= 0.6;
  else if (t.difficulty >= 3) f *= 0.8;
  return f;
}

/** Seconds to traverse an edge from a to b. */
export function edgeTime(length: number, elevA: number, elevB: number, trail: Trail): number {
  const slope = Number.isFinite(elevA) && Number.isFinite(elevB) && length > 0 ? (elevB - elevA) / length : 0;
  const clamped = Math.max(-1, Math.min(1, slope));
  return length / (toblerSpeed(clamped) * terrainFactor(trail));
}

function preferenceMultiplier(t: Trail, prefs: RoutePreferences): number {
  return 1 - 0.4 * prefs.hidden * t.hiddenScore;
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
  prefs: RoutePreferences = DEFAULT_PREFS,
  snapRadius = 500,
): Route | null {
  const a = g.nearest(from[0], from[1], snapRadius);
  const b = g.nearest(to[0], to[1], snapRadius);
  if (!a || !b) return null;
  const elev = g.elev.length === g.size ? g.elev : new Float32Array(g.size).fill(NaN);
  const minMult = Math.min(1, 1 - 0.4 * prefs.hidden);
  const h = (i: number) => (haversine(g.lng[i], g.lat[i], g.lng[b.node], g.lat[b.node]) / TOBLER_MAX) * minMult;

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
      if (t.difficulty > prefs.maxDifficulty) continue;
      const c = cost[u] + edgeTime(e.length, elev[u], elev[e.to], t) * preferenceMultiplier(t, prefs);
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

  let distance = 0, ascent = 0, descent = 0, duration = 0, hiddenLen = 0;
  const wayIds: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const pe = prevEdge[path[i]]!;
    const t = g.trails[pe.trail];
    const ea = elev[path[i - 1]], eb = elev[path[i]];
    distance += pe.length;
    duration += edgeTime(pe.length, ea, eb, t);
    if (Number.isFinite(ea) && Number.isFinite(eb)) {
      if (eb > ea) ascent += eb - ea;
      else descent += ea - eb;
    }
    if (t.hiddenScore >= HIDDEN_THRESHOLD) hiddenLen += pe.length;
    if (wayIds[wayIds.length - 1] !== t.wayId) wayIds.push(t.wayId);
  }
  return {
    coords: path.map((n) => [g.lng[n], g.lat[n]]),
    elevations: path.map((n) => elev[n]),
    distance,
    ascent,
    descent,
    duration,
    wayIds,
    hiddenShare: distance > 0 ? hiddenLen / distance : 0,
    snapDistance: [a.dist, b.dist],
  };
}
