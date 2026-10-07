/* Construiește setul de antrenare pentru modelul local: cerere în română → plan JSON pentru generatorul de exerciții.
   Nu are nevoie de internet sau de GPU:   node ai/make_dataset.mjs [--train 6000] [--val 300] [--test 400]
   Rezultat: ai/data/train.jsonl, val.jsonl, test.jsonl (format „messages”, bun pentru TRL / Unsloth) + stats.json.
   Planurile corecte vin dintr-o specificație structurată, NU din parserul cu reguli; cererile se scriu în multe formulări,
   cu și fără diacritice, cu greșeli de scriere. Setul de test folosește formulări pe care antrenarea nu le vede. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../tests/load.mjs';

const M = loadAll();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? parseInt(process.argv[i + 1], 10) : d; };
const N_TRAIN = arg('train', 6000), N_VAL = arg('val', 300), N_TEST = arg('test', 400);

/* ---------- catalogul de subiecte: id-uri + formulări ---------- */
const T = (ids, phrases, where) => ({ ids: [].concat(ids), phrases, where: where || null });
const CATALOG = [
  T(['hyp-int', 'hyp-dec', 'hyp-rad'], ['ipotenuza', 'aflarea ipotenuzei', 'calculul ipotenuzei', 'ipotenuză', 'Pitagora cu ipotenuza', 'lungimea ipotenuzei']),
  T(['hyp-int'], ['ipotenuza cu rezultat întreg', 'ipotenuza, doar numere întregi', 'ipotenuza cu triplete pitagoreice', 'ipotenuza fără radicali']),
  T(['hyp-dec'], ['ipotenuza rotunjită la o zecimală', 'ipotenuza cu zecimale', 'ipotenuza aproximată', 'ipotenuza, rezultat rotunjit']),
  T(['hyp-rad'], ['ipotenuza cu radical simplificat', 'ipotenuza sub formă de radical', 'ipotenuza cu radicali']),
  T(['leg-int', 'leg-dec', 'leg-rad'], ['catetele', 'aflarea unei catete', 'calculul catetei', 'cateta necunoscută', 'catete']),
  T(['leg-int'], ['cateta cu rezultat întreg', 'cateta, numere întregi', 'catetă fără radicali']),
  T(['leg-dec'], ['cateta rotunjită la zecimale', 'cateta cu zecimale', 'catetă aproximată']),
  T(['leg-rad'], ['cateta cu radical simplificat', 'cateta sub formă de radical']),
  T(['conv-check', 'conv-nature'], ['reciproca teoremei lui Pitagora', 'verificarea dacă un triunghi este dreptunghic', 'este triunghiul dreptunghic', 'reciproca lui Pitagora']),
  T(['conv-triple'], ['triplete pitagoreice', 'numere pitagoreice', 'tripletele pitagoreice']),
  T(['conv-nature'], ['triunghi ascuțitunghic sau obtuzunghic', 'natura triunghiului', 'ascuțitunghic, dreptunghic sau obtuzunghic']),
  T(['rad-simp', 'rad-est'], ['radicali', 'scoaterea factorilor de sub radical', 'calcule cu radicali']),
  T(['rad-est'], ['estimarea radicalilor', 'estimarea unui radical între două numere întregi']),
  T(['sq-area', 'sq-sum'], ['pătrate pe laturile triunghiului', 'aria pătratelor construite pe laturi', 'pătrate construite pe laturi']),
  T(['sq-area'], ['aria pătratului', 'latura și aria unui pătrat']),
  T(['fig-rect'], ['dreptunghi', 'diagonala dreptunghiului', 'dreptunghiul și diagonala lui']),
  T(['fig-square'], ['pătrat', 'diagonala pătratului', 'diagonala unui pătrat']),
  T(['fig-iso'], ['triunghi isoscel', 'înălțimea triunghiului isoscel', 'triunghiul isoscel']),
  T(['fig-equi'], ['triunghi echilateral', 'înălțimea triunghiului echilateral', 'echilateral']),
  T(['fig-rhomb'], ['romb', 'rombul', 'latura rombului din diagonale']),
  T(['fig-trap'], ['trapez', 'trapezul isoscel', 'trapez dreptunghic']),
  T(['fig-coord'], ['distanța dintre două puncte', 'puncte în plan', 'coordonate în plan', 'distanța în planul cartezian']),
  T(['fig-rect', 'fig-square', 'fig-iso', 'fig-equi', 'fig-rhomb', 'fig-trap', 'fig-coord'], ['Pitagora în figuri geometrice', 'figuri geometrice', 'aplicații în geometrie']),
  T(['app-ladder'], ['scara pe perete', 'scară sprijinită de perete', 'probleme cu scara'], { t: ['ladder', 'ladderD', 'slip'] }),
  T(['app-ladder'], ['cablu și stâlp', 'stâlpul fixat cu cablu', 'cablul unui stâlp'], { t: ['cable'] }),
  T(['app-ladder'], ['zmeul', 'sfoara unui zmeu', 'un zmeu pe cer'], { t: ['kite'] }),
  T(['app-ladder'], ['scara care alunecă', 'scara alunecă pe perete'], { t: ['slip'] }),
  T(['app-screen'], ['diagonala ecranului', 'ecrane', 'dimensiunea unui ecran în inci']),
  T(['app-screen'], ['ecranul unui televizor', 'televizor'], { d: [2] }),
  T(['app-screen'], ['ecranul unui telefon', 'telefon'], { d: [3] }),
  T(['app-screen'], ['ecranul unui laptop', 'laptop'], { d: [4] }),
  T(['app-screen'], ['ecranul unei tablete', 'tabletă'], { d: [0] }),
  T(['app-screen'], ['ecranul unui monitor', 'monitor'], { d: [1] }),
  T(['app-path'], ['drumul cel mai scurt', 'scurtătura pe diagonală', 'traseul pe diagonală']),
  T(['app-path'], ['povestea fotbalului', 'terenul de fotbal', 'fotbal'], { pl: [0] }),
  T(['app-path'], ['parc', 'povestea cu parcul'], { pl: [1] }),
  T(['app-path'], ['curtea școlii', 'școală'], { pl: [2] }),
  T(['app-path'], ['piață', 'piața dreptunghiulară'], { pl: [3] }),
  T(['app-multi'], ['probleme în doi pași', 'două triunghiuri dreptunghice', 'patrulater cu unghiuri drepte']),
  T(['app-ladder', 'app-screen', 'app-path', 'app-multi'], ['probleme din viața reală', 'probleme cu poveste', 'aplicații practice']),
  T(['met-height', 'met-proj'], ['teorema înălțimii', 'înălțimea din unghiul drept']),
  T(['met-leg', 'met-proj'], ['teorema catetei', 'proiecții pe ipotenuză']),
  T(['met-height', 'met-leg', 'met-proj', 'met-hside'], ['relații metrice în triunghiul dreptunghic', 'înălțimea și cateta']),
  T(['met-hside'], ['înălțimea din arii', 'înălțimea calculată cu aria']),
  T(['err-spot'], ['unde a greșit', 'depistarea greșelii', 'găsește greșeala din rezolvare']),
  T(['rt-name', 'rt-longest'], ['catete și ipotenuză, recunoaștere', 'recunoașterea ipotenuzei', 'noțiunile de bază: catete și ipotenuză']),
];
const MIX = ['hyp-int', 'hyp-dec', 'leg-int', 'leg-dec', 'fig-rect', 'fig-iso', 'app-ladder', 'app-path'];

/* ---------- formulări ---------- */
const NOUNS_TRAIN = ['exerciții', 'probleme', 'întrebări', 'exerciții', 'probleme', 'exemple'];
const NOUNS_TEST = ['sarcini', 'itemi', 'probleme-tip', 'exerciții', 'probleme'];
const LEVELS = {
  1: { train: ['ușoare', 'simple', 'de nivel ușor', 'de început', 'pentru începători'], test: ['accesibile', 'foarte simple', 'ușurele'] },
  2: { train: ['medii', 'de dificultate medie', 'de nivel mediu', 'obișnuite'], test: ['nici grele, nici ușoare', 'standard'] },
  3: { train: ['grele', 'mai grele', 'dificile', 'de olimpiadă', 'complicate', 'avansate'], test: ['ceva mai complicate', 'pentru concurs', 'dure', 'serioase'] },
  ramp: { train: ['de la ușor la greu', 'progresive', 'cu dificultate crescătoare'], test: ['începând ușor și terminând greu', 'tot mai grele'] },
};
const WORDS = ['', 'unu', 'două', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă', 'zece'];
const FRAMES_TRAIN = [
  (c, n, l, t) => `${c} ${n} ${l ? l + ' ' : ''}cu ${t}`, (c, n, l, t) => `Vreau ${c} ${n} ${l ? l + ' ' : ''}despre ${t}`, (c, n, l, t) => `Fă-mi ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`,
  (c, n, l, t) => `Generează ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`, (c, n, l, t) => `Dă-mi ${c} ${n}${l ? ' ' + l : ''}: ${t}`, (c, n, l, t) => `Aș vrea să exersez ${t}, ${c} ${n}${l ? ' ' + l : ''}`,
  (c, n, l, t) => `${t} — ${c} ${n}${l ? ', ' + l : ''}`, (c, n, l, t) => `Pregătește-mi un set de ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`, (c, n, l, t) => `Te rog ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`,
  (c, n, l, t) => `Mai vreau ${c} ${n} ${l ? l + ' ' : ''}pe tema: ${t}`, (c, n, l, t) => `${c} ${n} la ${t}${l ? ', ' + l : ''}`, (c, n, l, t) => `Construiește ${c} ${n} ${l ? l + ' ' : ''}despre ${t}`,
  (c, n, l, t) => `Exerciții: ${t} (${c} bucăți${l ? ', ' + l : ''})`, (c, n, l, t) => `Dă ${c} ${n} cu ${t}${l ? ' ' + l : ''}`, (c, n, l, t) => `Am nevoie de ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`,
  (c, n, l, t) => `Vreau să mă antrenez la ${t}: ${c} ${n}${l ? ' ' + l : ''}`, (c, n, l, t) => `Hai cu ${c} ${n} ${l ? l + ' ' : ''}cu ${t}`, (c, n, l, t) => `Poți să-mi dai ${c} ${n} ${l ? l + ' ' : ''}cu ${t}?`,
  (c, n, l, t) => `${t}: ${c} ${n}${l ? ' ' + l : ''}`, (c, n, l, t) => `Set de ${c} ${n} ${l ? l + ' ' : ''}— ${t}`, (c, n, l, t) => `Cu ${t}, te rog, ${c} ${n}${l ? ' ' + l : ''}`, (c, n, l, t) => `Mă ajuți cu ${c} ${n} ${l ? l + ' ' : ''}despre ${t}?`,
];
const FRAMES_TEST = [
  (c, n, l, t) => `Ai putea să-mi compui ${c} ${n} ${l ? l + ' ' : ''}în legătură cu ${t}?`, (c, n, l, t) => `Din ${t} aș dori ${c} ${n}${l ? ' (' + l + ')' : ''}`,
  (c, n, l, t) => `Un lot de ${c} ${n} ${l ? l + ' ' : ''}privind ${t}, vă rog`, (c, n, l, t) => `Pentru mâine: ${c} ${n} ${l ? l + ' ' : ''}— subiect: ${t}`,
  (c, n, l, t) => `${t}? Dă-mi ${c} ${n}${l ? ', ' + l : ''}`, (c, n, l, t) => `Antrenament la ${t}: ${c} ${n} ${l ? l + ' ' : ''}`,
  (c, n, l, t) => `Zi-mi ${c} ${n} ${l ? l + ' ' : ''}în care apare ${t}`, (c, n, l, t) => `Cer ${c} ${n} ${l ? l + ' ' : ''}și anume ${t}`,
];
const OFF_TOPIC = ['ce vreme e mâine', 'scrie-mi o poezie despre toamnă', 'cât face 2 + 2', 'rezolvă ecuația x + 3 = 7', 'cine a fost Pitagora', 'spune-mi o glumă', 'care e capitala Franței', 'traduce în engleză: bună ziua',
  'cum fac un tort de ciocolată', 'explică-mi fotosinteza', 'ce film să văd diseară', 'ajută-mă cu tema la română', 'dă-mi un sfat pentru examen', 'ce mai faci', 'cine ești tu', 'scrie un cod în Python', 'rezolvă integrala lui x la pătrat',
  'calculează derivata lui sin x', 'ce înseamnă „teoremă”', 'recomandă-mi o carte', 'care e cel mai înalt munte', 'hello', 'vreau pizza', 'asdf qwer zxcv', 'cum se scrie un eseu'];
const LESSON_IDS = (n) => { const l = M.unitById('u1').lessons[n - 1]; const ids = []; l.skills.forEach((s) => M.templatesForSkill(s).forEach((t) => { if (ids.indexOf(t.id) < 0) ids.push(t.id); })); return ids; };

/* ---------- zgomot: diacritice, majuscule, greșeli de scriere ---------- */
const STRIP = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function noise(s, r, level) {
  if (r.chance(level.strip)) s = STRIP(s);
  if (r.chance(0.12)) s = s.toLowerCase();
  if (r.chance(0.05)) s = s.toUpperCase();
  if (r.chance(level.typo)) {
    const w = s.split(' '); const i = r.int(0, w.length - 1);
    if (w[i].length > 4) { const k = r.int(1, w[i].length - 3); w[i] = w[i].slice(0, k) + w[i][k + 1] + w[i][k] + w[i].slice(k + 2); }
    s = w.join(' ');
  }
  if (r.chance(0.06)) s = s.replace(/\s+/g, '  ');
  return s;
}

/* ---------- generarea unui exemplu ---------- */
function mergeWhere(a, b) { if (!b) return a; const o = Object.assign({}, a || {}); Object.keys(b).forEach((k) => { o[k] = Array.from(new Set((o[k] || []).concat(b[k]))); }); return o; }
function example(r, split) {
  const test = split === 'test';
  const frames = test ? FRAMES_TEST : FRAMES_TRAIN;
  const nouns = test ? NOUNS_TEST : NOUNS_TRAIN;
  const lvlKey = r.pick([0, 0, 1, 2, 3, 3, 'ramp']);
  const lvlPhrase = lvlKey === 0 ? '' : r.pick((test ? LEVELS[lvlKey].test : LEVELS[lvlKey].train));
  const plan = { count: 5, level: lvlKey === 0 || lvlKey === 'ramp' ? 0 : lvlKey, ramp: lvlKey === 'ramp', weak: false, templates: [] };
  const noun = r.pick(nouns);
  let countWord = '';
  if (r.chance(0.85)) {
    let c = r.chance(0.04) ? r.int(11, 25) : r.int(1, 10);
    plan.count = Math.min(10, c);
    countWord = r.chance(0.25 && c <= 10 && WORDS[c]) ? WORDS[c] : String(c);
  }
  const kind = r.next();
  let topicPhrase = '';
  if (kind < 0.035) { /* în afara domeniului */
    const t = r.pick(OFF_TOPIC);
    plan.count = 5; plan.level = 0; plan.ramp = false; plan.templates = [];
    return { text: noise(t.charAt(0).toUpperCase() + t.slice(1) + (r.chance(0.4) ? '?' : ''), r, { strip: 0.5, typo: 0.1 }), plan };
  }
  if (kind < 0.09) { /* punctele slabe */
    plan.weak = true;
    topicPhrase = r.pick(['punctele mele slabe', 'ce nu știu', 'slăbiciunile mele', 'ce greșesc cel mai des', 'unde am lacune']);
  } else if (kind < 0.15) { /* din anumite lecții */
    const a = r.int(1, 8); const two = r.chance(0.5); let b = two ? r.int(1, 8) : a;
    if (b === a) b = a;
    const ids = Array.from(new Set(LESSON_IDS(a).concat(LESSON_IDS(b)))).slice(0, 12);
    plan.templates = ids.map((id) => ({ id: id }));
    topicPhrase = a === b ? `lecția ${a}` : `lecțiile ${a} și ${b}`;
    if (test) topicPhrase = a === b ? `ce am făcut la lecția ${a}` : `materia din lecțiile ${a} și ${b}`;
  } else if (kind < 0.18) { /* amestec */
    plan.templates = MIX.map((id) => ({ id }));
    topicPhrase = r.pick(['amestec de toate', 'diverse tipuri', 'un mix de probleme', 'toate felurile']);
  } else {
    const k = r.pick([1, 1, 1, 1, 2, 2, 3]);
    const picked = []; const phrases = []; const byId = {};
    let tries = 0;
    while (picked.length < k && tries++ < 20) {
      const e = r.pick(CATALOG);
      if (picked.indexOf(e) >= 0) continue;
      /* nu amestecăm două intrări care se contrazic (aceeași familie cu filtre diferite) */
      if (e.ids.some((id) => byId[id] && JSON.stringify(byId[id]) !== JSON.stringify(e.where))) continue;
      picked.push(e); phrases.push(r.pick(e.phrases));
      e.ids.forEach((id) => { byId[id] = e.where; });
    }
    const map = {};
    picked.forEach((e) => e.ids.forEach((id) => { map[id] = mergeWhere(map[id] || null, e.where); }));
    plan.templates = Object.keys(map).map((id) => (map[id] ? { id: id, where: map[id] } : { id: id }));
    topicPhrase = phrases.length === 1 ? phrases[0] : phrases.length === 2 ? phrases.join(r.pick([' și ', ' plus ', ' și apoi ', ' + '])) : phrases.slice(0, -1).join(', ') + ' și ' + phrases[phrases.length - 1];
  }
  if (!countWord) countWord = '';
  let text = frames[r.int(0, frames.length - 1)](countWord || '', noun, lvlPhrase, topicPhrase).replace(/\s+/g, ' ').trim();
  if (!countWord) text = text.replace(/^(\S+) {1,2}/, (m) => m).replace(/\s{2,}/g, ' ');
  if (r.chance(0.08)) text += r.pick([' te rog', ' mulțumesc', ' repede']);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { text: noise(text, r, { strip: 0.45, typo: 0.1 }), plan };
}

/* ---------- ieșirea: JSON compact, ordinea cheilor fixă ---------- */
const out = (p) => JSON.stringify({ count: p.count, level: p.level, ramp: p.ramp, weak: p.weak, templates: p.templates.map((t) => (t.where ? { id: t.id, where: t.where } : { id: t.id })) });
const SYSTEM = M.studio.systemPrompt();
function build(n, split, seed) {
  const r = M.rng(seed);
  const rows = []; const seen = new Set();
  let guard = 0;
  while (rows.length < n && guard++ < n * 30) {
    const ex = example(r, split);
    const key = ex.text + '|' + out(ex.plan);
    if (seen.has(key)) continue;
    seen.add(key);
    /* verificare: planul trebuie să fie valid pentru generator */
    if (ex.plan.templates.length) { const chk = M.studio.planFromJSON(JSON.parse(out(ex.plan))); if (!chk) throw new Error('plan invalid: ' + out(ex.plan)); const g = M.studio.generate(chk, { seed: 3 }); if (!g.exercises.length) throw new Error('plan fără exerciții: ' + out(ex.plan)); }
    rows.push({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: ex.text }, { role: 'assistant', content: out(ex.plan) }] });
  }
  return rows;
}
fs.mkdirSync(path.join(HERE, 'data'), { recursive: true });
const sets = { train: build(N_TRAIN, 'train', 11), val: build(N_VAL, 'train', 777), test: build(N_TEST, 'test', 4242) };
/* val nu trebuie să se suprapună cu train */
const trainTexts = new Set(sets.train.map((x) => x.messages[1].content));
sets.val = sets.val.filter((x) => !trainTexts.has(x.messages[1].content));
const stats = {};
for (const [k, rows] of Object.entries(sets)) {
  fs.writeFileSync(path.join(HERE, 'data', k + '.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  stats[k] = rows.length;
}
fs.writeFileSync(path.join(HERE, 'data', 'stats.json'), JSON.stringify({ examples: stats, familii: Object.keys(M.templates).length, system: SYSTEM }, null, 1));
console.log('Gata:', stats, '→ ai/data/');
const s = sets.train[5]; console.log('Exemplu:\n  cerere :', s.messages[1].content, '\n  plan   :', s.messages[2].content);
