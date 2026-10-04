/**
 * RouteNet: a tiny on-device model that predicts real travel speed per trail
 * segment, learned from public GPS recordings in Romania.
 *
 * It learns a *correction* to the expert model (log-speed residual), so where
 * training data is thin it falls back to sound physics, and where data is rich
 * it captures what rules miss (e.g. how slow grade-4 forest tracks really are
 * on a bike). One small MLP per travel mode; inference is a few hundred FLOPs.
 */
import type { Trail, TravelMode } from '../trails/types';
import { N_FEATURES, routeFeatures } from './routeFeatures';
import { expertModel, type RouteModel } from './routeModel';

export interface MlpWeights {
  /** hidden × N_FEATURES, row-major */
  w1: number[];
  b1: number[];
  /** hidden */
  w2: number[];
  b2: number;
}

export interface RouteNetWeights {
  version: number;
  features: readonly string[];
  hidden: number;
  /** Residual clamp: speed factor stays within [e^min, e^max] of the expert model. */
  clamp: [number, number];
  modes: Partial<Record<TravelMode, MlpWeights & { samples: number }>>;
  eval?: Record<string, unknown>;
}

export function mlpForward(w: MlpWeights, x: ArrayLike<number>, hidden: number, h: Float64Array<ArrayBufferLike> = new Float64Array(hidden)): number {
  let out = w.b2;
  for (let j = 0; j < hidden; j++) {
    let a = w.b1[j];
    const row = j * N_FEATURES;
    for (let i = 0; i < N_FEATURES; i++) a += w.w1[row + i] * x[i];
    h[j] = Math.tanh(a);
    out += w.w2[j] * h[j];
  }
  return out;
}

export class LearnedRouteModel implements RouteModel {
  readonly name = 'routenet';
  private x = new Float64Array(N_FEATURES);
  private h: Float64Array;

  constructor(
    private weights: RouteNetWeights,
    private base: RouteModel = expertModel,
  ) {
    if (weights.features.length !== N_FEATURES) throw new Error('RouteNet weights do not match feature set');
    this.h = new Float64Array(weights.hidden);
  }

  /** log(speed factor) applied on top of the expert model for this edge. */
  residual(mode: TravelMode, t: Trail, slope: number): number {
    const m = this.weights.modes[mode];
    if (!m) return 0;
    const r = mlpForward(m, routeFeatures(t, slope, this.x), this.weights.hidden, this.h);
    return Math.max(this.weights.clamp[0], Math.min(this.weights.clamp[1], r));
  }

  speed(mode: TravelMode, t: Trail, slope: number): number {
    const v = this.base.speed(mode, t, slope);
    return v > 0 ? v * Math.exp(this.residual(mode, t, slope)) : 0;
  }

  maxSpeed(mode: TravelMode): number {
    // Upper clamp keeps A* admissible.
    return this.base.maxSpeed(mode) * Math.exp(this.weights.modes[mode] ? this.weights.clamp[1] : 0);
  }
}
