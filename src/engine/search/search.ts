/**
 * Search API: QueryNet → retrieval → RankNet. Runs in a worker (search.worker.ts)
 * in the app, and directly in Node for training and evaluation.
 */
import { CUES, ME_WORDS, NEAR_WORDS, type Cat, CATS } from './categories';
import { SearchIndex, kmBetween, type Entry, type SearchContext } from './engine';
import { QN_CATS, QueryNet, assemble, type ParsedQuery, type QueryNetWeights, type Role } from './queryNet';
import { RankNet, heuristicScore, type RankNetWeights } from './rankNet';
import { STOP, stem, tokens } from './text';

export interface SearchResult {
  id: number;
  name: string;
  cat: Cat;
  lng: number;
  lat: number;
  bbox: [number, number, number, number] | null;
  locality: string;
  county: string;
  osm: string;
  km: number;
  score: number;
}

export interface SearchOutput {
  results: SearchResult[];
  parsed: ParsedQuery;
  anchor: string | null;
  /** Best score margin; low values mean "not sure" (UI then also asks Photon). */
  confidence: number;
}

const CUE_WORDS = new Map<string, Cat[]>();
for (const [cat, words] of Object.entries(CUES)) {
  for (const w of words!) if (!w.includes(' ')) {
    const k = stem(w);
    CUE_WORDS.set(k, [...(CUE_WORDS.get(k) ?? []), cat as Cat]);
  }
}

/** Rule-based reading of a query: QueryNet's fallback and its training teacher for cue words. */
export function ruleParse(query: string): ParsedQuery {
  const toks = tokens(query);
  const roles: Role[] = [];
  const catVotes = new Array(QN_CATS.length).fill(0);
  let afterNear = false;
  toks.forEach((t, i) => {
    const s = stem(t);
    const next = toks[i + 1];
    if (ME_WORDS.includes(t) && (afterNear || i > 0)) return roles.push('me');
    if (NEAR_WORDS.includes(t) && next && !ME_WORDS.includes(next) && i > 0) {
      afterNear = true;
      return roles.push('near');
    }
    if (NEAR_WORDS.includes(t) && next && ME_WORDS.includes(next)) return roles.push('near');
    if (afterNear) return roles.push('anchor');
    const cats = CUE_WORDS.get(s);
    if (cats) {
      cats.forEach((c) => (catVotes[QN_CATS.indexOf(c)] += 1 / cats.length));
      return roles.push('cue');
    }
    if (STOP.has(t)) return roles.push('fill');
    roles.push('name');
  });
  const tot = catVotes.reduce((a, b) => a + b, 0);
  const cats = tot ? catVotes.map((v) => v / tot) : QN_CATS.map((c) => (c === 'any' ? 1 : 0));
  return assemble(toks, roles, cats);
}

export class SearchEngine {
  readonly index = new SearchIndex();
  private qn: QueryNet | null = null;
  private rn: RankNet | null = null;

  setModels(qn: QueryNetWeights | null, rn: RankNetWeights | null) {
    this.qn = qn ? new QueryNet(qn) : null;
    this.rn = rn ? new RankNet(rn) : null;
  }

  parse(query: string): ParsedQuery {
    let p = this.qn ? this.qn.parse(query) : ruleParse(query);
    // An "anchor" with no "near" word before it that is a known category word is a cue ("bran castle").
    if (this.qn && p.roles.includes('anchor') && !p.roles.includes('near')) {
      const roles = p.roles.map((r, i) => (r === 'anchor' && CUE_WORDS.has(stem(p.tokens[i])) ? 'cue' : r));
      if (roles.some((r, i) => r !== p.roles[i])) p = assemble(p.tokens, roles, p.cats);
    }
    // Keep the model honest on the easy part: a word that only works as a name stays a name.
    if (!p.name.length && !p.cue.length && !p.anchor.length && p.tokens.length) return ruleParse(query);
    // Known category words outrank the model's guess for what kind of place is wanted.
    if (this.qn && p.cue.length) {
      const votes = new Array(QN_CATS.length).fill(0);
      for (const t of p.cue) for (const c of CUE_WORDS.get(stem(t)) ?? []) votes[QN_CATS.indexOf(c)] += 1;
      const tot = votes.reduce((a, b) => a + b, 0);
      if (tot) p = assemble(p.tokens, p.roles, p.cats.map((v, i) => 0.3 * v + (0.7 * votes[i]) / tot));
    }
    // "lacuri lângă Brașov", "cabane near me": every "name" word is a category word → browse that category.
    if (p.name.length && (p.anchor.length || p.nearMe) && p.name.every((t) => CUE_WORDS.has(stem(t)))) {
      const roles = p.roles.map((r) => (r === 'name' ? 'cue' : r));
      const votes = new Array(QN_CATS.length).fill(0);
      for (const t of p.name) for (const c of CUE_WORDS.get(stem(t))!) votes[QN_CATS.indexOf(c)] += 1;
      const tot = votes.reduce((a, b) => a + b, 0);
      p = assemble(p.tokens, roles, votes.map((v) => v / tot));
    }
    return p;
  }

  search(query: string, ctx: SearchContext, limit = 12): SearchOutput {
    const parsed = this.parse(query);
    const cands = this.index.candidates(parsed, ctx, query);
    for (const c of cands) c.score = this.rn ? this.rn.score(c.f) : heuristicScore(c.f);
    cands.sort((a, b) => b.score! - a.score!);
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (const c of cands) {
      const e = c.e;
      // Collapse near-duplicates (same name, same place).
      const key = `${e.name.toLowerCase()}|${Math.round(e.lng * 50)}|${Math.round(e.lat * 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(toResult(e, c.score!, ctx));
      if (out.length >= limit) break;
    }
    const confidence = cands.length > 1 ? cands[0].score! - cands[1].score! : cands.length ? 5 : 0;
    const anchorEntry = this.index.resolveAnchor(parsed.anchor, ctx);
    return { results: out, parsed, anchor: anchorEntry?.name ?? null, confidence };
  }

  /** Best places of given categories around a point (category chips). */
  browse(cats: Cat[], ctx: SearchContext, limit = 20): SearchResult[] {
    const ids = this.index.near(ctx.focus, 25);
    const set = new Set(cats);
    return ids
      .map((id) => this.index.entries[id])
      .filter((e) => set.has(e.cat))
      .map((e) => ({ e, s: e.imp / 25 - Math.log10(1 + kmBetween(ctx.focus, [e.lng, e.lat])) * 2 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ e, s }) => toResult(e, s, ctx));
  }
}

function toResult(e: Entry, score: number, ctx: SearchContext): SearchResult {
  return {
    id: e.id, name: e.name, cat: e.cat, lng: e.lng, lat: e.lat, bbox: e.bbox, locality: e.locality, county: e.county,
    osm: e.osm, km: kmBetween(ctx.focus, [e.lng, e.lat]), score,
  };
}

export { CATS };
