/**
 * RankNet: a small MLP (62 → 32 → 1, tanh) that scores search candidates from
 * the features in engine.ts. It learns a correction on top of the hand-set
 * score (residual), trained listwise (softmax over each query's candidates) by
 * ml/search/train_ranker.py.
 */
export interface RankNetWeights {
  mean: number[];
  std: number[];
  W1: number[]; // [hidden × in]
  b1: number[];
  W2: number[]; // [hidden]
  b2: number;
  /** Weight of the hand-set score: RankNet learns a correction on top of it. */
  hScale: number;
}

export class RankNet {
  constructor(private w: RankNetWeights) {}

  score(f: number[]): number {
    const { mean, std, W1, b1, W2, b2 } = this.w;
    const n = f.length;
    const x = f.map((v, i) => (v - mean[i]) / (std[i] || 1));
    let out = b2 + this.w.hScale * heuristicScore(f);
    for (let h = 0; h < b1.length; h++) {
      let s = b1[h];
      for (let i = 0; i < n; i++) s += W1[h * n + i] * x[i];
      out += W2[h] * Math.tanh(s);
    }
    return out;
  }
}

/** Hand-set scoring used before RankNet is trained (and as a safety net). */
export function heuristicScore(f: number[]): number {
  const [cover, , ent, exact, exactFull, prefix, minM, altOnly, cueIn, catP, , , imp, , dA, inA, dF, nearMe, bv, bvF] = f;
  const [allCover, allExact, surface] = [f[23], f[24], f[25]];
  return (
    3 * allCover + 2 * allExact + 1 * surface +
    4 * cover + 1.5 * ent + 2 * exact + 1 * exactFull + 0.8 * prefix + 1 * minM - 0.3 * altOnly + 0.8 * cueIn +
    2 * catP + 1.6 * imp - 2.2 * dA + 0.6 * inA - 0.9 * dF - 1.5 * nearMe + 0.25 * bv + 0.5 * bvF
  );
}
