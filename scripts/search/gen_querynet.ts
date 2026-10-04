/**
 * Generates labelled training queries for QueryNet from the gazetteer.
 * Each example: hashed features per word, the word's role and the query's category.
 *
 *   npx tsx scripts/search/gen_querynet.ts > /tmp/claude-0/search/qn.jsonl
 */
import { CATS, CUES, ME_WORDS, type Cat } from '../../src/engine/search/categories';
import { BRASOV, kmBetween, type Entry } from '../../src/engine/search/engine';
import { QN_CATS, ROLES, featureIds, type Role } from '../../src/engine/search/queryNet';
import { stem, tokens } from '../../src/engine/search/text';
import { loadEngine } from './load';

const BUCKETS = Number(process.env.QN_BUCKETS ?? 16384);
const N = Number(process.env.QN_N ?? 260000);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const se = loadEngine({ models: false });
const E = se.index.entries.filter((e) => e.name.length >= 3);

// Sampling weights: importance, Brașov ×4, streets rarer.
const w = E.map((e) => (e.imp + 5) * (e.county === 'Brașov' || kmBetween([e.lng, e.lat], BRASOV) < 35 ? 4 : 1) * (e.cat === 'street' ? 0.35 : 1));
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

const cueStems = new Map<Cat, Set<string>>();
for (const c of CATS) cueStems.set(c, new Set((CUES[c] ?? []).flatMap((x) => x.split(' ')).map(stem)));
const allCue = new Set([...cueStems.values()].flatMap((s) => [...s]));

const EN_CUE: Partial<Record<Cat, string[]>> = {
  lake: ['lake'], peak: ['peak', 'summit', 'mount'], hut: ['hut', 'chalet', 'refuge'], waterfall: ['waterfall', 'falls'],
  cave: ['cave'], gorge: ['gorge', 'canyon'], castle: ['castle', 'fortress', 'citadel'], church: ['church', 'monastery'],
  river: ['river', 'stream'], spring: ['spring'], viewpoint: ['viewpoint'], park: ['park'], ski: ['ski slope', 'cable car'],
  trail: ['trail', 'hiking trail', 'route'], street: ['street'], village: ['village'], city: ['city'], town: ['town'],
  lodging: ['hotel', 'guesthouse'], camp: ['campsite', 'camping'], saddle: ['pass', 'saddle'], ridge: ['ridge'],
  valley: ['valley'], forest: ['forest'], meadow: ['meadow'], food: ['restaurant', 'cafe'], station: ['station', 'train station'],
  district: ['neighbourhood', 'district'], attraction: ['museum', 'attraction'], monument: ['monument', 'ruins'],
};
const RO_CUE_PLURAL: Partial<Record<Cat, string[]>> = {
  lake: ['lacuri'], peak: ['varfuri', 'munti'], hut: ['cabane', 'refugii'], waterfall: ['cascade'], cave: ['pesteri'],
  castle: ['cetati', 'castele'], church: ['biserici', 'manastiri'], trail: ['trasee'], ski: ['partii'], spring: ['izvoare'],
  meadow: ['poieni'], lodging: ['pensiuni', 'hoteluri'], camp: ['campinguri'], food: ['restaurante'], viewpoint: ['belvederi'],
};
const EN_PLURAL: Partial<Record<Cat, string[]>> = {
  lake: ['lakes'], peak: ['peaks', 'mountains'], hut: ['huts'], waterfall: ['waterfalls'], cave: ['caves'], castle: ['castles'],
  trail: ['trails', 'hikes', 'hiking trails'], ski: ['ski slopes'], spring: ['springs'], viewpoint: ['viewpoints'], camp: ['campsites'],
  food: ['restaurants'], lodging: ['hotels'], church: ['monasteries', 'churches'],
};
const ACTIVITY: Array<[string, Cat]> = [
  ['unde pot sa inot', 'lake'], ['where to swim', 'lake'], ['unde dorm', 'hut'], ['where to sleep', 'hut'], ['unde mananc', 'food'],
  ['where to eat', 'food'], ['apa potabila', 'spring'], ['drinking water', 'spring'], ['priveliste frumoasa', 'viewpoint'],
  ['nice view', 'viewpoint'], ['unde schiez', 'ski'], ['where to ski', 'ski'], ['loc de cort', 'camp'], ['where to camp', 'camp'],
  ['urcare pe munte', 'peak'], ['mountain top', 'peak'], ['unde pot dormi', 'hut'], ['unde pot sa dorm', 'hut'], ['cazare', 'lodging'],
  ['unde pot manca', 'food'], ['ceva de mancare', 'food'], ['loc de picnic', 'camp'], ['plimbare usoara', 'trail'], ['easy hike', 'trail'],
  ['unde vad ursi', 'viewpoint'], ['sunset spot', 'viewpoint'], ['apa de baut', 'spring'], ['benzinarie', 'other'], ['gas station', 'other'],
];
const FILL_PRE = [
  'unde e', 'unde este', 'unde se afla', 'where is', 'where is the', 'how to get to', 'how do i get to', 'how can i get to', 'how far is',
  'cum ajung la', 'cum ajung', 'cum se ajunge la', 'drum spre', 'directions to', 'show', 'show me', 'find', 'vreau sa merg la',
  'vreau la', 'take me to', 'du ma la', 'navigate to', 'go to', 'mergem la', 'unde gasesc', 'where can i find', 'the',
];
const NEAR_RO = ['langa', 'aproape de', 'in', 'la', 'din zona', 'in zona'];
const NEAR_EN = ['near', 'around', 'in', 'close to', 'by'];
const ME_PHR: Array<[string[], Role[]]> = [
  [['langa', 'mine'], ['near', 'me']], [['aproape', 'de', 'mine'], ['near', 'fill', 'me']], [['near', 'me'], ['near', 'me']],
  [['nearby'], ['me']], [['in', 'apropiere'], ['near', 'me']], [['around', 'me'], ['near', 'me']], [['aici'], ['me']], [['close', 'to', 'me'], ['near', 'fill', 'me']],
];

function typo(t: string): string {
  if (t.length < 5) return t;
  const i = 1 + Math.floor(rnd() * (t.length - 2));
  const k = rnd();
  const ch = 'aeioulrstnmcp'[Math.floor(rnd() * 13)];
  if (k < 0.3) return t.slice(0, i) + t.slice(i + 1); // deletion
  if (k < 0.55) return t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2); // swap
  if (k < 0.8) return t.slice(0, i) + ch + t.slice(i + 1); // substitution
  return t.slice(0, i) + ch + t.slice(i); // insertion
}

const ME_SET = new Set(ME_WORDS);
function out(toks: string[], roles: Role[], cat: string) {
  if (!toks.length) return;
  const f = toks.map((_, i) => featureIds(toks, i, BUCKETS));
  process.stdout.write(JSON.stringify({ t: toks, f, r: roles.map((r) => ROLES.indexOf(r)), c: QN_CATS.indexOf(cat as (typeof QN_CATS)[number]) }) + '\n');
}

for (let n = 0; n < N; n++) {
  const kind = rnd();
  if (kind < 0.14) {
    // Category-only query ("lacuri langa brasov", "waterfalls near me", "cabana").
    const cat = pick(['lake', 'peak', 'hut', 'waterfall', 'cave', 'castle', 'trail', 'ski', 'spring', 'viewpoint', 'camp', 'food', 'lodging', 'church', 'gorge', 'park', 'meadow', 'saddle', 'ridge', 'river', 'valley', 'forest', 'station', 'parking', 'health', 'attraction', 'monument', 'shop', 'sport', 'village'] as Cat[]);
    const en = rnd() < 0.4;
    const words = (en ? [...(EN_PLURAL[cat] ?? []), ...(EN_CUE[cat] ?? [])] : [...(RO_CUE_PLURAL[cat] ?? []), ...(CUES[cat] ?? [])]).filter(Boolean);
    let toks = tokens(pick(words.length ? words : [cat]));
    if (rnd() < 0.12) toks = toks.map(typo);
    const roles: Role[] = toks.map(() => 'cue');
    const r = rnd();
    if (r < 0.45) {
      const place = sample();
      const anchor = tokens(place.locality.split(', ').pop() || place.name);
      const near = tokens(pick(en ? NEAR_EN : NEAR_RO));
      out([...toks, ...near, ...anchor], [...roles, ...near.map((_, i) => (i === 0 ? 'near' : 'fill') as Role), ...anchor.map(() => 'anchor' as Role)], cat);
    } else if (r < 0.75) {
      const [m, mr] = pick(ME_PHR);
      out([...toks, ...m], [...roles, ...mr], cat);
    } else if (r < 0.87) {
      const [a, c] = pick(ACTIVITY);
      const at = tokens(a);
      out(at, at.map((t) => (allCue.has(stem(t)) || /inot|swim|dorm|sleep|manan|eat|schi|ski|cort|camp|view|priv|apa|water|top|urc/.test(t) ? 'cue' : 'fill') as Role), c);
    } else out(toks, roles, cat);
    continue;
  }
  const e = sample();
  const nameToks = tokens(e.name);
  if (!nameToks.length) continue;
  const own = cueStems.get(e.cat)!;
  let toks: string[] = [];
  let roles: Role[] = [];
  let hasCue = false;
  // Name words; the entity's own category words inside the name are cues ("Lacul", "Cabana").
  let dropCue = rnd() < 0.35;
  for (const t of nameToks) {
    const isCue = own.has(stem(t)) && nameToks.length > 1;
    if (isCue && dropCue) continue;
    toks.push(t);
    roles.push(isCue ? 'cue' : t === 'de' || t === 'la' || t === 'lui' || t === 'din' ? 'name' : 'name');
    if (isCue) hasCue = true;
  }
  if (!toks.length) {
    toks = nameToks;
    roles = nameToks.map(() => 'name');
  }
  // Partial names and typing.
  if (toks.length > 2 && rnd() < 0.2) {
    const k = Math.floor(rnd() * toks.length);
    if (roles[k] === 'name' && roles.filter((r) => r === 'name').length > 1) {
      toks.splice(k, 1);
      roles.splice(k, 1);
    }
  }
  toks = toks.map((t, i) => (roles[i] === 'name' && rnd() < 0.12 ? typo(t) : roles[i] === 'cue' && rnd() < 0.2 ? typo(t) : t));
  if (rnd() < 0.15) {
    const last = toks[toks.length - 1];
    if (last.length > 4) toks[toks.length - 1] = last.slice(0, 2 + Math.floor(rnd() * (last.length - 2)));
  }
  // Add a category word if the name had none (RO or EN, before or after).
  if (!hasCue && rnd() < 0.5) {
    const en = rnd() < 0.4;
    const cand = en ? EN_CUE[e.cat] : CUES[e.cat];
    if (cand?.length) {
      const c = tokens(pick(cand));
      hasCue = true;
      if (en && rnd() < 0.6) {
        toks = [...toks, ...c];
        roles = [...roles, ...c.map(() => 'cue' as Role)];
      } else {
        toks = [...c, ...toks];
        roles = [...c.map(() => 'cue' as Role), ...roles];
      }
    }
  }
  // Filler, anchor, near me.
  const r = rnd();
  if (r < 0.15) {
    const f = tokens(pick(FILL_PRE));
    toks = [...f, ...toks];
    roles = [...f.map(() => 'fill' as Role), ...roles];
  }
  const r2 = rnd();
  if (r2 < 0.1 && e.locality) {
    // "lacul noua brasov": locality appended without a preposition.
    const anchor = tokens(e.locality.split(', ').pop()!);
    if (anchor.length && !toks.includes(anchor[0])) {
      toks = [...toks, ...anchor];
      roles = [...roles, ...anchor.map(() => 'anchor' as Role)];
    }
  } else if (r2 < 0.28 && e.locality) {
    const anchor = tokens(pick(e.locality.split(', ')));
    if (anchor.length && anchor.join(' ') !== toks.join(' ')) {
      const near = tokens(pick(rnd() < 0.6 ? NEAR_RO : NEAR_EN));
      toks = [...toks, ...near, ...anchor];
      roles = [...roles, ...near.map((_, i) => (i === 0 ? 'near' : 'fill') as Role), ...anchor.map(() => 'anchor' as Role)];
    }
  } else if (r2 < 0.34) {
    const [m, mr] = pick(ME_PHR);
    toks = [...toks, ...m];
    roles = [...roles, ...mr];
  }
  void ME_SET;
  out(toks, roles, hasCue ? e.cat : 'any');
}
