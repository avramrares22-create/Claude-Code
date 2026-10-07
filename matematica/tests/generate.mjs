/* Test automat: generează exerciții din fiecare familie și verifică tot.
   Rulare:  node tests/generate.mjs [numar_exemple_per_nivel] [id_familie] */
import { loadAll } from './load.mjs';

const M = loadAll();
const N = parseInt(process.argv[2] || '1000', 10);
const only = process.argv[3];
let failures = 0;
const fail = function (msg) { failures++; if (failures <= 60) console.log('  ✗ ' + msg); };

function canonicalInput(a) {
  if (a.kind === 'int') return String(a.value);
  if (a.kind === 'dec') return M.fmt(a.value, a.dec === undefined ? 1 : a.dec);
  if (a.kind === 'rad') return M.radText(a.n);
  return String(a.value);
}
function badTex(html) { return /<mi>[a-zA-Zăâîșț]{2,}<\/mi>/.test(html) || /<mtext>\s*<\/mtext>/.test(html) && false; }
function checkRich(label, s) {
  const html = M.rich(s);
  if (badTex(html)) fail(label + ': macro TeX necunoscut în „' + s.slice(0, 90) + '”');
  const opens = (s.match(/\$/g) || []).length;
  if (opens % 2) fail(label + ': număr impar de $ în „' + s.slice(0, 90) + '”');
}
function checkTexOnly(label, s) {
  const html = M.tex(s);
  if (badTex(html)) fail(label + ': macro TeX necunoscut în „' + s.slice(0, 90) + '”');
}
function checkFigure(id, f) {
  if (!f) return;
  const names = Object.keys(f.pts || {});
  names.forEach(function (k) { if (!f.pts[k].every(isFinite)) fail(id + ': punct invalid ' + k); });
  (f.segs || []).forEach(function (s) { if (!f.pts[s.a] || !f.pts[s.b]) fail(id + ': segment cu punct lipsă ' + s.a + s.b); });
  (f.rights || []).forEach(function (s) { if (!f.pts[s.at] || !f.pts[s.p] || !f.pts[s.q]) fail(id + ': unghi drept cu punct lipsă'); });
  (f.polys || []).forEach(function (p) { p.ids.forEach(function (k) { if (!f.pts[k]) fail(id + ': poligon cu punct lipsă ' + k); }); });
}

const ids = Object.keys(M.templates).filter(function (id) { return !only || id === only; });
const report = [];
let total = 0;
for (const id of ids) {
  const t = M.templates[id];
  const row = { id: id, skill: t.skill, per: {} };
  if (typeof t.verify !== 'function') fail(id + ': lipsește verify()');
  for (const lv of t.levels) {
    const sp = M.templateSpace(t, lv);
    row.per[lv] = sp.length;
    if (!sp.length) { fail(id + ' nivel ' + lv + ': spațiu gol'); continue; }
    const seen = {};
    for (let i = 0; i < N; i++) {
      const seed = 1000 + i * 7919;
      const modes = i % 3 === 0 ? ['input'] : i % 3 === 1 ? ['choice'] : [undefined];
      let ex;
      try { ex = M.exercise.make(id, seed, lv, modes[0]); } catch (e) { fail(id + ' L' + lv + ' seed ' + seed + ': excepție ' + e.message); continue; }
      total++;
      const tag = id + ' L' + lv + ' #' + seed;
      const probs = M.exercise.validate(ex);
      if (probs.length) fail(tag + ': ' + probs.join('; ') + ' | ' + ex.text.slice(0, 80));
      let okv = false;
      try { okv = t.verify(ex.params, ex); } catch (e) { fail(tag + ': verify a aruncat ' + e.message); }
      if (!okv) fail(tag + ': verify() a respins răspunsul | ' + ex.text.slice(0, 100));
      seen[ex.text] = true;
      checkRich(tag + ' enunț', ex.text);
      (ex.steps || []).forEach(function (s) { checkRich(tag + ' pas', s); });
      (ex.hints || []).forEach(function (s) { checkRich(tag + ' indiciu', s); });
      checkFigure(tag, ex.figure);
      if (ex.mode === 'choice') {
        if (ex.options.length < 3) fail(tag + ': prea puține variante (' + ex.options.length + ')');
        if (!ex.choices && ex.options.length !== 4) fail(tag + ': numeric cu ' + ex.options.length + ' variante');
        ex.options.forEach(function (o) { if (ex.choices) checkRich(tag + ' opțiune', o.label); else checkTexOnly(tag + ' opțiune', o.label); if (!o.ok && !o.why) fail(tag + ': opțiune greșită fără explicație'); });
        const ci = ex.options.findIndex(function (o) { return o.ok; });
        const res = M.exercise.check(ex, ci);
        if (res.status !== 'correct') fail(tag + ': varianta corectă nu e acceptată');
        ex.options.forEach(function (o, k) { if (k !== ci) { const r2 = M.exercise.check(ex, k); if (r2.status !== 'wrong') fail(tag + ': varianta greșită acceptată'); } });
      } else {
        const inp = canonicalInput(ex.answer);
        const res = M.exercise.check(ex, inp);
        if (res.status !== 'correct') fail(tag + ': răspunsul canonic „' + inp + '” nu e acceptat (' + res.status + ')');
        (ex.mistakes || []).forEach(function (m) {
          if (m.keepEqual) return;
          const alt = m.n ? M.radText(m.n) : String(M.round(m.num, 4));
          const r3 = M.exercise.check(ex, alt);
          if (r3.status === 'correct') fail(tag + ': greșeala „' + m.label + '” e acceptată ca bună (input „' + alt + '”)');
        });
      }
      /* dependență de seed: aceeași sămânță → același exercițiu */
      if (i < 5) { const ex2 = M.exercise.make(id, seed, lv, modes[0]); if (ex2.text !== ex.text) fail(tag + ': nedeterminist'); }
      /* exemplu rezolvat */
      if (i < 20) { const w = M.exercise.worked(ex); if (!w || !w.steps || !w.steps.length) fail(tag + ': „Arată-mi cum” a eșuat'); }
    }
    row.per[lv] = sp.length + ' spațiu / ' + Object.keys(seen).length + ' texte distincte în eșantion';
  }
  report.push(row);
}

console.log('\nFamilii: ' + ids.length + '  exerciții generate: ' + total + '  eșecuri: ' + failures);
if (!only) {
  const cap = M.exercise.capacity();
  console.log('Capacitate totală (texte unice, toate nivelurile): ' + cap.total);
  Object.keys(cap.per).forEach(function (k) { console.log('  ' + k.padEnd(14) + String(cap.per[k]).padStart(7)); });
}
process.exit(failures ? 1 : 0);
