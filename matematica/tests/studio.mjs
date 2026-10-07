/* Testează Studio: cereri în română → plan → exerciții verificate. */
import { loadAll } from './load.mjs';
const M = loadAll();
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const CASES = [
  ['5 probleme mai grele cu povestea fotbalului', { count: 5, level: 3, has: ['app-path'], only: true, where: { 'app-path': 'pl' } }],
  ['6 exerciții cu radical simplificat la ipotenuză', { count: 6, has: ['hyp-rad'], only: true }],
  ['4 exerciții cu romb și trapez, nivel mediu', { count: 4, level: 2, has: ['fig-rhomb', 'fig-trap'] }],
  ['Doua probleme ușoare cu scara pe perete', { count: 2, level: 1, has: ['app-ladder'] }],
  ['exerciții cu catete rotunjite la zecimale', { has: ['leg-dec'], only: true }],
  ['8 exerciții din lecțiile 3 și 4, de la ușor la greu', { count: 8, ramp: true, has: ['hyp-int', 'leg-int'] }],
  ['exersează punctele mele slabe', { weak: true }],
  ['15 probleme grele cu diagonala televizorului', { count: 10, level: 3, has: ['app-screen'] }],
  ['reciproca teoremei lui Pitagora, 5 exerciții', { count: 5, has: ['conv-check'] }],
  ['ceva despre triunghi echilateral și isoscel', { has: ['fig-equi', 'fig-iso'] }],
  ['distanța dintre două puncte în plan, 3 probleme', { count: 3, has: ['fig-coord'] }],
  ['asdf qwer', { has: ['hyp-int'], note: true }],
];
for (const [text, exp] of CASES) {
  const plan = M.studio.parse(text);
  const ids = plan.templates.map((t) => t.id);
  if (exp.count && plan.count !== exp.count) fail(text + ': count ' + plan.count + ' ≠ ' + exp.count);
  if (exp.level !== undefined && plan.level !== exp.level) fail(text + ': level ' + plan.level + ' ≠ ' + exp.level);
  if (exp.ramp && !plan.ramp) fail(text + ': ramp lipsă');
  if (exp.weak && !plan.weak) fail(text + ': weak lipsă');
  (exp.has || []).forEach((id) => { if (ids.indexOf(id) < 0) fail(text + ': lipsește ' + id + ' (are ' + ids.join(',') + ')'); });
  if (exp.only && ids.length !== (exp.has || []).length) fail(text + ': prea multe familii: ' + ids.join(','));
  if (exp.note && !plan.notes.length) fail(text + ': ar fi trebuit o notă');
  const out = M.studio.generate(plan, { seed: 7 });
  if (!out.exercises.length) fail(text + ': niciun exercițiu generat');
  out.exercises.forEach((ex) => {
    if (M.exercise.validate(ex).length) fail(text + ': exercițiu invalid');
    if (!M.templates[ex.templateId].verify(ex.params, ex)) fail(text + ': verify a respins');
  });
  if (exp.where) Object.keys(exp.where).forEach((tid) => out.exercises.forEach((ex) => { if (ex.templateId === tid && exp.where[tid] === 'pl' && ex.params.pl !== 0) fail(text + ': filtrul de poveste nu a fost respectat'); }));
}
/* plan din model: JSON primit trebuie curățat */
const bogus = M.studio.planFromJSON({ count: 99, level: 7, templates: [{ id: 'hyp-int', where: { pl: [0], evil: ['x'] } }, { id: 'nu-exista' }, 'leg-int'] });
if (!bogus || bogus.count !== 10 || bogus.level !== 0 || bogus.templates.length !== 2) fail('planFromJSON nu curăță corect: ' + JSON.stringify(bogus));
if (bogus && bogus.templates[0].where && bogus.templates[0].where.evil) fail('filtru nepermis acceptat');
if (M.studio.planFromJSON({ count: 3, templates: [] })) fail('plan gol acceptat');
if (M.studio.planFromJSON('text')) fail('plan non-obiect acceptat');
/* stres: 300 cereri aleatoare */
const WORDS = ['ipotenuza', 'catete', 'romb', 'trapez', 'scara', 'fotbal', 'televizor', 'radical', 'zecimale', 'reciproca', 'triplet', 'inaltime', 'mai grele', 'usoare', 'mix', 'greseli', 'coordonate', 'echilateral', 'patrat', 'parc', 'zmeu'];
let n = 0;
for (let i = 0; i < 300; i++) {
  const r = M.rng(100 + i);
  const text = r.int(1, 12) + ' exerciții cu ' + r.shuffle(WORDS).slice(0, r.int(1, 3)).join(' și ');
  const out = M.studio.generate(M.studio.parse(text), { seed: i + 1 });
  if (!out.exercises.length) { fail('stres: nimic pentru „' + text + '”'); continue; }
  out.exercises.forEach((ex) => { n++; if (M.exercise.validate(ex).length || !M.templates[ex.templateId].verify(ex.params, ex)) fail('stres: exercițiu rău pentru „' + text + '”'); });
}
/* împachetare / despachetare */
const pk = M.studio.generate(M.studio.parse('4 exerciții cu catete'), { seed: 3 }).exercises;
const back = M.studio.unpack(M.studio.pack(pk));
if (back.length !== pk.length || back.some((e, i) => e.text !== pk[i].text)) fail('set salvat nu se reconstruiește identic');
console.log('Studio: ' + CASES.length + ' cereri-test, ' + n + ' exerciții din cereri aleatoare, probleme: ' + bad);
process.exit(bad ? 1 : 0);
