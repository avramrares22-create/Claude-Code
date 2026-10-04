/**
 * Trains RouteNet (one tiny MLP per travel mode) on map-matched GPS rows and
 * writes src/engine/routing/routenet.weights.json.
 *
 * A mode is only shipped if it beats the expert model on regions it never saw.
 *
 *   npx tsx scripts/routenet/train.ts [rows.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FEATURE_NAMES, N_FEATURES } from '../../src/engine/routing/routeFeatures';
import { mlpForward, type MlpWeights, type RouteNetWeights } from '../../src/engine/routing/routeNet';
import type { TravelMode } from '../../src/engine/trails/types';
import type { Row } from './build';

const ROWS = process.argv[2] ?? 'ml/route_rows.json';
const OUT = 'src/engine/routing/routenet.weights.json';
const HIDDEN = 12;
const CLAMP: [number, number] = [-1.2, 0.7];
const EPOCHS = 400;
const LR = 0.01;
const L2 = 2e-3;
const HUBER = 0.25;
const MIN_ROWS = 150;

// Deterministic PRNG so training is reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function init(): MlpWeights {
  const s1 = 1 / Math.sqrt(N_FEATURES), s2 = 1 / Math.sqrt(HIDDEN);
  return {
    w1: Array.from({ length: HIDDEN * N_FEATURES }, () => (rand() * 2 - 1) * s1),
    b1: Array.from({ length: HIDDEN }, () => 0),
    w2: Array.from({ length: HIDDEN }, () => (rand() * 2 - 1) * s2 * 0.1),
    b2: 0,
  };
}

const clamp = (r: number) => Math.max(CLAMP[0], Math.min(CLAMP[1], r));

/** Full-batch Adam on Huber loss of the log-speed residual, weighted by distance. */
function train(rows: Row[]): MlpWeights {
  const w = init();
  const params = [w.w1, w.b1, w.w2];
  const m = params.map((p) => new Float64Array(p.length)), v = params.map((p) => new Float64Array(p.length));
  let mb = 0, vb = 0;
  const h = new Float64Array(HIDDEN);
  const W = rows.reduce((a, r) => a + r.w, 0);
  for (let ep = 1; ep <= EPOCHS; ep++) {
    const g = params.map((p) => new Float64Array(p.length));
    let gb = 0;
    for (const r of rows) {
      const out = mlpForward(w, r.x, HIDDEN, h);
      const e = out - r.y;
      const dl = (Math.abs(e) <= HUBER ? e : HUBER * Math.sign(e)) * (r.w / W);
      gb += dl;
      for (let j = 0; j < HIDDEN; j++) {
        g[2][j] += dl * h[j];
        const dh = dl * w.w2[j] * (1 - h[j] * h[j]);
        g[1][j] += dh;
        const row = j * N_FEATURES;
        for (let i = 0; i < N_FEATURES; i++) g[0][row + i] += dh * r.x[i];
      }
    }
    const b1 = 0.9, b2 = 0.999, t = ep;
    params.forEach((p, k) => {
      for (let i = 0; i < p.length; i++) {
        const gi = g[k][i] + L2 * p[i];
        m[k][i] = b1 * m[k][i] + (1 - b1) * gi;
        v[k][i] = b2 * v[k][i] + (1 - b2) * gi * gi;
        p[i] -= (LR * (m[k][i] / (1 - b1 ** t))) / (Math.sqrt(v[k][i] / (1 - b2 ** t)) + 1e-8);
      }
    });
    mb = b1 * mb + (1 - b1) * gb;
    vb = b2 * vb + (1 - b2) * gb * gb;
    w.b2 -= (LR * (mb / (1 - b1 ** t))) / (Math.sqrt(vb / (1 - b2 ** t)) + 1e-8);
  }
  return w;
}

/** Distance-weighted error metrics on held-out rows. */
function evaluate(rows: Row[], w: MlpWeights | null) {
  let W = 0, maeLog = 0;
  const pctErr: number[] = [];
  const h = new Float64Array(HIDDEN);
  for (const r of rows) {
    const pred = w ? clamp(mlpForward(w, r.x, HIDDEN, h)) : 0;
    const err = pred - Math.log(r.vObs / r.vExpert);
    maeLog += Math.abs(err) * r.w;
    W += r.w;
    pctErr.push(Math.abs(Math.exp(-err) - 1)); // time error: t_pred/t_obs − 1
  }
  pctErr.sort((a, b) => a - b);
  return { maeLog: maeLog / W, medianTimeError: pctErr[Math.floor(pctErr.length / 2)] ?? NaN };
}

function main() {
  const rows = JSON.parse(readFileSync(ROWS, 'utf8')) as Row[];
  const regions = [...new Set(rows.map((r) => r.region))].sort();
  // Every 4th region is held out — whole regions, so we test generalisation to new places.
  const holdout = new Set(regions.filter((_, i) => i % 4 === 1));
  const out: RouteNetWeights = { version: 1, features: FEATURE_NAMES, hidden: HIDDEN, clamp: CLAMP, modes: {}, eval: {} };
  for (const mode of ['foot', 'bike', 'moto'] as TravelMode[]) {
    const all = rows.filter((r) => r.mode === mode);
    const tr = all.filter((r) => !holdout.has(r.region));
    const te = all.filter((r) => holdout.has(r.region));
    if (tr.length < MIN_ROWS || te.length < 30) {
      console.log(mode, `too little data (${tr.length} train / ${te.length} test) — expert model only`);
      out.eval![mode] = { shipped: false, train: tr.length, test: te.length };
      continue;
    }
    const w = train(tr);
    const base = evaluate(te, null), learned = evaluate(te, w);
    const better = learned.maeLog < base.maeLog;
    console.log(
      mode.padEnd(5), `train ${tr.length} test ${te.length}`,
      `| held-out median time error: expert ${(base.medianTimeError * 100).toFixed(1)}% → RouteNet ${(learned.medianTimeError * 100).toFixed(1)}%`,
      `| MAE(log v) ${base.maeLog.toFixed(3)} → ${learned.maeLog.toFixed(3)}`, better ? 'SHIP' : 'REJECT',
    );
    out.eval![mode] = { shipped: better, train: tr.length, test: te.length, expert: base, routenet: learned };
    if (better) {
      // Final model uses all regions.
      const final = train(all);
      const r = (x: number) => Math.round(x * 1e5) / 1e5;
      out.modes[mode] = { w1: final.w1.map(r), b1: final.b1.map(r), w2: final.w2.map(r), b2: r(final.b2), samples: all.length };
    }
  }
  out.eval!.holdoutRegions = [...holdout];
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote', OUT);
}

main();
