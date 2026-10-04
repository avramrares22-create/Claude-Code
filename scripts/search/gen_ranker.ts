/**
 * Generates listwise training data for RankNet: synthetic queries for known
 * targets, run through the real pipeline (QueryNet + retrieval + features).
 *
 *   npx tsx scripts/search/gen_ranker.ts > /tmp/claude-0/search/rank.jsonl
 */
import { CUES, type Cat } from '../../src/engine/search/categories';
import { BRASOV, kmBetween, type Entry } from '../../src/engine/search/engine';
import { heuristicScore } from '../../src/engine/search/rankNet';
import { stem, tokens } from '../../src/engine/search/text';
import { loadEngine } from './load';

const N = Number(process.env.RN_N ?? 40000);
let seed = 777;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const se = loadEngine();
const E = se.index.entries.filter((e) => e.name.length >= 3);
// People search for well-known places far more than obscure ones: weight grows exponentially with importance.
const w = E.map((e) => Math.exp((e.imp + (e.cat === 'street' ? 18 : 0)) / 10) * (e.county === 'Brașov' || kmBetween([e.lng, e.lat], BRASOV) < 35 ? 3 : 1));
const cum: number[] = [];
w.reduce((a, b, i) => (cum[i] = a + b), 0);
const total = cum[cum.length - 1];
function sample(): Entry {
  const r = rnd() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m] < r) lo = m + 1;
    else hi = m;
  }
  return E[lo];
}
const EN: Partial<Record<Cat, string[]>> = {
  lake: ['lake'], peak: ['peak'], hut: ['hut'], waterfall: ['waterfall'], cave: ['cave'], castle: ['castle'], church: ['church', 'monastery'],
  trail: ['trail'], gorge: ['gorge'], river: ['river'], village: ['village'], street: ['street'], ski: ['ski slope'], park: ['park'],
};
const PLURAL: Partial<Record<Cat, string[]>> = {
  lake: ['lacuri', 'lakes'], peak: ['varfuri', 'peaks'], hut: ['cabane', 'huts'], waterfall: ['cascade', 'waterfalls'], cave: ['pesteri', 'caves'],
  castle: ['cetati', 'castles'], trail: ['trasee', 'trails'], spring: ['izvoare', 'springs'], viewpoint: ['belvedere', 'viewpoints'],
  camp: ['camping', 'campsites'], food: ['restaurante', 'restaurants'], lodging: ['pensiuni', 'hotels'], church: ['manastiri', 'churches'],
};
function typo(t: string): string {
  if (t.length < 5) return t;
  const i = 1 + Math.floor(rnd() * (t.length - 2));
  return rnd() < 0.5 ? t.slice(0, i) + t.slice(i + 1) : t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2);
}
function jitter(p: [number, number], km: number): [number, number] {
  const a = rnd() * 2 * Math.PI;
  const r = km * Math.sqrt(rnd());
  return [p[0] + (r * Math.cos(a)) / (111.32 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (r * Math.sin(a)) / 111.32];
}
const randomRomania = (): [number, number] => [22 + rnd() * 6, 44.3 + rnd() * 3.3];

let kept = 0, missed = 0;
for (let n = 0; n < N; n++) {
  let q: string;
  let ctx: { focus: [number, number]; focusIsUser?: boolean };
  let label: (e: Entry) => number;
  if (rnd() < 0.12) {
    // Category browse: "lacuri langa brasov", "huts near me".
    const cat = pick(Object.keys(PLURAL) as Cat[]);
    const word = pick([...(PLURAL[cat] ?? []), ...(CUES[cat] ?? []).slice(0, 2)]);
    const place = sample();
    const nearMe = rnd() < 0.4;
    const anchorName = place.locality.split(', ').pop() || place.name;
    q = nearMe ? `${word} ${pick(['langa mine', 'near me', 'nearby', 'in apropiere'])}` : `${word} ${pick(['langa', 'near', 'in', 'la'])} ${anchorName}`;
    const center: [number, number] = nearMe ? jitter([place.lng, place.lat], 3) : [place.lng, place.lat];
    ctx = { focus: nearMe ? center : rnd() < 0.6 ? jitter(BRASOV, 20) : randomRomania(), focusIsUser: nearMe };
    label = (e) => (e.cat === cat ? Math.exp(e.imp / 15 - kmBetween([e.lng, e.lat], center) / 6) : 0);
  } else {
    const t = sample();
    const own = new Set((CUES[t.cat] ?? []).map(stem));
    let toks = tokens(t.name);
    if (toks.length > 1 && rnd() < 0.35) {
      const stripped = toks.filter((x) => !own.has(stem(x)));
      if (stripped.length) toks = stripped;
    }
    if (!toks.length) continue;
    if (toks.length > 2 && rnd() < 0.15) toks.splice(Math.floor(rnd() * toks.length), 1);
    toks = toks.map((x) => (rnd() < 0.04 ? typo(x) : x));
    let typing = false;
    if (rnd() < 0.1 && toks[toks.length - 1].length > 4) {
      const l = toks[toks.length - 1];
      toks[toks.length - 1] = l.slice(0, 2 + Math.floor(rnd() * (l.length - 2)));
      typing = true;
    }
    if (rnd() < 0.3) {
      const cues = rnd() < 0.4 ? EN[t.cat] : CUES[t.cat];
      if (cues?.length) toks = rnd() < 0.5 ? [...tokens(pick(cues)), ...toks] : [...toks, ...tokens(pick(cues))];
    }
    if (rnd() < 0.08) toks = [...tokens(pick(['unde e', 'where is', 'how to get to', 'cum ajung la'])), ...toks];
    const loc = t.locality.split(', ').pop();
    const r = rnd();
    let nearMe = false;
    if (r < 0.12 && loc) toks = [...toks, pick(['langa', 'near', 'in']), ...tokens(loc)];
    else if (r < 0.18 && loc) toks = [...toks, ...tokens(loc)];
    else if (r < 0.22) {
      toks = [...toks, ...tokens(pick(['langa mine', 'near me', 'nearby']))];
      nearMe = true;
    }
    q = toks.join(' ') + (typing ? '' : ' ');
    const fr = rnd();
    const focus = nearMe ? jitter([t.lng, t.lat], 8) : fr < 0.55 ? jitter(BRASOV, 25) : fr < 0.8 ? jitter([t.lng, t.lat], 30) : randomRomania();
    ctx = { focus, focusIsUser: nearMe };
    const tn = t.name.toLowerCase();
    label = (e) => (e.id === t.id || (e.name.toLowerCase() === tn && e.cat === t.cat && kmBetween([e.lng, e.lat], [t.lng, t.lat]) < 2) ? 1 : 0);
  }
  const parsed = se.parse(q);
  const cands = se.index.candidates(parsed, ctx, q);
  if (!cands.length) {
    missed++;
    continue;
  }
  const ys = cands.map((c) => label(c.e));
  if (!ys.some((y) => y > 0)) {
    missed++;
    continue;
  }
  // Keep the hardest 80 by the hand-set score plus every positive.
  const order = cands.map((c, i) => [heuristicScore(c.f), i] as const).sort((a, b) => b[0] - a[0]);
  const keep = new Set(order.slice(0, 80).map(([, i]) => i));
  ys.forEach((y, i) => y > 0 && keep.add(i));
  const idx = [...keep];
  const ysum = idx.reduce((a, i) => a + ys[i], 0);
  process.stdout.write(JSON.stringify({ q, f: idx.map((i) => cands[i].f.map((v) => Math.round(v * 1e4) / 1e4)), h: idx.map((i) => Math.round(heuristicScore(cands[i].f) * 1e4) / 1e4), y: idx.map((i) => ys[i] / ysum) }) + '\n');
  kept++;
}
process.stderr.write(`kept ${kept}, target not retrieved ${missed} (recall ${(kept / (kept + missed)).toFixed(3)})\n`);
