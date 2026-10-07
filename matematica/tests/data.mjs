/* Verifică coerența datelor: lecții ↔ abilități ↔ familii de exerciții, text, formule, etichete de greșeli. */
import { loadAll } from './load.mjs';
const M = loadAll();
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const TYPES = ['explain', 'play', 'question', 'ask', 'reveal', 'quiz', 'example'];
const VIS = ['rt-explorer', 'pyth-squares', 'pyth-proof', 'sqrt-line', 'pyth-solver', 'converse-sticks', 'shape-lab', 'coord-plane', 'ladder-lab', 'height-lab'];
const badTex = (html) => /<mi>[a-zA-Zăâîșț]{2,}<\/mi>/.test(html);
const words = (s) => String(s).replace(/\$[^$]*\$/g, 'x').split(/\s+/).filter(Boolean).length;

const u1 = M.unitById('u1');
const allSk = Object.keys(u1.skills);
const inLessons = {};
u1.lessons.forEach((l) => l.skills.forEach((s) => { inLessons[s] = (inLessons[s] || 0) + 1; }));
allSk.forEach((s) => { if (inLessons[s] !== 1) fail('abilitatea ' + s + ' apare în ' + (inLessons[s] || 0) + ' lecții'); if (!M.templatesForSkill(s).length) fail('abilitatea ' + s + ' nu are familii de exerciții'); });
Object.keys(inLessons).forEach((s) => { if (!u1.skills[s]) fail('abilitate fără titlu: ' + s); });

u1.lessons.forEach((l, li) => {
  const where = l.id;
  const allowed = [].concat.apply([], u1.lessons.slice(0, li + 1).map((q) => q.skills));
  if (!l.screens.length) fail(where + ': fără ecrane');
  const last = l.screens[l.screens.length - 1];
  if (last.type !== 'quiz') fail(where + ': ultimul ecran nu e test scurt');
  if (l.screens[0].type === 'quiz') fail(where + ': începe cu test');
  let hasPlay = false;
  l.screens.forEach((sc, i) => {
    const w = where + '#' + (i + 1) + ' (' + sc.type + ')';
    if (TYPES.indexOf(sc.type) < 0) fail(w + ': tip necunoscut');
    if (sc.type === 'play') { hasPlay = true; if (VIS.indexOf(sc.visual) < 0) fail(w + ': vizualizare necunoscută ' + sc.visual); if (!sc.prompt) fail(w + ': fără indicație'); if (badTex(M.rich(sc.prompt))) fail(w + ': TeX în indicație'); }
    if (sc.type === 'question') {
      if (sc.visual && VIS.indexOf(sc.visual.name) < 0) fail(w + ': vizualizare necunoscută');
      if (sc.options.filter((o) => o.ok).length !== 1) fail(w + ': nu are exact un răspuns corect');
      sc.options.forEach((o) => { if (!o.ok && !o.why) fail(w + ': opțiune greșită fără explicație'); if (badTex(M.rich(o.t))) fail(w + ': TeX opțiune'); });
      if (badTex(M.rich(sc.q))) fail(w + ': TeX întrebare');
      if (sc.skill && l.skills.indexOf(sc.skill) < 0) fail(w + ': abilitate din afara lecției');
      if (!sc.hints || !sc.hints.length) fail(w + ': fără indicii');
    }
    if (sc.type === 'ask') {
      if (allowed.indexOf(sc.skill) < 0) fail(w + ': abilitatea ' + sc.skill + ' aparține unei lecții următoare');
      if (!M.templatesForSkill(sc.skill).length) fail(w + ': nicio familie');
      const lv = sc.level; const ok = M.templatesForSkill(sc.skill).some((t) => t.levels.indexOf(lv) >= 0);
      if (!ok) fail(w + ': niciun șablon la nivelul ' + lv + ' pentru ' + sc.skill + ' (se va folosi cel mai apropiat)');
    }
    if (sc.type === 'quiz') sc.skills.forEach((s) => { if (allowed.indexOf(s) < 0) fail(w + ': abilitate dintr-o lecție următoare ' + s); });
    if (sc.type === 'example') { if (!M.templates[sc.template]) fail(w + ': șablon inexistent'); else { const ex = M.exercise.make(sc.template, sc.seed, sc.level, 'input'); if (M.exercise.validate(ex).length) fail(w + ': exemplu invalid'); } }
    if (sc.type === 'explain') {
      const n = sc.body.map(words).reduce((a, b) => a + b, 0);
      if (n > 45) fail(w + ': prea mult text (' + n + ' cuvinte)');
      sc.body.forEach((b) => { if (badTex(M.rich(b))) fail(w + ': TeX necunoscut în „' + b.slice(0, 50) + '”'); });
      if (sc.trick && badTex(M.rich(sc.trick))) fail(w + ': TeX în truc');
    }
    if (sc.type === 'reveal') { if (badTex(M.tex(sc.formula, { block: true }))) fail(w + ': TeX în formulă'); if (badTex(M.rich(sc.text))) fail(w + ': TeX în text'); }
  });
  if (!hasPlay) fail(where + ': nicio vizualizare interactivă');
});

/* etichete de greșeli */
const seen = {};
for (const id of Object.keys(M.templates)) {
  const t = M.templates[id];
  for (const lv of t.levels) for (let i = 0; i < 40; i++) {
    const ex = M.exercise.make(id, 11 + i * 313, lv, i % 2 ? 'input' : 'choice');
    (ex.mistakes || []).forEach((m) => { seen[m.tag] = 1; });
    (ex.options || []).forEach((o) => { if (!o.ok && o.tag) seen[o.tag] = 1; });
  }
}
Object.keys(seen).forEach((t) => { if (M.mistakeUnmapped(t)) fail('etichetă de greșeală fără categorie: ' + t); });
Object.keys(M.mistakeCats).forEach((c) => { if (badTex(M.rich(M.mistakeCats[c].tip))) fail('categorie ' + c + ': TeX'); });
if (M.messages.correct.length < 20) fail('mesaje de încurajare: sub 20');

console.log('\nLecții: ' + u1.lessons.length + '  abilități: ' + allSk.length + '  etichete de greșeli: ' + Object.keys(seen).length + '  probleme: ' + bad);
process.exit(bad ? 1 : 0);
