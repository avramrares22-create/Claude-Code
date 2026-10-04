/**
 * Text handling for Romanian/English place search: diacritic folding,
 * Romanian article/case endings, tokenisation, trigram similarity and edit distance.
 */

const FOLD_MAP: Record<string, string> = {
  ă: 'a', â: 'a', î: 'i', ș: 's', ş: 's', ț: 't', ţ: 't',
  á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u', ä: 'a', ß: 'ss',
};

/** Lower-case, strip diacritics (both comma and cedilla ș/ț), keep letters/digits/spaces. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ăâîșşțţáéíóöőúüűäß]/g, (c) => FOLD_MAP[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  const f = fold(s);
  return f ? f.split(' ') : [];
}

/** Words that carry no meaning in a place name ("lacul de la X" → lac, X). */
export const STOP = new Set([
  'de', 'la', 'din', 'cu', 'si', 'al', 'a', 'ale', 'lui', 'pe', 'the', 'of', 'to', 'and', 'in', 'at', 'on', 'for',
  'unde', 'e', 'este', 'where', 'is', 'how', 'get', 'go', 'show', 'find', 'me', 'my', 'vreau', 'merg', 'catre', 'spre',
]);

/** Inflected forms of common Romanian place words → base form (after folding). */
const LEMMA: Record<string, string> = {};
for (const [base, forms] of Object.entries({
  lac: 'lacul lacului lacurile lacurilor lacu lacuri',
  varf: 'varful varfului varfurile varfurilor varfu varfuri',
  cabana: 'cabanei cabanele cabanelor cabane',
  cascada: 'cascadei cascadele cascadelor cascade',
  pestera: 'pesterii pesterile pesterilor pesteri',
  chei: 'cheile cheilor',
  vale: 'valea vaii vaile vailor vai',
  sa: 'saua seii seaua sei',
  munte: 'muntele muntelui muntii muntilor munti',
  izvor: 'izvorul izvorului izvoarele izvoarelor izvoare',
  poiana: 'poienii poienile poieni',
  cetate: 'cetatea cetatii cetatile cetati',
  manastire: 'manastirea manastirii manastirile manastiri',
  biserica: 'bisericii bisericile biserici',
  castel: 'castelul castelului castele',
  drum: 'drumul drumului drumurile drumuri',
  strada: 'strazii strazile strazi',
  rau: 'raul raului raurile rauri',
  parau: 'paraul paraului paraiele',
  padure: 'padurea padurii padurile paduri',
  culme: 'culmea culmii',
  creasta: 'crestei crestele creste',
  refugiu: 'refugiul refugiului refugii',
  parc: 'parcul parcului parcurile parcuri',
  partie: 'partia partiei partiile partii',
  turn: 'turnul turnului',
  piata: 'pietei',
  deal: 'dealul dealului dealurile dealuri',
  cruce: 'crucea crucii',
  canion: 'canionul canionului canioane',
  traseu: 'traseul traseului traseele trasee',
  pod: 'podul podului',
  baraj: 'barajul barajului',
  tau: 'taul taului',
  piatra: 'pietrele pietrei',
  plai: 'plaiul',
  colt: 'coltul coltii',
  pas: 'pasul pasului',
})) {
  for (const f of forms.split(' ')) LEMMA[f] = base;
}

/**
 * Light Romanian stemmer for place words: maps inflected forms to a base form
 * so "lacul/lacului", "cheile", "vârful", "cabanei", "peșterii" meet their
 * base word. Applied to both query and names, so consistency matters more
 * than linguistic accuracy.
 */
const NUMBERS: Record<string, string> = {
  '1': 'unu', '2': 'doi', '3': 'trei', '4': 'patru', '5': 'cinci', '6': 'sase', '7': 'sapte', '8': 'opt', '10': 'zece',
  '12': 'doisprezece', 'una': 'unu', 'doua': 'doi',
};

export function stem(t: string): string {
  const num = NUMBERS[t];
  if (num) return num;
  const l = LEMMA[t];
  if (l) return l;
  if (t.length <= 4 || /\d/.test(t)) return t;
  // Masculine article: "Postăvarul", "Postăvarului" and the colloquial "Postăvaru" all meet at "postavaru".
  if (t.endsWith('ului')) return t.slice(0, -3);
  if (t.endsWith('ul')) return t.slice(0, -1);
  if (t.endsWith('ilor') && t.length > 6) return t.slice(0, -4);
  return t;
}

export function stems(s: string): string[] {
  return tokens(s).map(stem);
}

/** Character trigrams of a folded string, padded so short words still match. */
export function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** Damerau–Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** How well one query token matches one name token: 1 exact … 0 none. Handles prefixes and typos. */
export function tokenMatch(q: string, n: string): number {
  if (q === n) return 1;
  if (stem(q) === stem(n)) return 0.95;
  if (q.length >= 3 && n.startsWith(q)) return 0.6 + 0.3 * (q.length / n.length);
  if (q.length >= 4) {
    const d = editDistance(q, n, 2);
    if (d === 1) return 0.8;
    if (d === 2 && q.length >= 6) return 0.6;
    // typo in a prefix being typed: "postav" vs "postavarul"
    if (n.length > q.length) {
      const d2 = editDistance(q, n.slice(0, q.length), 1);
      if (d2 === 1) return 0.55;
    }
  }
  return 0;
}
