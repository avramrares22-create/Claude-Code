/* Unitatea 1 — lecțiile 5–8. */
(function (M) {
  'use strict';
  const F = M.fig;
  const L = M.u1.unit.lessons;
  const E = function (title, body, o) { return Object.assign({ type: 'explain', title: title, body: [].concat(body) }, o || {}); };
  const P = function (visual, cfg, prompt) { return { type: 'play', visual: visual, cfg: cfg || {}, prompt: prompt }; };
  const A = function (skill, level, count, intro) { return { type: 'ask', skill: skill, level: level, count: count || 1, intro: intro }; };
  const QZ = function (skills, count) { return { type: 'quiz', skills: skills, count: count || 5 }; };
  const legend = [['ca', 'cateta (prima)'], ['cb', 'cateta (a doua)'], ['cc', 'ipotenuza']];

  /* ---------------- Lecția 5 ---------------- */
  L.push({
    id: 'u1-l5', title: 'Reciproca teoremei', goal: 'Verifici dacă un triunghi este dreptunghic doar din laturi.',
    skills: ['p.conv.check', 'p.conv.triple', 'p.conv.nature'],
    screens: [
      E('Răsturnăm întrebarea', ['Până acum știam că triunghiul are unghi drept. Dar dacă ți se dau doar laturile?', 'Poți afla dacă unghiul din fața celei mai lungi laturi este drept?']),
      P('converse-sticks', {}, 'Alege trei lungimi. Caută triunghiuri ascuțitunghice, dreptunghice și obtuzunghice.'),
      { type: 'question', q: 'Când $a^2 + b^2 = c^2$, cum este unghiul din fața laturii $c$?',
        options: [{ t: 'Drept', ok: true }, { t: 'Ascuțit', ok: false, why: 'Unghiul este ascuțit când $a^2 + b^2 > c^2$.' }, { t: 'Obtuz', ok: false, why: 'Unghiul este obtuz când $a^2 + b^2 < c^2$.' }],
        hints: ['Ai văzut-o în joc: la egalitate apare pătrățelul.'], skill: 'p.conv.nature' },
      { type: 'reveal', formula: '\\ca{a}^2 + \\cb{b}^2 = \\cc{c}^2 \\;\\Rightarrow\\; \\angle = 90°', title: 'Reciproca teoremei lui Pitagora', text: 'Dacă într-un triunghi pătratul celei mai lungi laturi este egal cu suma pătratelor celorlalte două, triunghiul este dreptunghic.', trick: 'Pune mereu **cea mai lungă latură** în locul lui $c$ și verifică egalitatea.' },
      A('p.conv.check', 1, 2),
      A('p.conv.triple', 1, 2),
      A('p.conv.nature', 1, 2),
      A('p.conv.check', 2, 1), A('p.conv.triple', 2, 1),
      A('p.conv.nature', 2, 1),
      A('p.conv.triple', 3, 1, 'Pentru olimpiadă'),
      QZ(['p.conv.check', 'p.conv.triple', 'p.conv.nature'], 5),
    ],
  });

  /* ---------------- Lecția 6 ---------------- */
  L.push({
    id: 'u1-l6', title: 'Pitagora în figuri', goal: 'Găsești triunghiul dreptunghic ascuns în dreptunghi, pătrat, romb, trapez și în plan.',
    skills: ['p.fig.rect', 'p.fig.square', 'p.fig.iso', 'p.fig.equi', 'p.fig.rhomb', 'p.fig.trap', 'p.fig.coord'],
    screens: [
      E('Caută triunghiul dreptunghic', ['Triunghiul dreptunghic se ascunde în multe figuri: într-o diagonală, într-o înălțime, în jumătatea unei diagonale.', 'Misiunea ta: să-l găsești și să-l colorezi în minte.']),
      P('shape-lab', {}, 'Explorează fiecare figură. Mută cursoarele și vezi triunghiul dreptunghic colorat.'),
      E('Dreptunghi și pătrat', ['Diagonala dreptunghiului este ipotenuza: $d^2 = a^2 + b^2$.', 'La pătrat, $a = b = l$, deci $d = l\\sqrt{2}$.'], { trick: 'Diagonala pătratului = latura · $\\sqrt{2}$.' }),
      A('p.fig.rect', 1, 2), A('p.fig.square', 1, 2),
      E('Triunghiul isoscel', ['Înălțimea din vârf cade în **mijlocul** bazei. Obții un triunghi dreptunghic cu o catetă egală cu **jumătate din bază**.']),
      A('p.fig.iso', 1, 2),
      E('Triunghiul echilateral', ['Înălțimea unui triunghi echilateral cu latura $l$ este', '$$h = \\frac{l\\sqrt{3}}{2}$$'], { trick: 'Latura $l$, jumătatea bazei $\\frac{l}{2}$ și înălțimea $h$ formează un triunghi dreptunghic.' }),
      A('p.fig.equi', 1, 2),
      E('Romb și trapez', ['Diagonalele rombului sunt perpendiculare și se înjumătățesc. În trapez duci înălțimile și obții triunghiuri dreptunghice.']),
      A('p.fig.rhomb', 1, 2), A('p.fig.trap', 1, 2),
      E('Distanța dintre două puncte', ['Pentru $A(x_1, y_1)$ și $B(x_2, y_2)$, desenezi un triunghi dreptunghic cu catetele paralele cu axele:', '$$AB = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$']),
      P('coord-plane', {}, 'Mută punctele $A$ și $B$ pe grilă și urmărește triunghiul dreptunghic.'),
      A('p.fig.coord', 1, 2),
      A('p.fig.rect', 2, 1, 'Mai greu'), A('p.fig.square', 2, 1), A('p.fig.iso', 2, 1), A('p.fig.equi', 2, 1),
      A('p.fig.rhomb', 2, 1), A('p.fig.trap', 2, 1), A('p.fig.coord', 2, 1),
      A('p.fig.rect', 3, 1, 'Capcană'), A('p.fig.trap', 3, 1),
      QZ(['p.fig.rect', 'p.fig.square', 'p.fig.iso', 'p.fig.equi', 'p.fig.rhomb', 'p.fig.trap', 'p.fig.coord'], 7),
    ],
  });

  /* ---------------- Lecția 7 ---------------- */
  L.push({
    id: 'u1-l7', title: 'Probleme din viața reală', goal: 'Transformi o poveste într-un triunghi dreptunghic și o rezolvi.',
    skills: ['p.app.ladder', 'p.app.screen', 'p.app.path', 'p.app.multi'],
    screens: [
      E('Rețeta unei probleme cu text', ['**1.** Desenează situația.', '**2.** Găsește triunghiul dreptunghic.', '**3.** Hotărăște care latură este ipotenuza.', '**4.** Aplică Pitagora și verifică dacă rezultatul are sens (ipotenuza e cea mai lungă).']),
      P('ladder-lab', {}, 'O scară de 5 m stă sprijinită de perete. Depărtează baza și urmărește cât de sus ajunge.'),
      A('p.app.ladder', 1, 2),
      A('p.app.screen', 1, 1), A('p.app.screen', 2, 1),
      A('p.app.path', 1, 1), A('p.app.path', 2, 1),
      E('Probleme în doi pași', ['Uneori mai întâi afli o latură intermediară (o diagonală, o înălțime) și apoi o folosești mai departe.', 'Scrie fiecare pas pe rând, cu triunghiul lui.']),
      A('p.app.multi', 1, 2), A('p.app.multi', 2, 1),
      A('p.app.ladder', 2, 1), A('p.app.ladder', 3, 1, 'Scara alunecă'),
      A('p.app.screen', 3, 1, 'Ecran și inci'),
      QZ(['p.app.ladder', 'p.app.screen', 'p.app.path', 'p.app.multi'], 5),
    ],
  });

  /* ---------------- Lecția 8 ---------------- */
  L.push({
    id: 'u1-l8', title: 'Înălțimea și cateta', goal: 'Folosești teorema înălțimii și teorema catetei și afli înălțimea din arii.',
    skills: ['p.met.proj', 'p.met.height', 'p.met.leg', 'p.met.hside'],
    screens: [
      E('Înălțimea din unghiul drept', ['În $\\triangle ABC$ dreptunghic în $A$, înălțimea $AD$ împarte ipotenuza în $BD$ și $DC$.', 'Aceste segmente se numesc **proiecțiile** catetelor pe ipotenuză.'], { figure: F.hgt(4, 9, { BD: 'BD', DC: 'DC', AD: 'AD', AB: '', AC: '' }) }),
      P('height-lab', { mode: 'height' }, 'Mută $p = BD$ și $q = DC$. Compară produsul $p \\cdot q$ cu $AD^2$.'),
      { type: 'question', q: 'Pentru $BD = 4$ și $DC = 9$, înălțimea este $AD = 6$. Ce legătură ai observat?',
        options: [{ t: '$AD^2 = BD \\cdot DC$', ok: true }, { t: '$AD = BD + DC$', ok: false, why: '$4 + 9 = 13$, nu $6$.' }, { t: '$AD = (BD + DC) : 2$', ok: false, why: 'Media ar fi $6{,}5$, nu $6$.' }],
        hints: ['Calculează $AD^2$ și compară cu $4 \\cdot 9$.'], skill: 'p.met.height', figure: F.hgt(4, 9, { BD: '4', DC: '9', AD: '6' }) },
      { type: 'reveal', formula: '\\cm{AD}^2 = \\ca{BD} \\cdot \\cb{DC}', title: 'Teorema înălțimii', text: 'Pătratul înălțimii din unghiul drept este egal cu produsul proiecțiilor catetelor pe ipotenuză.', trick: 'Înălțimea este „media geometrică” a proiecțiilor: $AD = \\sqrt{BD \\cdot DC}$.' },
      A('p.met.proj', 1, 2), A('p.met.height', 1, 2),
      P('height-lab', { mode: 'leg', p: 4, q: 5 }, 'Același triunghi. Compară dreptunghiul $BD \\cdot BC$ cu pătratul de latură $AB$.'),
      { type: 'reveal', formula: '\\cm{AB}^2 = \\ca{BD} \\cdot BC \\quad AC^2 = \\cb{DC} \\cdot BC', title: 'Teorema catetei', text: 'Pătratul unei catete este egal cu produsul dintre proiecția ei pe ipotenuză și ipotenuza întreagă.', trick: 'Cateta și proiecția ei împart același capăt: $AB$ cu $BD$ (în $B$), $AC$ cu $DC$ (în $C$).' },
      A('p.met.leg', 1, 2), A('p.met.proj', 2, 1),
      E('A treia metodă pentru înălțime', ['Aria triunghiului se scrie în două moduri:', '$$\\frac{AB \\cdot AC}{2} = \\frac{BC \\cdot AD}{2} \\;\\Rightarrow\\; AD = \\frac{AB \\cdot AC}{BC}$$'], { trick: 'Cunoști catetele? Află ipotenuza cu Pitagora, apoi înălțimea cu formula de mai sus.' }),
      A('p.met.hside', 1, 2),
      A('p.met.height', 2, 1), A('p.met.leg', 2, 1),
      A('p.met.height', 3, 1, 'Mai greu'), A('p.met.leg', 3, 1),
      QZ(['p.met.proj', 'p.met.height', 'p.met.leg', 'p.met.hside'], 5),
    ],
  });
})(window.M);
