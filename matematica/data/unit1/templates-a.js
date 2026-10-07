/* Unitatea 1 — familii de exerciții, partea A: triunghiul dreptunghic, pătrate, radicali, ipotenuza, catetele, greșeli. */
(function (M) {
  'use strict';
  const U = M.u1, D = M.defineTemplate, mk = M.mk, F = M.fig;
  const SETS = U.SETS, UN = U.UNITS;
  const cm = function (u) { return M.unit(u); };
  const cm2 = function (u) { return M.unit(u, 2); };
  const sideName = function (names, i, j) { return names[Math.min(i, j)] + names[Math.max(i, j)]; };
  const T = function (s) { return '$' + s + '$'; };

  /* ================= 1. Recunoaște catetele și ipotenuza ================= */
  D({
    id: 'rt-name', skill: 'p.rt.name', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      SETS.forEach(function (s, si) {
        for (let v = 0; v < 3; v++) {
          (level === 1 ? ['hyp'] : level === 2 ? ['legs', 'vertex'] : ['rev']).forEach(function (t) { out.push({ s: si, v: v, t: t }); });
        }
      });
      return out;
    },
    build: function (p, level, r) {
      const names = SETS[p.s];
      const rv = names[p.v];
      const idx = [0, 1, 2].filter(function (i) { return i !== p.v; });
      const hyp = sideName(names, idx[0], idx[1]);
      const legA = sideName(names, p.v, idx[0]), legB = sideName(names, p.v, idx[1]);
      const sides = [sideName(names, 0, 1), sideName(names, 0, 2), sideName(names, 1, 2)];
      const tri = names.join('');
      const fig = F.rt(r.chance(0.5) ? 5.4 : 4, r.chance(0.5) ? 3.4 : 4.4, null, [rv, names[idx[0]], names[idx[1]]]);
      const ex = { figure: fig };
      if (p.t === 'hyp') {
        ex.text = 'Triunghiul ' + T(tri) + ' este dreptunghic în ' + T(rv) + '. Care este **ipotenuza**?';
        ex.choices = sides.map(function (sd) {
          const ok = sd === hyp;
          return { label: T(sd), ok: ok, tag: ok ? null : 'leg-as-hyp', why: ok ? null : T(sd) + ' este o catetă: are un capăt în ' + T(rv) + ', vârful unghiului drept. Ipotenuza este latura din fața lui.' };
        });
        ex.hints = ['Ipotenuza este latura opusă unghiului drept — nu are niciun capăt în ' + T(rv) + '.', 'Din cele trei laturi, două pornesc din ' + T(rv) + ' (ele sunt catetele). A treia este ipotenuza.'];
        ex.steps = ['Unghiul drept este în ' + T(rv) + '.', 'Laturile care pornesc din ' + T(rv) + ' sunt catetele: ' + T(legA) + ' și ' + T(legB) + '.', 'Latura rămasă, ' + T(hyp) + ', este ipotenuza.'];
      } else if (p.t === 'legs') {
        ex.text = 'Triunghiul ' + T(tri) + ' este dreptunghic în ' + T(rv) + '. Care sunt **catetele**?';
        const L = [[legA, legB, true], [legA, hyp, false], [legB, hyp, false]];
        ex.choices = L.map(function (x) {
          return { label: T(x[0]) + ' și ' + T(x[1]), ok: x[2], tag: x[2] ? null : 'hyp-as-leg', why: x[2] ? null : T(hyp) + ' este ipotenuza (în fața unghiului drept), nu o catetă. Catetele sunt laturile care formează unghiul drept.' };
        });
        ex.hints = ['Catetele sunt cele două laturi care formează unghiul drept.', 'Ipotenuza ' + T(hyp) + ' nu poate fi aleasă: ea este în fața unghiului drept.'];
        ex.steps = ['Unghiul drept este în ' + T(rv) + '.', 'Catetele pornesc din ' + T(rv) + ': ' + T(legA) + ' și ' + T(legB) + '.'];
      } else if (p.t === 'vertex') {
        ex.text = 'În figură, unghiul drept este marcat cu un pătrățel. În care vârf este **unghiul drept**?';
        ex.choices = names.map(function (n) {
          const ok = n === rv;
          return { label: T(n), ok: ok, tag: ok ? null : 'wrong-vertex', why: ok ? null : 'În ' + T(n) + ' unghiul nu are pătrățelul. Caută semnul unghiului drept în figură.' };
        });
        ex.keepOrder = true;
        ex.hints = ['Caută pătrățelul mic din colțul triunghiului.', 'Unghiul drept este cel de 90°, ca un colț de foaie.'];
        ex.steps = ['Pătrățelul este în vârful ' + T(rv) + ', deci ' + T('\\angle ' + rv + ' = 90°') + '.'];
      } else {
        const eq = legA + '^2 + ' + legB + '^2 = ' + hyp + '^2';
        ex.figure = null;
        ex.text = 'Într-un triunghi ' + T(tri) + ' se știe că ' + T(eq) + '. În care vârf este **unghiul drept**?';
        ex.choices = names.map(function (n) {
          const ok = n === rv;
          return { label: T(n), ok: ok, tag: ok ? null : 'wrong-vertex', why: ok ? null : 'Ipotenuza este ' + T(hyp) + ' (latura din dreapta egalului). Unghiul drept este în fața ei, în ' + T(rv) + ', nu în ' + T(n) + '.' };
        });
        ex.keepOrder = true;
        ex.hints = ['În relația lui Pitagora, latura de după „=” este ipotenuza.', 'Unghiul drept este în vârful opus ipotenuzei.'];
        ex.steps = ['Ipotenuza este ' + T(hyp) + ' (apare la dreapta egalului).', 'Unghiul drept este opus ipotenuzei, deci în ' + T(rv) + '.'];
      }
      return ex;
    },
    verify: function (p, ex) {
      const names = SETS[p.s], rv = names[p.v];
      const idx = [0, 1, 2].filter(function (i) { return i !== p.v; });
      const hyp = sideName(names, idx[0], idx[1]);
      const ok = ex.options.filter(function (o) { return o.ok; })[0];
      if (p.t === 'hyp') return ok.label === T(hyp);
      if (p.t === 'legs') return ok.label === T(sideName(names, p.v, idx[0])) + ' și ' + T(sideName(names, p.v, idx[1]));
      return ok.label === T(rv);
    },
  });

  /* ================= 2. Ipotenuza este cea mai lungă latură ================= */
  const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  D({
    id: 'rt-longest', skill: 'p.rt.longest', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(30).forEach(function (t, i) { PERMS.forEach(function (pm, j) { out.push({ t: 'which', a: t[0], b: t[1], c: t[2], pm: j, u: (i + j) % 3 }); }); });
      else if (level === 2) U.triples(60).forEach(function (t, i) { UN.forEach(function (u, j) { out.push({ t: 'imp', a: t[0], b: t[1], c: t[2], u: j, sw: i % 2 }); }); });
      else for (let a = 2; a <= 20; a++) for (let b = a + 1; b <= 20; b++) out.push({ t: 'bounds', a: a, b: b, u: (a + b) % 3 });
      return out;
    },
    build: function (p, level) {
      const u = UN[p.u];
      const ex = {};
      if (p.t === 'which') {
        const vals = [p.a, p.b, p.c];
        const sh = PERMS[p.pm].map(function (i) { return vals[i]; });
        ex.text = 'Un triunghi dreptunghic are laturile de ' + U.val(sh[0], u) + ', ' + U.val(sh[1], u) + ' și ' + U.val(sh[2], u) + '. Care este lungimea **ipotenuzei**?';
        ex.choices = sh.map(function (v) {
          const ok = v === p.c;
          return { label: U.val(v, u), ok: ok, tag: ok ? null : 'leg-as-hyp', why: ok ? null : U.val(v, u) + ' este o catetă. Ipotenuza este cea mai lungă latură a triunghiului dreptunghic.' };
        });
        ex.keepOrder = true;
        ex.hints = ['Ipotenuza este cea mai lungă latură a unui triunghi dreptunghic.', 'Compară cele trei numere: care este cel mai mare?'];
        ex.steps = ['Cea mai lungă latură a triunghiului dreptunghic este ipotenuza.', 'Cel mai mare număr este ' + T(p.c) + ', deci ipotenuza are ' + U.val(p.c, u) + '.'];
      } else if (p.t === 'imp') {
        const a = p.a, b = p.b, c = p.c;
        const cands = [
          { v: c, ok: true },
          { v: b, ok: false, why: 'Ipotenuza este mai lungă decât **oricare** catetă, deci nu poate fi egală cu ' + U.val(b, u) + '.' },
          { v: a + b, ok: false, why: 'Într-un triunghi, orice latură este mai mică decât suma celorlalte două. Ipotenuza nu poate fi ' + T(a + '+' + b) + '.' },
          { v: M.round((a + b) / 2, 1), ok: false, why: 'Media catetelor este prea mică: ipotenuza e mai lungă decât cea mai lungă catetă (' + T(b) + ').' },
        ];
        ex.text = 'Un triunghi dreptunghic are catetele de ' + U.val(a, u) + ' și ' + U.val(b, u) + '. Care dintre valorile de mai jos poate fi lungimea **ipotenuzei**?';
        ex.choices = cands.map(function (x) { return { label: U.val(x.v, u, 1), ok: x.ok, tag: x.ok ? null : 'bad-range', why: x.why }; });
        ex.hints = ['Ipotenuza este mai lungă decât fiecare catetă.', 'Dar ea este mai scurtă decât suma catetelor. Încearcă Pitagora: ' + T(a + '^2 + ' + b + '^2') + '.'];
        ex.steps = [T('c^2 = ' + a + '^2 + ' + b + '^2 = ' + (a * a) + ' + ' + (b * b) + ' = ' + (c * c)), T('c = \\sqrt{' + (c * c) + '} = ' + c)];
      } else {
        const a = p.a, b = p.b;
        const lo = b, hi = a + b;
        const sts = [
          { t: T(lo + ' < c < ' + hi), ok: true },
          { t: T('c < ' + lo), ok: false, why: 'Ipotenuza este mai lungă decât orice catetă, deci mai mare decât ' + T(lo) + '.' },
          { t: T('c = ' + hi), ok: false, why: 'Suma catetelor este mereu **mai mare** decât ipotenuza (inegalitatea triunghiului).' },
          { t: T('c = ' + lo), ok: false, why: 'Ipotenuza nu poate fi egală cu o catetă: ' + T('c^2 = ' + a + '^2 + ' + lo + '^2') + ' este mai mare decât ' + T(lo + '^2') + '.' },
        ];
        ex.text = 'Un triunghi dreptunghic are catetele ' + T('a = ' + a) + ' și ' + T('b = ' + b) + '. Ipotenuza se notează ' + T('c') + '. Care afirmație este **adevărată**?';
        ex.choices = sts.map(function (x) { return { label: x.t, ok: x.ok, tag: x.ok ? null : 'bad-range', why: x.why }; });
        ex.hints = ['Ipotenuza este cea mai lungă latură, dar într-un triunghi nicio latură nu depășește suma celorlalte două.', 'Estimează: ' + T('c = \\sqrt{' + (a * a + b * b) + '}') + '. Între ce numere întregi se află?'];
        ex.steps = [T('c^2 = ' + (a * a) + ' + ' + (b * b) + ' = ' + (a * a + b * b)), T(b + '^2 = ' + (b * b) + ' < ' + (a * a + b * b) + ' < ' + (a + b) * (a + b) + ' = (' + a + '+' + b + ')^2'), 'Deci ' + T(lo + ' < c < ' + hi) + '.'];
      }
      return ex;
    },
    verify: function (p, ex) {
      const ok = ex.options.filter(function (o) { return o.ok; })[0];
      if (p.t === 'which') return ok.label === U.val(p.c, UN[p.u]) && U.isRight(p.a, p.b, p.c);
      if (p.t === 'imp') return ok.label === U.val(p.c, UN[p.u], 1) && U.isRight(p.a, p.b, p.c);
      const c = Math.sqrt(p.a * p.a + p.b * p.b);
      return c > p.b && c < p.a + p.b && ok.label === T(p.b + ' < c < ' + (p.a + p.b));
    },
  });

  /* ================= 3. Aria pătratului și latura ================= */
  D({
    id: 'sq-area', skill: 'p.sq.area', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) for (let s = 1; s <= 12; s++) for (let u = 0; u < 3; u++) { out.push({ t: 'area', s: s, u: u }); out.push({ t: 'side', s: s, u: u }); }
      else if (level === 2) for (let s = 13; s <= 30; s++) for (let u = 0; u < 3; u++) { out.push({ t: 'area', s: s, u: u }); out.push({ t: 'side', s: s, u: u }); out.push({ t: 'perim', s: s, u: u }); }
      else {
        for (let n = 2; n <= 90; n++) { if (M.isSquare(n)) continue; for (let u = 0; u < 2; u++) out.push({ t: 'radside', n: n, u: u }); }
        for (let k = 2; k <= 9; k++) for (const m of [2, 3, 5, 6, 7]) out.push({ t: 'radarea', k: k, m: m, u: 0 });
      }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      if (p.t === 'area') {
        ex.text = 'Un pătrat are latura de ' + U.val(p.s, u) + '. Calculează **aria** pătratului.';
        ex.answer = { kind: 'int', value: p.s * p.s, unit: cm2(u) };
        ex.mistakes = [mk.int(2 * p.s, 'double', 'Ai calculat ' + T('2 \\cdot ' + p.s) + '. Aria pătratului este latura la pătrat: ' + T(p.s + '^2 = ' + p.s + ' \\cdot ' + p.s) + '.'), mk.int(4 * p.s, 'perimeter', 'Ai calculat perimetrul (' + T('4 \\cdot ' + p.s) + '). Aria este ' + T(p.s + '^2') + '.')];
        ex.hints = ['Aria unui pătrat cu latura ' + T('l') + ' este ' + T('l^2') + '.', 'Înmulțește latura cu ea însăși.'];
        ex.steps = [T('A = l^2 = ' + p.s + '^2 = ' + p.s * p.s + '\\,\\text{' + u + '}^{2}')];
      } else if (p.t === 'side') {
        const A = p.s * p.s;
        ex.text = 'Aria unui pătrat este ' + T(A + '\\,\\text{' + u + '}^{2}') + '. Care este **latura** pătratului?';
        ex.answer = { kind: 'int', value: p.s, unit: cm(u) };
        ex.mistakes = [mk.int(A / 2, 'half', 'Ai împărțit aria la 2. Latura este numărul care, înmulțit cu el însuși, dă ' + T(A) + ' — adică ' + T('\\sqrt{' + A + '}') + '.'), mk.int(A / 4, 'quarter', 'Ai împărțit aria la 4 (ca la perimetru). Latura este ' + T('\\sqrt{' + A + '}') + '.')];
        ex.hints = ['Latura este numărul care înmulțit cu el însuși dă aria.', 'Caută rădăcina pătrată: ' + T('\\sqrt{' + A + '}') + '.'];
        ex.steps = [T('l^2 = ' + A), T('l = \\sqrt{' + A + '} = ' + p.s + '\\,\\text{' + u + '}')];
      } else if (p.t === 'perim') {
        ex.text = 'Perimetrul unui pătrat este ' + U.val(4 * p.s, u) + '. Calculează **aria** pătratului.';
        ex.answer = { kind: 'int', value: p.s * p.s, unit: cm2(u) };
        ex.mistakes = [mk.int(4 * p.s * 4 * p.s, 'sq-perim', 'Ai ridicat perimetrul la pătrat. Mai întâi află latura: ' + T('l = P : 4 = ' + p.s) + ', apoi aria ' + T('l^2') + '.'), mk.int(p.s * 4, 'perimeter', 'Ai dat chiar perimetrul. Aria este ' + T('l^2') + ', cu ' + T('l = ' + p.s) + '.'), mk.int(2 * p.s, 'double', 'Aria nu este dublul laturii: este ' + T('l^2') + '.')];
        ex.hints = ['Perimetrul pătratului este ' + T('4l') + '. Află mai întâi latura.', 'Apoi calculează ' + T('l^2') + '.'];
        ex.steps = [T('l = ' + 4 * p.s + ' : 4 = ' + p.s), T('A = l^2 = ' + p.s + '^2 = ' + p.s * p.s)];
      } else if (p.t === 'radside') {
        ex.text = 'Aria unui pătrat este ' + T(p.n + '\\,\\text{' + u + '}^{2}') + '. Scrie **latura** sub formă de radical simplificat.';
        const s = M.simplifyRadical(p.n);
        ex.answer = { kind: 'rad', value: Math.sqrt(p.n), n: p.n, unit: cm(u) };
        ex.mistakes = [mk.int(M.round(p.n / 2, 0), 'half', 'Latura nu este jumătate din arie: ' + T('l = \\sqrt{' + p.n + '}') + '.')];
        if (s.b !== p.n) ex.mistakes.push(mk.rad(p.n, 'not-simplified', 'Valoarea e corectă, dar radicalul se mai poate simplifica: scoate factorii pătrați de sub radical.', true));
        ex.mistakes.push(mk.int(p.n, 'forgot-root', 'Ai dat chiar aria. Latura este ' + T('\\sqrt{' + p.n + '}') + '.'));
        ex.hints = ['Latura este ' + T('\\sqrt{A}') + '.', 'Caută cel mai mare pătrat perfect care îl împarte pe ' + T(p.n) + '.'];
        ex.steps = [T('l = \\sqrt{' + p.n + '}'), T('l = ' + M.radTex(p.n) + '\\,\\text{' + u + '}')];
      } else {
        const A = p.k * p.k * p.m;
        ex.text = 'Un pătrat are latura ' + T(p.k + '\\sqrt{' + p.m + '}\\,\\text{' + u + '}') + '. Calculează **aria** pătratului.';
        ex.answer = { kind: 'int', value: A, unit: cm2(u) };
        ex.mistakes = [mk.int(p.k * p.k + p.m, 'square-sum', 'Ai ridicat la pătrat separat: ' + T('(' + p.k + '\\sqrt{' + p.m + '})^2 = ' + p.k + '^2 \\cdot (\\sqrt{' + p.m + '})^2 = ' + p.k * p.k + '\\cdot' + p.m) + ' — se înmulțesc, nu se adună.'), mk.int(p.k * p.m, 'no-square', 'Ai uitat să ridici la pătrat factorul ' + T(p.k) + '.'), mk.int(2 * p.k * p.m, 'double', 'Aria este latura la pătrat, nu dublul ei.')];
        ex.hints = ['Aria este ' + T('l^2') + '.', T('(a\\sqrt{b})^2 = a^2 \\cdot b') + ' deoarece ' + T('(\\sqrt{b})^2 = b') + '.'];
        ex.steps = [T('A = (' + p.k + '\\sqrt{' + p.m + '})^2 = ' + p.k + '^2 \\cdot ' + p.m + ' = ' + p.k * p.k + ' \\cdot ' + p.m + ' = ' + A)];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'area' || p.t === 'perim') return v === p.s * p.s;
      if (p.t === 'side') return v === p.s && v * v === p.s * p.s;
      if (p.t === 'radside') return Math.abs(v * v - p.n) < 1e-9 && ex.answer.n === p.n;
      return v === p.k * p.k * p.m;
    },
  });

  /* ================= 4. Aria pătratului de pe ipotenuză = suma ariilor ================= */
  D({
    id: 'sq-sum', skill: 'p.sq.sum', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(25).forEach(function (t) { out.push({ t: 'big', x: t[0] * t[0], y: t[1] * t[1], u: 0 }); out.push({ t: 'small', x: t[0] * t[0], z: t[2] * t[2], u: 1 }); out.push({ t: 'small', x: t[1] * t[1], z: t[2] * t[2], u: 2 }); });
      else if (level === 2) for (let x = 4; x <= 60; x++) for (let y = x + 1; y <= 60 && x + y <= 110; y += 3) { out.push({ t: 'big', x: x, y: y, u: (x + y) % 3 }); out.push({ t: 'small', x: x, z: x + y, u: (x * y) % 3 }); }
      else {
        for (let x = 1; x <= 60; x++) for (let y = x; y <= 60; y++) {
          const s = x + y;
          if (M.isSquare(s)) out.push({ t: 'side', x: x, y: y, u: (x + y) % 3 });
          else if (s <= 90 && (x * y) % 4 === 1) out.push({ t: 'siderad', x: x, y: y, u: (x + y) % 3 });
        }
      }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const base = function (x, y, z, labels) {
        return F.rtSquares(Math.sqrt(x), Math.sqrt(y), labels);
      };
      const lead = 'În figură, pe laturile triunghiului dreptunghic ' + T('ABC') + ' (dreptunghic în ' + T('A') + ') sunt construite pătrate. ';
      if (p.t === 'big') {
        const z = p.x + p.y;
        ex.figure = base(p.x, p.y, z, [p.x, p.y, '?']);
        ex.text = lead + 'Pătratul de pe ' + T('AB') + ' are aria ' + T(p.x + '\\,\\text{' + u + '}^{2}') + ', iar cel de pe ' + T('AC') + ' are aria ' + T(p.y + '\\,\\text{' + u + '}^{2}') + '. Care este aria pătratului de pe **ipotenuza** ' + T('BC') + '?';
        ex.answer = { kind: 'int', value: z, unit: cm2(u) };
        ex.mistakes = [mk.int(Math.abs(p.y - p.x), 'subtract', 'Ai scăzut ariile. Aria pătratului de pe ipotenuză este **suma** ariilor pătratelor de pe catete.'), mk.int(p.x * p.y, 'product', 'Ai înmulțit ariile. Teorema lui Pitagora spune că se adună.'), mk.int(Math.round(Math.sqrt(z) * 10) / 10 === Math.round(Math.sqrt(z)) ? Math.round(Math.sqrt(z)) : 2 * z, 'root-too-early', 'Ai extras rădăcina, dar se cerea chiar **aria** pătratului.')];
        ex.hints = ['Pitagora, în desen: aria pătratului de pe ipotenuză = suma ariilor pătratelor de pe catete.', 'Adună cele două arii date.'];
        ex.steps = [T('c^2 = a^2 + b^2'), T('\\text{Aria}_{BC} = ' + p.x + ' + ' + p.y + ' = ' + z)];
      } else if (p.t === 'small') {
        const y = p.z - p.x;
        ex.figure = base(p.x, y, p.z, [p.x, '?', p.z]);
        ex.text = lead + 'Pătratul de pe ipotenuza ' + T('BC') + ' are aria ' + T(p.z + '\\,\\text{' + u + '}^{2}') + ', iar cel de pe ' + T('AB') + ' are aria ' + T(p.x + '\\,\\text{' + u + '}^{2}') + '. Care este aria pătratului de pe cateta ' + T('AC') + '?';
        ex.answer = { kind: 'int', value: y, unit: cm2(u) };
        ex.mistakes = [mk.int(p.z + p.x, 'add-instead', 'Ai adunat. Ipotenuza este „suma” celorlalte două: ca să găsești o catetă, **scazi** din aria mare aria cunoscută.'), mk.int(Math.round(Math.sqrt(y)), 'root-too-early', 'Ai extras rădăcina, dar se cerea **aria** pătratului, nu latura lui.'), mk.int(p.z * p.x, 'product', 'Ariile nu se înmulțesc.')];
        ex.hints = ['Aria mare = aria mică 1 + aria mică 2.', 'Scade din aria mare aria cunoscută.'];
        ex.steps = [T(p.z + ' = ' + p.x + ' + x'), T('x = ' + p.z + ' - ' + p.x + ' = ' + y)];
      } else {
        const s = p.x + p.y;
        const side = Math.sqrt(s);
        ex.figure = base(p.x, p.y, s, [p.x, p.y, '?']);
        ex.text = lead + 'Pătratele de pe catetele ' + T('AB') + ' și ' + T('AC') + ' au ariile ' + T(p.x + '\\,\\text{' + u + '}^{2}') + ' și ' + T(p.y + '\\,\\text{' + u + '}^{2}') + '. Calculează **lungimea ipotenuzei** ' + T('BC') + (p.t === 'siderad' ? ' (radical simplificat).' : '.');
        if (p.t === 'side') ex.answer = { kind: 'int', value: side, unit: cm(u) };
        else ex.answer = { kind: 'rad', value: side, n: s, unit: cm(u) };
        ex.mistakes = [U.mkAny(s, 'forgot-root', 'Aceasta este **aria** pătratului de pe ipotenuză. Lungimea ipotenuzei este latura lui: ' + T('\\sqrt{' + s + '}') + '.'),
          M.mk.raw(M.radTex(p.x) + '+' + M.radTex(p.y), Math.sqrt(p.x) + Math.sqrt(p.y), 'sum-of-sides', 'Ai adunat laturile pătratelor: ' + T('\\sqrt{' + p.x + '} + \\sqrt{' + p.y + '}') + '. Se adună **ariile**, apoi se extrage rădăcina din sumă.')];
        if (p.t === 'side') ex.mistakes.push(mk.int(Math.abs(p.x - p.y), 'subtract', 'Ariile se adună, nu se scad.'));
        else { const sr = M.simplifyRadical(s); if (sr.b !== s) ex.mistakes.push(mk.rad(s, 'not-simplified', 'Corect ca valoare, dar radicalul se poate simplifica.', true)); }
        ex.hints = ['Aria pătratului de pe ipotenuză este ' + T(p.x + ' + ' + p.y) + '.', 'Latura unui pătrat este rădăcina pătrată a ariei sale.'];
        ex.steps = [T('\\text{Aria}_{BC} = ' + p.x + ' + ' + p.y + ' = ' + s), T('BC = \\sqrt{' + s + '} = ' + (p.t === 'side' ? side : M.radTex(s)) + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'big') return v === p.x + p.y;
      if (p.t === 'small') return v + p.x === p.z;
      return Math.abs(v * v - (p.x + p.y)) < 1e-9;
    },
  });

  /* ================= 5. Estimarea radicalilor ================= */
  D({
    id: 'rad-est', skill: 'p.rad.est', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const hi = level === 1 ? 50 : level === 2 ? 170 : 99;
      for (let n = 2; n <= hi; n++) {
        if (M.isSquare(n)) continue;
        if (level === 3) { const x = Math.sqrt(n); const r0 = Math.round(x * 2) / 2; if (Math.abs(x - r0) < 0.2) continue; }
        out.push({ n: n, u: n % 3 });
      }
      return out;
    },
    build: function (p, level) {
      const n = p.n, x = Math.sqrt(n);
      const k = Math.floor(x);
      const ex = {};
      if (level < 3) {
        ex.text = 'Între ce numere întregi consecutive se află ' + T('\\sqrt{' + n + '}') + '?';
        const opts = [{ lo: k, ok: true }, { lo: k - 1, ok: false }, { lo: k + 1, ok: false }, { lo: k + 2, ok: false }];
        ex.choices = opts.map(function (o) {
          return { label: 'între ' + T(o.lo) + ' și ' + T(o.lo + 1), ok: o.ok, tag: o.ok ? null : 'wrong-interval', why: o.ok ? null : 'Compară pătratele: ' + T(o.lo + '^2 = ' + o.lo * o.lo) + ' și ' + T((o.lo + 1) + '^2 = ' + (o.lo + 1) * (o.lo + 1)) + '. Numărul ' + T(n) + (n > o.lo * o.lo && n < (o.lo + 1) * (o.lo + 1) ? ' ar fi între ele' : ' nu se află între ele') + '.' };
        });
        ex.keepOrder = true;
        ex.hints = ['Găsește două pătrate perfecte consecutive, între care se află ' + T(n) + '.', 'Gândește-te: ' + T(k + '^2 = ' + k * k) + ' și ' + T((k + 1) + '^2 = ' + (k + 1) * (k + 1)) + '.'];
        ex.steps = [T(k + '^2 = ' + k * k + ' < ' + n + ' < ' + (k + 1) * (k + 1) + ' = ' + (k + 1) + '^2'), T(k + ' < \\sqrt{' + n + '} < ' + (k + 1))];
      } else {
        const r0 = Math.round(x * 2) / 2;
        const set = [r0 - 1, r0 - 0.5, r0, r0 + 0.5, r0 + 1].filter(function (v) { return v > 0; });
        const pick = set.length > 4 ? (r0 - 1 > 0 ? [r0 - 1, r0, r0 + 0.5, r0 + 1] : [r0 - 0.5, r0, r0 + 0.5, r0 + 1]) : set;
        ex.text = 'Care dintre numerele de mai jos este cel mai apropiat de ' + T('\\sqrt{' + n + '}') + '?';
        ex.choices = pick.map(function (v) {
          const ok = v === r0;
          return { label: T(U.n(v, 1)), ok: ok, tag: ok ? null : 'bad-estimate', why: ok ? null : T(U.n(v, 1) + '^2 = ' + U.n(v * v, 2)) + ', iar ' + T(n) + ' este ' + (v * v < n ? 'mai mare' : 'mai mic') + ' decât atât: estimarea nu e cea mai apropiată.' };
        });
        ex.keepOrder = true;
        ex.hints = ['Află între ce numere întregi este radicalul, apoi decide cât de aproape e de fiecare.', 'Ridică opțiunile la pătrat și compară cu ' + T(n) + '.'];
        ex.steps = [T(k + '^2 = ' + k * k + ' < ' + n + ' < ' + (k + 1) * (k + 1)), 'Verificăm ' + T(U.n(r0, 1) + '^2 = ' + U.n(r0 * r0, 2)) + ', foarte aproape de ' + T(n) + '.'];
      }
      return ex;
    },
    verify: function (p, ex) {
      const x = Math.sqrt(p.n);
      const ok = ex.options.filter(function (o) { return o.ok; })[0];
      if (ex.level < 3) { const k = Math.floor(x); return ok.label === 'între ' + T(k) + ' și ' + T(k + 1); }
      return ok.label === T(U.n(Math.round(x * 2) / 2, 1));
    },
  });

  /* ================= 6. Scoaterea / introducerea factorilor sub radical ================= */
  D({
    id: 'rad-simp', skill: 'p.rad.simp', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) for (let k = 2; k <= 5; k++) for (const m of [2, 3, 5, 6, 7]) out.push({ t: 'simp', k: k, m: m });
      else if (level === 2) for (let k = 2; k <= 9; k++) for (const m of [2, 3, 5, 6, 7, 10, 11, 13]) out.push({ t: 'simp', k: k, m: m });
      else { for (let k = 2; k <= 9; k++) for (const m of [2, 3, 5, 6, 7, 10]) out.push({ t: 'intro', k: k, m: m }); for (let k = 2; k <= 7; k++) for (const m of [2, 3, 5, 7]) out.push({ t: 'simp', k: k * 2, m: m }); }
      return out;
    },
    build: function (p) {
      const n = p.k * p.k * p.m;
      const ex = {};
      if (p.t === 'simp') {
        ex.text = 'Scrie sub forma ' + T('a\\sqrt{b}') + ', cu ' + T('b') + ' cât mai mic: ' + T('\\sqrt{' + n + '}') + '.';
        ex.answer = { kind: 'rad', value: Math.sqrt(n), n: n };
        ex.mistakes = [
          mk.raw(p.k * p.k + '\\sqrt{' + p.m + '}', p.k * p.k * Math.sqrt(p.m), 'square-outside', 'Din ' + T(p.k * p.k) + ' se scoate rădăcina pătrată: ' + T('\\sqrt{' + p.k * p.k + '} = ' + p.k) + ', nu ' + T(p.k * p.k) + '.'),
          mk.raw(p.k + '+\\sqrt{' + p.m + '}', p.k + Math.sqrt(p.m), 'root-of-sum', 'Factorii se **înmulțesc**: ' + T('\\sqrt{' + p.k * p.k + '\\cdot' + p.m + '} = \\sqrt{' + p.k * p.k + '}\\cdot\\sqrt{' + p.m + '}') + ', nu se adună.'),
          mk.raw(p.m + '\\sqrt{' + p.k + '}', p.m * Math.sqrt(p.k), 'swapped', 'Ai scos factorul greșit: din ' + T(n) + ' ieșe ' + T(p.k) + ' (rădăcina lui ' + T(p.k * p.k) + '), iar ' + T(p.m) + ' rămâne sub radical.'),
        ];
        if (p.k % 2 === 0 && p.k >= 4) { ex.mistakes.push(mk.raw('2\\sqrt{' + (n / 4) + '}', 2 * Math.sqrt(n / 4), 'not-simplified', 'Valoarea e corectă, dar radicalul ' + T('\\sqrt{' + (n / 4) + '}') + ' se mai poate simplifica.', true)); }
        ex.hints = ['Caută un pătrat perfect care îl împarte pe ' + T(n) + ' (4, 9, 16, 25, 36 …).', T('\\sqrt{' + n + '} = \\sqrt{' + p.k * p.k + '\\cdot ' + p.m + '} = \\sqrt{' + p.k * p.k + '}\\cdot\\sqrt{' + p.m + '}') + '.'];
        ex.steps = [T(n + ' = ' + p.k * p.k + ' \\cdot ' + p.m), T('\\sqrt{' + n + '} = \\sqrt{' + p.k * p.k + '}\\cdot\\sqrt{' + p.m + '} = ' + p.k + '\\sqrt{' + p.m + '}')];
      } else {
        ex.text = 'Introdu factorul sub radical: ' + T(p.k + '\\sqrt{' + p.m + '} = \\sqrt{n}') + '. Cât este ' + T('n') + '?';
        ex.answer = { kind: 'int', value: n };
        ex.mistakes = [mk.int(p.k * p.m, 'no-square', 'Ai uitat să ridici ' + T(p.k) + ' la pătrat: ' + T(p.k + ' = \\sqrt{' + p.k + '^2}') + '.'), mk.int(p.k + p.m, 'add', 'Factorul ' + T(p.k) + ' intră sub radical ca ' + T(p.k + '^2') + ' și se **înmulțește** cu ' + T(p.m) + '.'), mk.int(2 * p.k * p.m, 'double', 'Ai dublat în loc să ridici la pătrat.')];
        ex.hints = [T(p.k + ' = \\sqrt{' + p.k + '^2} = \\sqrt{' + p.k * p.k + '}') + '.', 'Apoi înmulțește cele două numere de sub radical.'];
        ex.steps = [T(p.k + '\\sqrt{' + p.m + '} = \\sqrt{' + p.k * p.k + '}\\cdot\\sqrt{' + p.m + '} = \\sqrt{' + p.k * p.k + '\\cdot' + p.m + '} = \\sqrt{' + n + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const n = p.k * p.k * p.m;
      if (p.t === 'simp') { const s = M.simplifyRadical(n); return s.a === p.k && s.b === p.m && Math.abs(ex.answer.value - Math.sqrt(n)) < 1e-9; }
      return ex.answer.value === n && Math.abs(p.k * Math.sqrt(p.m) - Math.sqrt(n)) < 1e-9;
    },
  });

  /* ================= 7–9. Aflarea ipotenuzei ================= */
  const pyBlock = function (s) { const nm = SETS[s]; return { A: nm[0], B: nm[1], C: nm[2], tri: nm.join(''), AB: nm[0] + nm[1], AC: nm[0] + nm[2], BC: nm[1] + nm[2] }; };

  function hypBuild(p, kind) {
    const N = pyBlock(p.s), u = UN[p.u];
    const a = p.a, b = p.b;
    const n = U.sq(a) + U.sq(b);
    const c = Math.sqrt(n);
    const d = (a % 1 || b % 1) ? 1 : 0;
    const ex = {};
    const tail = kind === 'dec' ? ' Rotunjește rezultatul la o zecimală.' : kind === 'rad' ? ' Scrie rezultatul sub formă de radical simplificat (de exemplu ' + T('3\\sqrt{2}') + ').' : '';
    ex.text = 'Triunghiul ' + T(N.tri) + ' este dreptunghic în ' + T(N.A) + ', cu ' + U.len(N.AB, a, u) + ' și ' + U.len(N.AC, b, u) + '. Calculează lungimea ipotenuzei ' + T(N.BC) + '.' + tail;
    const L = {}; L[N.AB] = U.fl(a, u); L[N.AC] = U.fl(b, u); L[N.BC] = '?';
    ex.figure = F.rt(a, b, L, [N.A, N.B, N.C]);
    if (kind === 'int') ex.answer = { kind: 'int', value: c, unit: cm(u) };
    else if (kind === 'dec') ex.answer = { kind: 'dec', dec: 1, value: c, unit: cm(u) };
    else ex.answer = { kind: 'rad', value: c, n: n, unit: cm(u) };
    const sumW = 'Ai **adunat lungimile** catetelor (' + T(U.n(a) + '+' + U.n(b)) + '). Teorema lui Pitagora cere suma **pătratelor**, urmată de rădăcină.';
    const rootW = 'Ai calculat ' + T(N.BC + '^2') + ', dar ai uitat să extragi **rădăcina pătrată** la final.';
    ex.mistakes = [U.mkAny(a + b, 'add-legs', sumW), U.mkAny(n, 'forgot-root', rootW), U.mkAny(Math.sqrt(Math.abs(U.sq(b) - U.sq(a))), 'subtract', 'Ai **scăzut** pătratele. Ipotenuza se află prin **adunarea** pătratelor catetelor.')];
    if (kind === 'rad') { const sr = M.simplifyRadical(n); if (sr.b !== n) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul nu e simplificat complet: scoate factorii pătrați de sub radical.', true)); }
    ex.hints = ['Ipotenuza este latura din fața unghiului drept: aici ' + T(N.BC) + '.', U.H.formula + ' ' + T(N.BC + '^2 = ' + N.AB + '^2 + ' + N.AC + '^2'), 'Calculează ' + T(U.n(a) + '^2 + ' + U.n(b) + '^2') + ', apoi extrage rădăcina pătrată.'];
    const last = kind === 'int' ? N.BC + ' = \\sqrt{' + U.n(n, 4) + '} = ' + U.n(c, 4) : kind === 'dec' ? N.BC + ' = \\sqrt{' + U.n(n, 4) + '} \\approx ' + U.n(c, 1) : N.BC + ' = \\sqrt{' + U.n(n, 4) + '} = ' + M.radTex(n);
    ex.steps = [T(N.BC + '^2 = ' + N.AB + '^2 + ' + N.AC + '^2'), T(N.BC + '^2 = ' + U.n(a) + '^2 + ' + U.n(b) + '^2 = ' + U.n(U.sq(a), 4) + ' + ' + U.n(U.sq(b), 4) + ' = ' + U.n(n, 4)), T(last + '\\,\\text{' + u + '}')];
    return ex;
  }
  const hypVerify = function (p, ex) {
    const n = p.a * p.a + p.b * p.b;
    return Math.abs(ex.answer.value * ex.answer.value - n) < 1e-6;
  };

  D({
    id: 'hyp-int', skill: 'p.hyp.int', levels: [1, 2],
    space: function (level) {
      const out = [];
      U.triples(level === 1 ? 50 : 130, level === 1 ? 0 : 30).forEach(function (t) {
        for (let s = 0; s < SETS.length; s++) for (let u = 0; u < 3; u++) for (let sw = 0; sw < 2; sw++) out.push({ s: s, u: u, a: sw ? t[1] : t[0], b: sw ? t[0] : t[1] });
      });
      return out;
    },
    build: function (p) { return hypBuild(p, 'int'); },
    verify: hypVerify,
  });
  D({
    id: 'hyp-dec', skill: 'p.hyp.dec', levels: [2, 3],
    space: function (level) {
      const out = [];
      const vals = []; if (level === 2) for (let i = 2; i <= 15; i++) vals.push(i); else for (let i = 3; i <= 19; i++) vals.push(i / 2);
      vals.forEach(function (a) { vals.forEach(function (b) {
        const n = U.sq(a) + U.sq(b);
        if (M.isSquare(n) && n % 1 === 0) return;
        if (!U.safeRound(Math.sqrt(n), 1)) return;
        if (Math.abs(Math.sqrt(n) - Math.round(Math.sqrt(n))) < 1e-9) return;
        for (let s = 0; s < SETS.length; s += 2) for (let u = 0; u < 3; u++) out.push({ s: s + Math.round((a + b) * 2) % 2, u: u, a: a, b: b });
      }); });
      return out;
    },
    build: function (p) { return hypBuild(p, 'dec'); },
    verify: hypVerify,
  });
  D({
    id: 'hyp-rad', skill: 'p.hyp.rad', levels: [2, 3],
    space: function (level) {
      const out = [];
      const hi = level === 2 ? 12 : 20;
      for (let a = 1; a <= hi; a++) for (let b = 1; b <= hi; b++) {
        const n = a * a + b * b;
        if (M.isSquare(n)) continue;
        const simpl = M.simplifyRadical(n).b !== n;
        if (level === 3 && !simpl) continue;
        if (level === 2 && simpl && (a + b) % 2) continue;
        for (let s = 0; s < SETS.length; s += 3) for (let u = 0; u < 3; u++) out.push({ s: s + (a % 3), u: u, a: a, b: b });
      }
      return out;
    },
    build: function (p) { return hypBuild(p, 'rad'); },
    verify: hypVerify,
  });

  /* ================= 10–12. Aflarea unei catete ================= */
  function legBuild(p, kind) {
    const N = pyBlock(p.s), u = UN[p.u];
    const c = p.c, a = p.a;                // c = ipotenuza, a = cateta cunoscută
    const n = U.sq(c) - U.sq(a);
    const x = Math.sqrt(n);
    const knownIsAB = p.known === 0;
    const kn = knownIsAB ? N.AB : N.AC, un = knownIsAB ? N.AC : N.AB;
    const d = (a % 1 || c % 1) ? 1 : 0;
    const ex = {};
    const tail = kind === 'dec' ? ' Rotunjește rezultatul la o zecimală.' : kind === 'rad' ? ' Scrie rezultatul sub formă de radical simplificat.' : '';
    ex.text = 'Triunghiul ' + T(N.tri) + ' este dreptunghic în ' + T(N.A) + '. Se știe că ' + U.len(N.BC, c, u) + ' și ' + U.len(kn, a, u) + '. Calculează lungimea catetei ' + T(un) + '.' + tail;
    const leg1 = knownIsAB ? a : x, leg2 = knownIsAB ? x : a;
    const L = {}; L[N.BC] = U.fl(c, u); L[kn] = U.fl(a, u); L[un] = '?';
    ex.figure = F.rt(leg1, leg2, L, [N.A, N.B, N.C]);
    if (kind === 'int') ex.answer = { kind: 'int', value: x, unit: cm(u) };
    else if (kind === 'dec') ex.answer = { kind: 'dec', dec: 1, value: x, unit: cm(u) };
    else ex.answer = { kind: 'rad', value: x, n: n, unit: cm(u) };
    ex.mistakes = [
      U.mkAny(Math.sqrt(U.sq(c) + U.sq(a)), 'add-for-leg', 'Ai **adunat** pătratele. Aici ipotenuza este dată: o catetă se află prin **scădere** — ' + T(un + '^2 = ' + N.BC + '^2 - ' + kn + '^2') + '.'),
      U.mkAny(c - a, 'diff-lengths', 'Ai scăzut **lungimile** (' + T(U.n(c) + '-' + U.n(a)) + '). Se scad **pătratele**, apoi se extrage rădăcina.'),
      U.mkAny(n, 'forgot-root', 'Ai calculat ' + T(un + '^2') + ', dar ai uitat rădăcina pătrată.'),
    ];
    if (kind === 'rad') { const sr = M.simplifyRadical(Math.round(n)); if (sr.b !== Math.round(n)) ex.mistakes.push(mk.rad(Math.round(n), 'not-simplified', 'Valoarea e corectă, dar radicalul nu e simplificat complet.', true)); }
    ex.hints = ['Ipotenuza este ' + T(N.BC) + ' — cea mai lungă latură. Cunoști ipotenuza și o catetă.', 'Din ' + T(N.BC + '^2 = ' + N.AB + '^2 + ' + N.AC + '^2') + ' obții ' + T(un + '^2 = ' + N.BC + '^2 - ' + kn + '^2') + '.', 'Scade pătratele (nu lungimile), apoi extrage rădăcina.'];
    const last = kind === 'int' ? un + ' = \\sqrt{' + U.n(n, 4) + '} = ' + U.n(x, 4) : kind === 'dec' ? un + ' = \\sqrt{' + U.n(n, 4) + '} \\approx ' + U.n(x, 1) : un + ' = \\sqrt{' + U.n(n, 4) + '} = ' + M.radTex(Math.round(n));
    ex.steps = [T(N.BC + '^2 = ' + N.AB + '^2 + ' + N.AC + '^2 \\;\\Rightarrow\\; ' + un + '^2 = ' + N.BC + '^2 - ' + kn + '^2'), T(un + '^2 = ' + U.n(c) + '^2 - ' + U.n(a) + '^2 = ' + U.n(U.sq(c), 4) + ' - ' + U.n(U.sq(a), 4) + ' = ' + U.n(n, 4)), T(last + '\\,\\text{' + u + '}')];
    return ex;
  }
  const legVerify = function (p, ex) {
    const x = ex.answer.value;
    return Math.abs(x * x + p.a * p.a - p.c * p.c) < 1e-6 && p.c > p.a;
  };
  D({
    id: 'leg-int', skill: 'p.leg.int', levels: [1, 2],
    space: function (level) {
      const out = [];
      U.triples(level === 1 ? 50 : 130, level === 1 ? 0 : 30).forEach(function (t) {
        for (let s = 0; s < SETS.length; s++) for (let u = 0; u < 3; u++) for (let kn = 0; kn < 2; kn++) out.push({ s: s, u: u, known: kn, a: kn ? t[1] : t[0], c: t[2] });
      });
      return out;
    },
    build: function (p) { return legBuild(p, 'int'); },
    verify: legVerify,
  });
  D({
    id: 'leg-dec', skill: 'p.leg.dec', levels: [2, 3],
    space: function (level) {
      const out = [];
      const cs = []; if (level === 2) for (let i = 5; i <= 20; i++) cs.push(i); else for (let i = 8; i <= 30; i++) cs.push(i / 2);
      cs.forEach(function (c) { for (let a = (level === 2 ? 2 : 1.5); a < c - 0.9; a += (level === 2 ? 1 : 0.5)) {
        const n = U.sq(c) - U.sq(a);
        if (n <= 0 || M.isSquare(Math.round(n)) && n % 1 === 0) continue;
        if (!U.safeRound(Math.sqrt(n), 1)) continue;
        for (let s = 0; s < SETS.length; s += 2) for (let u = 0; u < 3; u += 1) out.push({ s: s + (Math.round(a * 2)) % 2, u: u, known: Math.round(a * 2 + c * 2) % 2, a: a, c: c });
      } });
      return out;
    },
    build: function (p) { return legBuild(p, 'dec'); },
    verify: legVerify,
  });
  D({
    id: 'leg-rad', skill: 'p.leg.rad', levels: [2, 3],
    space: function (level) {
      const out = [];
      const hi = level === 2 ? 14 : 22;
      for (let c = 3; c <= hi; c++) for (let a = 1; a < c; a++) {
        const n = c * c - a * a;
        if (M.isSquare(n)) continue;
        const simpl = M.simplifyRadical(n).b !== n;
        if (level === 3 && !simpl) continue;
        if (level === 2 && simpl && (a + c) % 2) continue;
        for (let s = 0; s < SETS.length; s += 2) for (let u = 0; u < 3; u++) out.push({ s: s + (a % 2), u: u, known: (a + c) % 2, a: a, c: c });
      }
      return out;
    },
    build: function (p) { return legBuild(p, 'rad'); },
    verify: legVerify,
  });

  /* ================= 13. Unde a greșit? ================= */
  const ERR = {
    'add-legs': { d: 'A **adunat lungimile** catetelor în loc să aplice teorema lui Pitagora (suma **pătratelor**).', conflict: ['sum-square'] },
    'no-root': { d: 'A aflat pătratul ipotenuzei, dar a **uitat să extragă rădăcina pătrată** la final.', conflict: [] },
    'minus-hyp': { d: 'A **scăzut** pătratele catetelor. Ipotenuza se află prin **adunare**; scăderea e pentru a afla o catetă.', conflict: [] },
    'hyp-as-leg': { d: 'A **adunat** pătratele, deși ipotenuza era dată. O catetă se află prin **scădere**: ' + T('AC^2 = BC^2 - AB^2') + '.', conflict: [] },
    'sum-square': { d: 'A ridicat la pătrat **suma** ' + T('(AB + AC)^2') + ', dar teorema cere suma pătratelor ' + T('AB^2 + AC^2') + '.', conflict: ['add-legs'] },
    'sq-double': { d: 'A calculat „pătratul” unui număr ca **dublul** lui (' + T('5^2 \\ne 2\\cdot 5') + ').', conflict: [] },
  };
  D({
    id: 'err-spot', skill: 'p.err.spot', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const types = level === 1 ? ['add-legs', 'no-root'] : level === 2 ? ['minus-hyp', 'hyp-as-leg', 'sum-square', 'no-root'] : ['sq-double', 'sum-square', 'hyp-as-leg', 'minus-hyp'];
      U.triples(level === 1 ? 30 : 50, 5).forEach(function (t, i) {
        types.forEach(function (ty, j) { out.push({ ty: ty, a: t[0], b: t[1], c: t[2], who: (i + j) % U.PEOPLE.length }); });
      });
      return out;
    },
    build: function (p, level, r) {
      const a = p.a, b = p.b, c = p.c, who = U.PEOPLE[p.who];
      const hypProb = 'Triunghiul ' + T('ABC') + ' este dreptunghic în ' + T('A') + ', cu ' + T('AB = ' + a + '\\,\\text{cm}') + ' și ' + T('AC = ' + b + '\\,\\text{cm}') + '. Calculează ' + T('BC') + '.';
      const legProb = 'Triunghiul ' + T('ABC') + ' este dreptunghic în ' + T('A') + ', cu ' + T('BC = ' + c + '\\,\\text{cm}') + ' și ' + T('AB = ' + a + '\\,\\text{cm}') + '. Calculează ' + T('AC') + '.';
      let prob = hypProb, lines;
      switch (p.ty) {
        case 'add-legs': lines = ['BC = AB + AC', 'BC = ' + a + ' + ' + b + ' = ' + (a + b) + '\\,\\text{cm}']; break;
        case 'no-root': lines = ['BC^2 = AB^2 + AC^2', 'BC^2 = ' + a + '^2 + ' + b + '^2 = ' + a * a + ' + ' + b * b + ' = ' + c * c, 'BC = ' + c * c + '\\,\\text{cm}']; break;
        case 'minus-hyp': lines = ['BC^2 = AC^2 - AB^2', 'BC^2 = ' + b + '^2 - ' + a + '^2 = ' + b * b + ' - ' + a * a + ' = ' + (b * b - a * a), 'BC = \\sqrt{' + (b * b - a * a) + '}\\,\\text{cm}']; break;
        case 'hyp-as-leg': prob = legProb; lines = ['AC^2 = BC^2 + AB^2', 'AC^2 = ' + c + '^2 + ' + a + '^2 = ' + c * c + ' + ' + a * a + ' = ' + (c * c + a * a), 'AC = \\sqrt{' + (c * c + a * a) + '}\\,\\text{cm}']; break;
        case 'sum-square': lines = ['BC^2 = (AB + AC)^2', 'BC^2 = (' + a + ' + ' + b + ')^2 = ' + (a + b) + '^2 = ' + (a + b) * (a + b), 'BC = ' + (a + b) + '\\,\\text{cm}']; break;
        default: lines = ['BC^2 = AB^2 + AC^2', 'BC^2 = ' + a + '^2 + ' + b + '^2 = ' + 2 * a + ' + ' + 2 * b + ' = ' + (2 * a + 2 * b), 'BC = \\sqrt{' + (2 * a + 2 * b) + '}\\,\\text{cm}'];
      }
      const right = p.ty;
      const pool = Object.keys(ERR).filter(function (k) { return k !== right && ERR[right].conflict.indexOf(k) < 0 && !(right !== 'hyp-as-leg' && k === 'hyp-as-leg' && prob === hypProb && false); });
      const others = r.shuffle(pool).slice(0, 3);
      const ex = {};
      ex.text = who + ' a rezolvat problema de mai jos. **Unde a greșit?**\n\n' + prob + '\n\n' + lines.map(function (l) { return T(l); }).join('\n');
      ex.choices = [{ label: ERR[right].d, ok: true }].concat(others.map(function (k) {
        return { label: ERR[k].d, ok: false, tag: 'misdiagnosed', why: 'Nu aceasta e greșeala din rezolvarea de mai sus. Citește fiecare linie și compară cu teorema lui Pitagora.' };
      }));
      ex.hints = ['Verifică ce relație a folosit pe prima linie: se potrivește cu teorema lui Pitagora?', 'Dacă relația e bună, verifică fiecare calcul și ultimul pas (rădăcina).'];
      const sol = { 'add-legs': [T('BC^2 = AB^2 + AC^2 = ' + a + '^2 + ' + b + '^2 = ' + c * c), T('BC = \\sqrt{' + c * c + '} = ' + c + '\\,\\text{cm}')], 'no-root': [T('BC = \\sqrt{' + c * c + '} = ' + c + '\\,\\text{cm}')], 'minus-hyp': [T('BC^2 = AB^2 + AC^2 = ' + (a * a + b * b)), T('BC = ' + c + '\\,\\text{cm}')], 'hyp-as-leg': [T('AC^2 = BC^2 - AB^2 = ' + c * c + ' - ' + a * a + ' = ' + b * b), T('AC = ' + b + '\\,\\text{cm}')], 'sum-square': [T('BC^2 = AB^2 + AC^2 = ' + a * a + ' + ' + b * b + ' = ' + c * c), T('BC = ' + c + '\\,\\text{cm}')], 'sq-double': [T(a + '^2 = ' + a * a + ',\\; ' + b + '^2 = ' + b * b + ' \\Rightarrow BC^2 = ' + c * c), T('BC = ' + c + '\\,\\text{cm}')] };
      ex.steps = [ERR[right].d].concat(sol[right]);
      return ex;
    },
    verify: function (p, ex) { const ok = ex.options.filter(function (o) { return o.ok; })[0]; return ok.label === ERR[p.ty].d && U.isRight(p.a, p.b, p.c); },
  });
})(window.M);
