/**
 * QueryNet: a small fastText-style model that reads a search query.
 *
 * Every word becomes a bag of hashed features (the word, its stem, character
 * 3–5-grams, neighbouring words), averaged into an embedding. From that it
 * predicts:
 *  - each word's role: part of a NAME, a category CUE ("lacul", "peak"),
 *    a NEAR word ("lângă", "near"), part of an ANCHOR place ("…lângă Brașov"),
 *    ME ("near me") or FILLer ("unde e", "how to get to");
 *  - what kind of place the whole query asks for (category distribution, or "any").
 * Character n-grams make it robust to typos and missing diacritics.
 * Trained by ml/search/train_querynet.py on generated Romanian/English queries.
 */
import { CATS } from './categories';
import { stem, tokens } from './text';

export const ROLES = ['name', 'cue', 'near', 'anchor', 'me', 'fill'] as const;
export type Role = (typeof ROLES)[number];
export const QN_CATS = [...CATS, 'any'] as const;

export interface QueryNetWeights {
  buckets: number;
  dim: number;
  /** int8 embedding table, base64, row-major [buckets × dim], scaled by `scale`. */
  emb: string;
  scale: number;
  roleW: number[]; // [roles × dim]
  roleB: number[];
  catW: number[]; // [cats × dim]
  catB: number[];
}

/** FNV-1a 32-bit. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Feature strings for the word at position i (shared with the Python trainer via exported examples). */
export function tokenFeatures(toks: string[], i: number): string[] {
  const t = toks[i];
  const f = [`w:${t}`, `s:${stem(t)}`, `p:${toks[i - 1] ?? '^'}`, `n:${toks[i + 1] ?? '$'}`, `pp:${toks[i - 2] ?? '^'}`, `l:${Math.min(t.length, 9)}`];
  if (i === 0) f.push('first');
  if (i === toks.length - 1) f.push('last');
  if (/\d/.test(t)) f.push('digit');
  const w = `<${t}>`;
  for (let n = 3; n <= 5; n++) for (let k = 0; k + n <= w.length; k++) f.push(`g:${w.slice(k, k + n)}`);
  return f;
}

export function featureIds(toks: string[], i: number, buckets: number): number[] {
  return tokenFeatures(toks, i).map((s) => hash(s) % buckets);
}

export interface ParsedQuery {
  tokens: string[];
  roles: Role[];
  /** Probability per QN_CATS entry. */
  cats: number[];
  name: string[];
  cue: string[];
  anchor: string[];
  nearMe: boolean;
}

export class QueryNet {
  private emb: Int8Array;
  constructor(private w: QueryNetWeights) {
    const bin = typeof atob === 'function' ? atob(w.emb) : Buffer.from(w.emb, 'base64').toString('binary');
    this.emb = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.emb[i] = (bin.charCodeAt(i) << 24) >> 24;
  }

  private tokenVec(toks: string[], i: number): Float32Array {
    const { dim, buckets, scale } = this.w;
    const v = new Float32Array(dim);
    const ids = featureIds(toks, i, buckets);
    for (const id of ids) {
      const o = id * dim;
      for (let d = 0; d < dim; d++) v[d] += this.emb[o + d];
    }
    const k = scale / ids.length;
    for (let d = 0; d < dim; d++) v[d] *= k;
    return v;
  }

  parse(query: string): ParsedQuery {
    const toks = tokens(query);
    const { dim } = this.w;
    const roles: Role[] = [];
    const sent = new Float32Array(dim);
    for (let i = 0; i < toks.length; i++) {
      const v = this.tokenVec(toks, i);
      for (let d = 0; d < dim; d++) sent[d] += v[d] / toks.length;
      roles.push(ROLES[argmax(affine(this.w.roleW, this.w.roleB, v))]);
    }
    const cats = softmax(affine(this.w.catW, this.w.catB, sent));
    return assemble(toks, roles, toks.length ? cats : QN_CATS.map((c) => (c === 'any' ? 1 : 0)));
  }
}

export function assemble(toks: string[], roles: Role[], cats: number[]): ParsedQuery {
  const name: string[] = [];
  const cue: string[] = [];
  const anchor: string[] = [];
  let nearMe = false;
  toks.forEach((t, i) => {
    const r = roles[i];
    if (r === 'name') name.push(t);
    else if (r === 'cue') cue.push(t);
    else if (r === 'anchor') anchor.push(t);
    else if (r === 'me') nearMe = true;
  });
  // An anchor without a name is really the thing searched for ("lângă Brașov" alone → Brașov).
  if (!name.length && !cue.length && anchor.length) name.push(...anchor.splice(0));
  return { tokens: toks, roles, cats, name, cue, anchor, nearMe };
}

function affine(W: number[], b: number[], v: Float32Array): number[] {
  const out = new Array<number>(b.length);
  const d = v.length;
  for (let r = 0; r < b.length; r++) {
    let s = b[r];
    for (let k = 0; k < d; k++) s += W[r * d + k] * v[k];
    out[r] = s;
  }
  return out;
}

function softmax(x: number[]): number[] {
  const m = Math.max(...x);
  const e = x.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function argmax(x: number[]): number {
  let b = 0;
  for (let i = 1; i < x.length; i++) if (x[i] > x[b]) b = i;
  return b;
}
