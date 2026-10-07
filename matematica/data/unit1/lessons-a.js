/* Unitatea 1 — lecțiile 1–4. Fiecare lecție: joacă → întrebare → regulă → exerciții → test scurt. */
(function (M) {
  'use strict';
  const F = M.fig;
  const L = M.u1.unit.lessons;
  const E = function (title, body, o) { return Object.assign({ type: 'explain', title: title, body: [].concat(body) }, o || {}); };
  const P = function (visual, cfg, prompt) { return { type: 'play', visual: visual, cfg: cfg || {}, prompt: prompt }; };
  const A = function (skill, level, count, intro) { return { type: 'ask', skill: skill, level: level, count: count || 1, intro: intro }; };
  const QZ = function (skills, count) { return { type: 'quiz', skills: skills, count: count || 5 }; };
  const legend = [['ca', 'cateta (prima)'], ['cb', 'cateta (a doua)'], ['cc', 'ipotenuza']];

  /* ---------------- Lecția 1 ---------------- */
  L.push({
    id: 'u1-l1', title: 'Triunghiul dreptunghic', goal: 'Recunoști unghiul drept, catetele și ipotenuza.',
    skills: ['p.rt.name', 'p.rt.longest'],
    screens: [
      E('Unghiul drept', ['Un triunghi dreptunghic are un **unghi drept** (90°), ca un colț de foaie.', 'Pe desen îl marcăm cu un mic pătrat.'], { figure: F.rt(4, 3, { AB: '', AC: '', BC: '' }, ['A', 'B', 'C']) }),
      P('rt-explorer', {}, 'Trage punctul $C$ sau mută cursorul. Urmărește unghiul din $A$ și lungimea lui $BC$.'),
      { type: 'question', q: 'Când unghiul din $A$ este drept, $BC = 5$, $AB = 4$ și $AC = 3$. Care latură este **cea mai lungă**?',
        options: [{ t: '$BC$, cea din fața unghiului drept', ok: true }, { t: '$AB$', ok: false, why: '$AB = 4$, dar $BC = 5$ este mai mare.' }, { t: '$AC$', ok: false, why: '$AC = 3$ este chiar cea mai scurtă.' }],
        hints: ['Compară cele trei numere: 4, 3 și 5.'], figure: F.rt(4, 3, { AB: '4', AC: '3', BC: '5' }, ['A', 'B', 'C']), skill: 'p.rt.longest' },
      E('Catete și ipotenuză', ['Latura din fața unghiului drept se numește **ipotenuză** și este cea mai lungă.', 'Celelalte două laturi, care formează unghiul drept, sunt **catetele**.'],
        { figure: F.rt(4, 3, { AB: 'catetă', AC: 'catetă', BC: 'ipotenuză' }, ['A', 'B', 'C']), legend: legend, trick: 'În tot cursul, culorile au același sens: cateta albastră, cateta portocalie, ipotenuza violetă.' }),
      A('p.rt.name', 1, 2),
      E('Triunghiul poate fi rotit', ['Unghiul drept nu este mereu jos, în stânga. Caută întotdeauna **pătrățelul**: de el pleacă catetele.'], { figure: F.rt(3.2, 4.4, null, ['N', 'P', 'M']) }),
      A('p.rt.name', 2, 2),
      A('p.rt.longest', 1, 1), A('p.rt.longest', 2, 1),
      A('p.rt.name', 3, 1, 'Capcană'),
      QZ(['p.rt.name', 'p.rt.longest'], 5),
    ],
  });

  /* ---------------- Lecția 2 ---------------- */
  L.push({
    id: 'u1-l2', title: 'Pătrate pe laturi', goal: 'Descoperi singur relația dintre ariile pătratelor de pe laturi.',
    skills: ['p.sq.area', 'p.sq.sum', 'p.rad.est'],
    screens: [
      E('Aria unui pătrat', ['Aria unui pătrat cu latura $l$ este $l^2$.', 'De exemplu, latura 3 înseamnă 9 pătrățele unitate; latura 5 înseamnă 25.']),
      A('p.sq.area', 1, 2),
      E('Pătrate pe laturi', ['Pe fiecare latură a unui triunghi dreptunghic construim câte un pătrat.', 'Ce legătură au ariile lor? Să vedem.']),
      P('pyth-squares', { a: 3, b: 4, grid: true, need: 6 }, 'Mută cursoarele $a$ și $b$. Compară cele trei arii, de câte ori vrei.'),
      { type: 'question', visual: { name: 'pyth-squares', cfg: { a: 3, b: 4, lock: true } }, q: 'Pentru $a = 3$ și $b = 4$, ariile sunt $9$, $16$ și $25$. Ce legătură există între ele?',
        options: [{ t: '$9 + 16 = 25$', ok: true }, { t: '$16 - 9 = 25$', ok: false, why: '$16 - 9 = 7$, nu $25$.' }, { t: '$9 \\cdot 16 = 25$', ok: false, why: '$9 \\cdot 16 = 144$, nu $25$.' }],
        hints: ['Caută o operație care din 9 și 16 să dea 25.', 'Încearcă adunarea.'], skill: 'p.sq.sum' },
      A('p.sq.sum', 1, 2),
      P('pyth-proof', {}, 'Aceeași idee, văzută altfel: mută cele patru triunghiuri și urmărește suprafața rămasă liberă.'),
      { type: 'reveal', formula: '\\ca{a}^2 + \\cb{b}^2 = \\cc{c}^2', title: 'Teorema lui Pitagora', text: 'Într-un triunghi dreptunghic, aria pătratului de pe ipotenuză este egală cu suma ariilor pătratelor de pe catete.', legend: legend, trick: 'Se adună **pătratele** laturilor, nu lungimile lor.' },
      A('p.sq.sum', 2, 2),
      E('Când latura nu e întreagă', ['Dacă aria nu este pătrat perfect, latura este un radical. De exemplu, $\\sqrt{50}$ este între 7 și 8, pentru că $49 < 50 < 64$.']),
      P('sqrt-line', {}, 'Mută $n$ și urmărește unde se așază $\\sqrt{n}$ pe axa numerelor.'),
      A('p.rad.est', 1, 2), A('p.sq.area', 2, 1),
      A('p.sq.sum', 3, 1, 'Capcană'),
      A('p.sq.area', 3, 1, 'Capcană'),
      QZ(['p.sq.area', 'p.sq.sum', 'p.rad.est'], 5),
    ],
  });

  /* ---------------- Lecția 3 ---------------- */
  L.push({
    id: 'u1-l3', title: 'Aflarea ipotenuzei', goal: 'Calculezi ipotenuza când cunoști catetele: rezultat întreg, rotunjit sau radical.',
    skills: ['p.rad.simp', 'p.hyp.int', 'p.hyp.dec', 'p.hyp.rad', 'p.err.spot'],
    screens: [
      E('Din catete spre ipotenuză', ['Cunoști catetele și vrei ipotenuza. Din $a^2 + b^2 = c^2$ obții:', '$$c = \\sqrt{a^2 + b^2}$$'], { trick: 'Doi pași: **adună pătratele**, apoi **extrage rădăcina**.' }),
      { type: 'example', template: 'hyp-int', seed: 11, level: 1 },
      P('pyth-solver', { mode: 'hyp' }, 'Alege catetele și urmărește calculul. Găsește două triunghiuri la care ipotenuza este număr întreg.'),
      A('p.hyp.int', 1, 3),
      E('Tripletele care apar mereu', ['$(3, 4, 5)$, $(5, 12, 13)$, $(8, 15, 17)$, $(7, 24, 25)$.', 'Multiplii lor funcționează la fel: $(6, 8, 10)$, $(9, 12, 15)$, $(10, 24, 26)$…'], { trick: 'Dacă recunoști un triplet, n-ai nevoie de calcule: răspunsul e gata.' }),
      E('Când rezultatul e un radical', ['Dacă $a^2 + b^2$ nu e pătrat perfect, ipotenuza este un radical. Îl simplificăm scoțând factorii pătrați:', '$$\\sqrt{50} = \\sqrt{25 \\cdot 2} = 5\\sqrt{2}$$']),
      A('p.rad.simp', 1, 2),
      A('p.hyp.rad', 2, 2),
      E('Valoare aproximativă', ['Uneori problema cere rotunjirea. Calculezi radicalul și rotunjești: $\\sqrt{29} \\approx 5{,}4$.']),
      A('p.hyp.dec', 2, 2),
      A('p.err.spot', 1, 2, 'Unde a greșit?'),
      A('p.hyp.int', 2, 1), A('p.hyp.dec', 3, 1, 'Mai greu'),
      QZ(['p.rad.simp', 'p.hyp.int', 'p.hyp.dec', 'p.hyp.rad', 'p.err.spot'], 5),
    ],
  });

  /* ---------------- Lecția 4 ---------------- */
  L.push({
    id: 'u1-l4', title: 'Aflarea unei catete', goal: 'Calculezi o catetă când cunoști ipotenuza și cealaltă catetă.',
    skills: ['p.leg.int', 'p.leg.dec', 'p.leg.rad'],
    screens: [
      E('Ipotenuza este „totalul”', ['Din $c^2 = a^2 + b^2$ rezultă că o catetă se află prin **scădere**:', '$$b^2 = c^2 - a^2$$'], { trick: 'Ipotenuza e cea mai lungă latură, de aceea ea este cea din care scazi.' }),
      P('pyth-solver', { mode: 'leg' }, 'Alege ipotenuza $c$ și cateta $a$. Observă ce se întâmplă când $a$ se apropie de $c$.'),
      { type: 'question', q: 'Ipotenuza are 13, o catetă are 5. Cum afli cealaltă catetă?',
        options: [{ t: '$\\sqrt{13^2 - 5^2}$', ok: true }, { t: '$\\sqrt{13^2 + 5^2}$', ok: false, why: 'Ipotenuza este dată: cealaltă catetă se află prin **scădere**, nu prin adunare.' }, { t: '$13 - 5$', ok: false, why: 'Se scad **pătratele**, nu lungimile.' }, { t: '$\\sqrt{13} - \\sqrt{5}$', ok: false, why: 'Radicalul se extrage din rezultatul scăderii pătratelor.' }],
        hints: ['Care latură este ipotenuza? Ea este „totalul” în relația lui Pitagora.'], skill: 'p.leg.int', figure: F.rt(5, 12, { AB: '5', AC: '?', BC: '13' }, ['A', 'B', 'C']) },
      { type: 'example', template: 'leg-int', seed: 5, level: 1 },
      A('p.leg.int', 1, 3),
      A('p.leg.dec', 2, 2), A('p.leg.rad', 2, 1),
      A('p.err.spot', 2, 2, 'Unde a greșit?'),
      A('p.leg.int', 2, 1), A('p.leg.rad', 3, 1, 'Mai greu'),
      QZ(['p.leg.int', 'p.leg.dec', 'p.leg.rad', 'p.err.spot'], 5),
    ],
  });
})(window.M);
