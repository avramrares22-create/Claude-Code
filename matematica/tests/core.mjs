/* Teste pentru nucleu: citirea răspunsurilor, nivelurile de stăpânire, dificultatea adaptivă, puncte slabe, salvare / import. */
import { loadAll } from './load.mjs';
const M = loadAll();
let bad = 0, n = 0;
const eq = (a, b, msg) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('  ✗ ' + msg + ' — așteptat ' + JSON.stringify(b) + ', primit ' + JSON.stringify(a)); } };
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('  ✗ ' + msg); } };

/* ---------- citirea răspunsurilor ---------- */
const P = (s) => M.parseAnswer(s);
eq(P('12').value, 12, '12');
eq(P('7,5').value, 7.5, 'virgulă zecimală');
eq(P(' 7.5 ').value, 7.5, 'punct zecimal + spații');
eq(P('5√2').radical, { a: 5, b: 2 }, '5√2 este radical');
eq(P('5*sqrt(2)').radical, { a: 5, b: 2 }, 'sqrt cu *');
eq(P('sqrt 50').radical, { a: 1, b: 50 }, 'sqrt 50');
eq(P('√(13)').radical, { a: 1, b: 13 }, '√(13)');
ok(Math.abs(P('5√2').value - 7.0710678) < 1e-6, 'valoarea lui 5√2');
eq(P('3/4').value, 0.75, 'fracție');
eq(P('2(3+1)').value, 8, 'înmulțire implicită');
eq(P('-3+5').value, 2, 'semne');
eq(P('2^3').value, 8, 'putere');
['', 'abc', '5+', '(2', '1/0', '√-4', '2..3', '5 6 7 x', 'alert(1)', '__proto__'].forEach((s) => ok(!P(s).ok, 'respins: „' + s + '”'));
/* a ciudat: „5 6” → 30 prin înmulțire implicită; nu e o problemă de securitate, dar verificăm să nu arunce */
ok(typeof P('5 6').ok === 'boolean', 'nu aruncă excepții');

const C = (a, s) => M.checkAnswer(a, s).status;
eq(C({ kind: 'int', value: 10 }, '10'), 'correct', 'int corect');
eq(C({ kind: 'int', value: 10 }, '10,0'), 'correct', 'int cu zecimale zero');
eq(C({ kind: 'int', value: 10 }, '9'), 'wrong', 'int greșit');
eq(C({ kind: 'int', value: 10 }, 'zece'), 'invalid', 'text invalid');
eq(C({ kind: 'dec', dec: 1, value: Math.sqrt(50) }, '7,1'), 'correct', 'dec rotunjit');
eq(C({ kind: 'dec', dec: 1, value: Math.sqrt(50) }, '7.07'), 'correct', 'dec mai exact');
eq(C({ kind: 'dec', dec: 1, value: Math.sqrt(50) }, '7'), 'almost', 'dec rotunjit greșit → aproape');
eq(C({ kind: 'dec', dec: 1, value: Math.sqrt(50) }, '5√2'), 'correct', 'dec dat ca radical');
eq(C({ kind: 'dec', dec: 1, value: Math.sqrt(50) }, '9'), 'wrong', 'dec greșit');
eq(C({ kind: 'rad', value: Math.sqrt(50), n: 50 }, '5√2'), 'correct', 'rad simplificat');
eq(C({ kind: 'rad', value: Math.sqrt(50), n: 50 }, '5sqrt(2)'), 'correct', 'rad cu sqrt');
eq(C({ kind: 'rad', value: Math.sqrt(50), n: 50 }, '√50'), 'almost', 'rad nesimplificat → aproape');
eq(C({ kind: 'rad', value: Math.sqrt(50), n: 50 }, '7,07'), 'almost', 'rad dat ca zecimală → aproape');
eq(C({ kind: 'rad', value: Math.sqrt(50), n: 50 }, '6√2'), 'wrong', 'rad greșit');
eq(C({ kind: 'rad', value: 5, n: 25 }, '5'), 'correct', 'rad care e întreg');
eq(C({ kind: 'rad', value: Math.sqrt(13), n: 13 }, '√13'), 'correct', 'rad ireductibil');
eq(C({ kind: 'rad', value: Math.sqrt(13), n: 13 }, '1√13'), 'correct', '1√13');

/* ---------- radicali ---------- */
eq(M.simplifyRadical(72), { a: 6, b: 2 }, '√72');
eq(M.simplifyRadical(50), { a: 5, b: 2 }, '√50');
eq(M.simplifyRadical(13), { a: 1, b: 13 }, '√13');
eq(M.simplifyRadical(144), { a: 12, b: 1 }, '√144');
eq(M.radTex(75), '5\\sqrt{3}', 'radTex');
eq(M.radText(98), '7√2', 'radText');
eq(M.fmt(3.5), '3,5', 'fmt virgulă');
eq(M.fmt(4), '4', 'fmt întreg');
eq(M.days(1), '1 zi', '1 zi'); eq(M.days(5), '5 zile', '5 zile'); eq(M.days(23), '23 de zile', '23 de zile'); eq(M.days(0), '0 zile', '0 zile');

/* ---------- MathML ---------- */
const m1 = M.tex('\\frac{a}{b} + \\sqrt{50} = 3.5');
ok(m1.includes('<mfrac>') && m1.includes('<msqrt>') && m1.includes('<mn>3,5</mn>'), 'MathML: fracție, radical, virgulă zecimală');
ok(M.tex('a^2 + b^2 = c^2').includes('<msup>'), 'MathML: exponent');
ok(M.tex('\\ca{a}').includes('mc-ca'), 'MathML: culoare');
ok(!/<script/i.test(M.rich('<script>alert(1)</script>')), 'rich escapează HTML');
ok(M.rich('$x<y$').includes('&lt;'), 'MathML escapează <');

/* ---------- mastery ---------- */
const SK = 'p.hyp.int';
M.store.reset();
eq(M.masteryLevel(SK), 0, 'nivel 0 la început');
const rec = (ok2, mode) => M.recordAnswer({ skill: SK, ok: ok2, mode: mode || 'practice', tag: ok2 ? null : 'add-legs' });
rec(false);
eq(M.masteryLevel(SK), 1, 'Încercat după o încercare');
for (let i = 0; i < 4; i++) rec(true);               // 1 greșit + 4 corecte = set de 5: 80%
eq(M.store.get().skills[SK].sets, [80], 'un set de 5 se salvează ca 80%');
eq(M.masteryLevel(SK), 2, 'Familiar la ≥70% pe un set');
for (let i = 0; i < 5; i++) rec(true);               // set de 100%
eq(M.masteryLevel(SK), 3, 'Competent: două seturi la rând ≥80%');
/* Stăpânit prin test */
M.finishSession({ mode: 'test', perSkill: { [SK]: { n: 1, c: 1 } } });
eq(M.masteryLevel(SK), 4, 'Stăpânit: 100% la test după ce ești Familiar');
M.finishSession({ mode: 'test', perSkill: { [SK]: { n: 2, c: 1 } } });
ok(M.masteryLevel(SK) < 4, 'un test slab retrage Stăpânit');
/* test fără exersare nu dă Stăpânit */
const SK2 = 'p.hyp.rad';
M.finishSession({ mode: 'test', perSkill: { [SK2]: { n: 1, c: 1 } } });
ok(M.masteryLevel(SK2) < 4, 'test fără exersare nu dă Stăpânit');

/* ---------- dificultate adaptivă ---------- */
M.store.reset();
const S3 = 'p.leg.int';
eq(M.skillLevel(S3), 1, 'început nivel 1');
let r1 = [rec2(true), rec2(true), rec2(true)];
function rec2(ok2) { return M.recordAnswer({ skill: S3, ok: ok2, mode: 'practice', tag: ok2 ? null : 'diff-lengths' }); }
eq(r1[2].changed, 'up', '3 corecte la rând → mai greu');
eq(M.skillLevel(S3), 2, 'nivel 2');
let r2 = [rec2(false), rec2(false)];
eq(r2[1].changed, 'down', '2 greșite la rând → mai ușor');
eq(M.skillLevel(S3), 1, 'înapoi la nivel 1');
eq(rec2(false).changed, null, 'o singură greșeală nu schimbă');
eq([rec2(false)][0].changed, 'down-min', 'la nivel minim: semnal de explicație');
M.recordAnswer({ skill: S3, ok: true, mode: 'test' });
ok(true, 'testul nu aruncă');

/* ---------- puncte slabe ---------- */
M.store.reset();
for (let i = 0; i < 8; i++) M.recordAnswer({ skill: 'p.fig.rect', ok: false, mode: 'practice', tag: 'add-legs' });
for (let i = 0; i < 8; i++) M.recordAnswer({ skill: 'p.fig.iso', ok: true, mode: 'practice' });
for (let i = 0; i < 6; i++) M.recordAnswer({ skill: 'p.fig.rhomb', ok: i % 2 === 0, mode: 'practice', tag: i % 2 ? 'whole-diagonals' : null });
const wk = M.weakSkills(['p.fig.rect', 'p.fig.iso', 'p.fig.rhomb', 'p.fig.trap'], 5);
eq(wk[0].id, 'p.fig.rect', 'cea mai slabă abilitate este prima');
ok(wk.every((x) => x.id !== 'p.fig.iso'), 'o abilitate bună nu apare la puncte slabe');
ok(wk.every((x) => x.id !== 'p.fig.trap'), 'o abilitate neîncercată nu apare');
eq(M.weakness('p.fig.trap'), null, 'neîncercat → null');
ok(M.weakness('p.fig.rect') > M.weakness('p.fig.rhomb'), 'ordinea slăbiciunilor');
const ms = M.mistakeStats();
eq(ms[0].tag, 'add-legs', 'greșeala cea mai frecventă');
/* sesiune pentru puncte slabe */
const ws = M.weakSession(Object.keys(M.skills), 10);
ok(ws.cfg.skills.indexOf('p.fig.rect') >= 0, 'sesiunea de puncte slabe include abilitatea slabă');
let cnt = 0; for (let i = 0; i < 40; i++) { const ex = ws.next(); if (ex.skill === 'p.fig.rect') cnt++; ws.n = 0; }
ok(cnt > 8, 'abilitatea slabă apare des în sesiunea de puncte slabe (' + cnt + '/40)');

/* ---------- serie și XP ---------- */
M.store.reset();
M.store.addXp(30); M.store.addXp(25);
eq(M.store.xpToday(), 55, 'XP azi');
M.store.touchStreak();
eq(M.store.streakNow(), 1, 'serie 1');
M.store.touchStreak();
eq(M.store.streakNow(), 1, 'a doua atingere în aceeași zi nu crește seria');
M.store.update((s) => { const y = new Date(); y.setDate(y.getDate() - 1); s.streak = { count: 4, last: M.todayStr(y) }; });
eq(M.store.streakNow(), 4, 'serie păstrată dacă ultima zi a fost ieri');
M.store.touchStreak();
eq(M.store.streakNow(), 5, 'serie crește a doua zi');
M.store.update((s) => { const y = new Date(); y.setDate(y.getDate() - 3); s.streak = { count: 9, last: M.todayStr(y) }; });
eq(M.store.streakNow(), 0, 'serie pierdută după 2 zile');

/* ---------- export / import ---------- */
M.store.reset();
M.recordAnswer({ skill: 'p.sq.area', ok: true, mode: 'practice' });
const dump = M.store.exportJSON();
M.store.reset();
eq(M.store.get().skills['p.sq.area'], undefined, 'resetare');
ok(M.store.importJSON(dump).ok, 'import valid');
eq(M.store.get().skills['p.sq.area'].att, 1, 'import restaurează progresul');
ok(!M.store.importJSON('nu e json').ok, 'import respinge text');
ok(!M.store.importJSON('{"app":"altceva","data":{}}').ok, 'import respinge alt fișier');
ok(!M.store.importJSON('{"app":"matematica","data":5}').ok, 'import respinge date nevalide');
eq(M.store.get().skills['p.sq.area'].att, 1, 'un import eșuat nu strică datele');

console.log('Nucleu: ' + n + ' verificări, probleme: ' + bad);
process.exit(bad ? 1 : 0);
