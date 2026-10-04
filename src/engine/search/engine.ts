/**
 * Offline place search over the Romania gazetteer (data/search/*).
 *
 * Pipeline per query:
 *  1. QueryNet reads the query: name words, category cues, "near X", "near me".
 *  2. Retrieval: exact/stemmed tokens, prefixes (while typing) and typo-tolerant
 *     matches from a trigram index; category browsing around an anchor or the
 *     map when there is no name.
 *  3. RankNet (small MLP) scores each candidate from 59 features: name match,
 *     category fit, importance, distance to the anchor / map / you, Brașov focus.
 */
import { CATS, CUES, type Cat } from './categories';
import { QN_CATS, type ParsedQuery } from './queryNet';
import { editDistance, fold, stem, tokenMatch, tokens, trigrams } from './text';

export interface CoreFile {
  v: number;
  cats: string[];
  ctx: Array<[string, string]>;
  e: Row[];
}
/** [name, alt, cat, x, y, imp, ctx, bbox, osm] — see build_gazetteer.py */
export type Row = [string, string, number, number, number, number, number, number[] | 0, string];

export interface Entry {
  id: number;
  name: string;
  alt: string[];
  cat: Cat;
  lng: number;
  lat: number;
  imp: number;
  locality: string;
  county: string;
  bbox: [number, number, number, number] | null;
  osm: string;
  /** Distinctive name tokens (category words removed), stemmed. */
  core: string[];
  /** All name tokens, stemmed (primary name first, then alternatives). */
  names: string[][];
  /** Name words as written (folded, not stemmed). */
  surface: Set<string>;
}

export interface SearchContext {
  /** Map centre or user position used for "nearby" relevance. */
  focus: [number, number];
  /** True when the focus is the user's GPS position. */
  focusIsUser?: boolean;
}

export interface Candidate {
  e: Entry;
  f: number[];
  retrieval: number;
  score?: number;
}

const GENERIC = new Set<string>();
for (const words of Object.values(CUES)) for (const w of words!) for (const t of w.split(' ')) GENERIC.add(stem(t));
for (const w of ['de', 'la', 'din', 'lui', 'si', 'cu', 'mare', 'mic', 'mica', 'vf', 'sf', 'nr']) GENERIC.add(w);
// Words that are cue words but usually part of proper names.
for (const w of ['centru', 'top', 'apa', 'zona', 'turistic', 'national', 'bus', 'train']) GENERIC.delete(w);

export const BRASOV: [number, number] = [25.5887, 45.6427];
export const FEATURES = [
  'nameCover', 'nameCoverPlain', 'entityCover', 'exactName', 'exactFull', 'prefixName', 'minMatch', 'altOnly',
  'cueInName', 'catProb', 'catAny', 'catProbCue', 'importance', 'hasAnchor', 'dAnchor', 'inAnchor', 'dFocus',
  'nearMeDist', 'brasov', 'brasovFocus', 'extraTokens', 'nameLen', 'typing', 'allCover', 'allExact', 'surfaceExact',
  ...CATS.map((c) => `cat_${c}`),
];

export function kmBetween(a: [number, number], b: [number, number]): number {
  const kx = 111.32 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.32);
}

export class SearchIndex {
  readonly entries: Entry[] = [];
  private post = new Map<string, number[]>();
  private vocab: string[] = [];
  private vocabSorted = false;
  private tri = new Map<string, string[]>();
  private grid = new Map<string, number[]>();
  private df = new Map<string, number>();
  private loadedShards = new Set<string>();

  addCore(core: CoreFile) {
    this.addRows(core.e, core.ctx);
  }

  addShard(key: string, rows: Row[], ctx: Array<[string, string]>) {
    if (this.loadedShards.has(key)) return;
    this.loadedShards.add(key);
    this.addRows(rows, ctx);
  }

  hasShard(key: string) {
    return this.loadedShards.has(key);
  }

  private addRows(rows: Row[], ctx: Array<[string, string]>) {
    for (const r of rows) {
      const id = this.entries.length;
      const alt = r[1] ? r[1].split('|') : [];
      const names = [r[0], ...alt].map((n) => tokens(n).map(stem)).filter((t) => t.length);
      if (!names.length) continue;
      const core = names[0].filter((t) => !GENERIC.has(t));
      const [locality, county] = ctx[r[6]] ?? ['', ''];
      const bb = r[7] ? (r[7] as number[]).map((v) => v / 1e5) : null;
      const e: Entry = {
        id, name: r[0], alt, cat: (CATS[r[2]] ?? 'other') as Cat, lng: r[3] / 1e5, lat: r[4] / 1e5, imp: r[5],
        locality, county, bbox: bb as Entry['bbox'], osm: r[8], core: core.length ? core : names[0], names,
        surface: new Set([r[0], ...alt].flatMap((n) => tokens(n))),
      };
      this.entries.push(e);
      const seen = new Set<string>();
      // A name made only of generic words ("Cabana", "Lac") is not searchable by name; browsing still finds it.
      const settlement = e.cat === 'city' || e.cat === 'town' || e.cat === 'village' || e.cat === 'district';
      names.forEach((ns, k) => {
        if (k === 0 && !settlement && ns.every((t) => GENERIC.has(t))) return;
        for (const t of ns) seen.add(t);
      });
      for (const t of seen) {
        let p = this.post.get(t);
        if (!p) {
          p = [];
          this.post.set(t, p);
          this.vocab.push(t);
          this.vocabSorted = false;
          if (t.length >= 4) for (const g of trigrams(t)) {
            let l = this.tri.get(g);
            if (!l) this.tri.set(g, (l = []));
            l.push(t);
          }
        }
        p.push(id);
        this.df.set(t, (this.df.get(t) ?? 0) + 1);
      }
      const gk = `${Math.floor(e.lng * 10)}:${Math.floor(e.lat * 10)}`;
      let g = this.grid.get(gk);
      if (!g) this.grid.set(gk, (g = []));
      g.push(id);
    }
  }

  private idf(t: string): number {
    return Math.log(1 + this.entries.length / (1 + (this.df.get(t) ?? 0)));
  }

  /** Vocabulary tokens that match a query token: exact/stem, prefix (typing), typos. */
  expand(q: string, typing: boolean): Array<[string, number]> {
    const out = new Map<string, number>();
    const s = stem(q);
    if (this.post.has(s)) out.set(s, 1);
    if (this.post.has(q)) out.set(q, 1);
    if (q.length >= 2 && (typing || q.length >= 3)) {
      if (!this.vocabSorted) {
        this.vocab.sort();
        this.vocabSorted = true;
      }
      let lo = 0;
      let hi = this.vocab.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (this.vocab[m] < q) lo = m + 1;
        else hi = m;
      }
      for (let i = lo, n = 0; i < this.vocab.length && this.vocab[i].startsWith(q) && n < (typing ? 60 : 20); i++, n++) {
        const t = this.vocab[i];
        if (!out.has(t)) out.set(t, tokenMatch(q, t));
      }
    }
    if (q.length >= 4) {
      const counts = new Map<string, number>();
      for (const g of trigrams(q)) for (const t of this.tri.get(g) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      const qn = trigrams(q).size;
      const best = [...counts].filter(([t, c]) => c >= Math.max(2, qn * 0.35) && Math.abs(t.length - q.length) <= 3).sort((a, b) => b[1] - a[1]).slice(0, 40);
      for (const [t] of best) {
        if (out.has(t)) continue;
        const m = tokenMatch(q, t);
        if (m > 0) out.set(t, m);
      }
    }
    return [...out];
  }

  /** Entities near a point (within ~radiusKm), for browsing a category. */
  near(p: [number, number], radiusKm: number): number[] {
    const r = Math.ceil(radiusKm / 8);
    const cx = Math.floor(p[0] * 10);
    const cy = Math.floor(p[1] * 10);
    const out: number[] = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const g = this.grid.get(`${cx + dx}:${cy + dy}`);
      if (g) for (const id of g) out.push(id);
    }
    return out;
  }

  /** Name retrieval: entity ids with an accumulated, IDF-weighted match score. */
  retrieve(words: string[], typingLast: boolean, limit = 400): Map<number, number> {
    const acc = new Map<number, number>();
    words.forEach((q, i) => {
      const typing = typingLast && i === words.length - 1;
      const w = this.idf(stem(q)) || 4;
      const seen = new Map<number, number>();
      for (const [t, m] of this.expand(q, typing)) {
        const p = this.post.get(t);
        if (!p || p.length > 20000) continue;
        for (const id of p) if ((seen.get(id) ?? 0) < m) seen.set(id, m);
      }
      for (const [id, m] of seen) acc.set(id, (acc.get(id) ?? 0) + m * Math.max(1, w));
    });
    if (acc.size <= limit) return acc;
    // Keep the best by retrieval score with an importance tiebreak.
    const top = [...acc].sort((a, b) => b[1] - a[1] || this.entries[b[0]].imp - this.entries[a[0]].imp).slice(0, limit);
    return new Map(top);
  }

  /** Resolves "near X" to a place (settlement, district, massif, lake…). */
  resolveAnchor(words: string[], ctx: SearchContext): Entry | null {
    if (!words.length) return null;
    const hits = this.retrieve(words, false, 200);
    let best: Entry | null = null;
    let bestScore = -Infinity;
    for (const [id, r] of hits) {
      const e = this.entries[id];
      const placeBonus = { city: 3, town: 2.5, village: 1.2, district: 1.5, park: 1.5, ridge: 1, peak: 1, lake: 1, street: -3 }[e.cat as string] ?? 0;
      const full = coverage(words, e.names) >= 0.99 ? 3 : 0;
      const s = r + full + placeBonus + e.imp / 20 - Math.log10(1 + kmBetween(ctx.focus, [e.lng, e.lat])) * 0.6;
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    return best;
  }

  /** Candidates with features for a parsed query. */
  candidates(q: ParsedQuery, ctx: SearchContext, rawQuery: string): Candidate[] {
    const typing = !/\s$/.test(rawQuery);
    const anchor = this.resolveAnchor(q.anchor, ctx);
    const matchWords = q.name.length ? q.name : q.cue;
    const content = contentWords(q);
    const cands = new Map<number, number>();
    if (matchWords.length) for (const [id, s] of this.retrieve(matchWords, typing)) cands.set(id, s);
    // Safety net for misread queries ("poiana brasov" is a place, not "meadow near Brașov").
    if (content.length > matchWords.length) for (const [id, s] of this.retrieve(content, typing, 200)) if (!cands.has(id)) cands.set(id, s * 0.8);
    // Category browsing ("lakes near Brașov", "cabana", "waterfall near me").
    const catTop = topCats(q.cats);
    if ((!q.name.length && q.cue.length) || ((anchor || q.nearMe) && catTop.length)) {
      const center = anchor ? ([anchor.lng, anchor.lat] as [number, number]) : ctx.focus;
      for (const id of this.near(center, anchor && (anchor.cat === 'city' || anchor.cat === 'park') ? 30 : 20)) {
        const e = this.entries[id];
        if (catTop.includes(e.cat) && !cands.has(id)) cands.set(id, 0);
      }
    }
    // Pure category queries ("cabane lângă Bușteni"): only that kind of place, unless a name matches exactly.
    const strictCats = !q.name.length && q.cue.length && catTop.length ? new Set<Cat>(catTop) : null;
    const out: Candidate[] = [];
    for (const [id, r] of cands) {
      const e = this.entries[id];
      if (anchor && e.id === anchor.id && q.name.length === 0) continue;
      if (strictCats && !strictCats.has(e.cat) && coverage(content, e.names) < 0.99) continue;
      out.push({ e, retrieval: r, f: this.features(e, q, ctx, anchor, matchWords, typing, content) });
    }
    return out;
  }

  features(e: Entry, q: ParsedQuery, ctx: SearchContext, anchor: Entry | null, words: string[], typing: boolean, content: string[] = words): number[] {
    // Name match against the best of the entity's names.
    let bestCover = 0;
    let bestPlain = 0;
    let bestMin = 0;
    let bestIdx = 0;
    let bestEnt = 0;
    e.names.forEach((nameToks, idx) => {
      let wsum = 0;
      let wtot = 0;
      let plain = 0;
      let min = 1;
      const used = new Set<number>();
      words.forEach((w, i) => {
        const last = typing && i === words.length - 1;
        let m = 0;
        let mj = -1;
        nameToks.forEach((n, j) => {
          const v = last && n.startsWith(w) ? Math.max(tokenMatch(w, n), 0.9) : tokenMatch(w, n);
          if (v > m) {
            m = v;
            mj = j;
          }
        });
        if (mj >= 0) used.add(mj);
        const idf = this.idf(stem(w));
        wsum += m * idf;
        wtot += idf;
        plain += m;
        min = Math.min(min, m);
      });
      const cover = wtot ? wsum / wtot : 0;
      const distinct = nameToks.filter((t) => !GENERIC.has(t));
      const ent = distinct.length ? distinct.filter((t) => [...used].some((j) => nameToks[j] === t)).length / distinct.length : used.size ? 1 : 0;
      if (cover > bestCover || (cover === bestCover && ent > bestEnt)) {
        bestCover = cover;
        bestPlain = words.length ? plain / words.length : 0;
        bestMin = words.length ? min : 0;
        bestIdx = idx;
        bestEnt = ent;
      }
    });
    const qName = words.join(' ');
    const coreStr = e.core.join(' ');
    const fullStr = e.names[bestIdx].join(' ');
    const qStem = words.map(stem).join(' ');
    const qFull = [...q.cue, ...q.name].map(stem).join(' ');
    const cueStems = q.cue.map(stem);
    const cueInName = cueStems.some((c) => e.names[0].includes(c) || [...e.names[0]].some((t) => editDistance(c, t, 1) <= 1 && c.length >= 4)) ? 1 : 0;
    const ci = QN_CATS.indexOf(e.cat);
    const catProb = q.cats[ci] ?? 0;
    const catAny = q.cats[q.cats.length - 1] ?? 0;
    const p: [number, number] = [e.lng, e.lat];
    const dA = anchor ? kmBetween(p, [anchor.lng, anchor.lat]) : 0;
    const inA = anchor?.bbox ? (e.lng >= anchor.bbox[0] && e.lng <= anchor.bbox[2] && e.lat >= anchor.bbox[1] && e.lat <= anchor.bbox[3] ? 1 : 0) : anchor && dA < 5 ? 1 : 0;
    const dF = kmBetween(p, ctx.focus);
    const brasov = e.county === 'Brașov' || kmBetween(p, BRASOV) < 35 ? 1 : 0;
    const focusBv = kmBetween(ctx.focus, BRASOV) < 50 ? 1 : 0;
    const extra = Math.min(1, Math.max(0, e.core.length - words.filter((w) => e.core.some((c) => tokenMatch(w, c) > 0)).length) / 4);
    const f = [
      bestCover,
      bestPlain,
      bestEnt,
      qStem && (qStem === coreStr || qStem === fullStr) ? 1 : 0,
      qFull && qFull === fullStr ? 1 : 0,
      qStem && (coreStr.startsWith(qStem) || fullStr.startsWith(qStem)) ? 1 : 0,
      bestMin,
      bestIdx > 0 ? 1 : 0,
      cueInName,
      catProb,
      catAny,
      cueStems.length ? catProb : 0,
      e.imp / 100,
      anchor ? 1 : 0,
      anchor ? Math.log10(1 + dA) / 3 : 0,
      inA,
      Math.log10(1 + dF) / 3,
      q.nearMe ? Math.log10(1 + dF) / 3 : 0,
      brasov,
      brasov * focusBv,
      extra,
      Math.min(1, e.names[0].length / 6),
      typing && words.length && !e.names[bestIdx].includes(stem(words[words.length - 1])) ? 1 : 0,
    ];
    const allCover = content.length > words.length ? coverage(content, e.names) : bestPlain;
    f.push(allCover, allCover >= 0.99 && e.names.some((n) => n.length === content.length) ? 1 : 0);
    // Words typed exactly as written in the name (no stemming, no typo tolerance).
    const surf = e.surface;
    f.push(content.length ? content.filter((w) => surf.has(w)).length / content.length : 0);
    for (let i = 0; i < CATS.length; i++) f.push(CATS[i] === e.cat ? 1 : 0);
    void qName;
    return f;
  }
}

/** Every meaningful word of the query: name, category and anchor words (not filler / near / me). */
export function contentWords(q: ParsedQuery): string[] {
  return q.tokens.filter((_, i) => q.roles[i] === 'name' || q.roles[i] === 'cue' || q.roles[i] === 'anchor');
}

function coverage(words: string[], names: string[][]): number {
  let best = 0;
  for (const n of names) {
    const c = words.filter((w) => n.some((t) => tokenMatch(w, t) >= 0.8)).length / words.length;
    best = Math.max(best, c);
  }
  return best;
}

/** Categories the query plausibly asks for (prob ≥ 0.12), excluding "any". */
export function topCats(p: number[]): Cat[] {
  const out: Cat[] = [];
  for (let i = 0; i < CATS.length; i++) if (p[i] >= 0.12) out.push(CATS[i]);
  return out;
}

export { fold };
