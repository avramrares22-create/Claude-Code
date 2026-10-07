/* Unitatea 1 — familii de exerciții, partea B: reciproca, figuri geometrice, aplicații, relații metrice. */
(function (M) {
  'use strict';
  const U = M.u1, D = M.defineTemplate, mk = M.mk, F = M.fig;
  const UN = U.UNITS;
  const T = function (s) { return '$' + s + '$'; };
  const cm = function (u) { return M.unit(u); };
  const cm2 = function (u) { return M.unit(u, 2); };
  const tail = function (k) { return k === 'dec' ? ' Rotunjește rezultatul la o zecimală.' : k === 'rad' ? ' Scrie rezultatul sub formă de radical simplificat.' : ''; };

  /* Rezultat din n de sub radical: răspuns + scrierea finală */
  function root(kind, n) {
    const v = Math.sqrt(n);
    if (kind === 'int') return { a: { kind: 'int', value: Math.round(v) }, tex: '\\sqrt{' + U.n(n, 4) + '} = ' + Math.round(v) };
    if (kind === 'dec') return { a: { kind: 'dec', dec: 1, value: v }, tex: '\\sqrt{' + U.n(n, 4) + '} \\approx ' + U.n(v, 1) };
    const rt = M.radTex(Math.round(n));
    return { a: { kind: 'rad', value: v, n: Math.round(n) }, tex: '\\sqrt{' + Math.round(n) + '}' + (rt === '\\sqrt{' + Math.round(n) + '}' ? '' : ' = ' + rt) };
  }
  const withUnit = function (a, u, sq) { a.unit = sq ? cm2(u) : cm(u); return a; };
  const radNotSimple = function (n) { return M.simplifyRadical(Math.round(n)).b !== Math.round(n); };

  /* ================= Reciproca: este triunghiul dreptunghic? ================= */
  const PM = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  D({
    id: 'conv-check', skill: 'p.conv.check', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const sc = level === 3 ? [[2, 1], [10, 1]] : [[1, 1]];
      U.triples(level === 1 ? 30 : 45, 5).forEach(function (t, i) {
        sc.forEach(function (s) {
          if (level === 3 && s[0] === 2 && t[2] % 2 === 1) { /* 3,4,5 → 1,5; 2; 2,5 : acceptăm doar cu zecimale simple */ }
          const base = [[t[0], t[1], t[2]], [t[0], t[1], t[2] + 1], [t[0], t[1] + 1, t[2]]];
          base.forEach(function (b, bi) {
            const sides = b.map(function (x) { return x * 10 / s[0]; }).map(function (x) { return M.round(x / 10, 2); });
            const srt = b.slice().sort(function (x, y) { return x - y; });
            if (srt[0] + srt[1] <= srt[2]) return;
            const pmIdx = (i + bi) % 6;
            out.push({ sides: PM[pmIdx].map(function (k) { return sides[k]; }), u: (i + bi) % 3, sc: s[0] });
          });
        });
      });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const sd = p.sides.slice().sort(function (x, y) { return x - y; });
      const x = sd[0], y = sd[1], z = sd[2];
      const sx = U.sq(x), sy = U.sq(y), sz = U.sq(z);
      const right = Math.abs(sx + sy - sz) < 1e-6;
      const n = U.n;
      const lst = p.sides.map(function (v) { return U.val(v, u); });
      const ex = {};
      ex.text = 'Un triunghi are laturile de ' + lst[0] + ', ' + lst[1] + ' și ' + lst[2] + '. Este triunghiul **dreptunghic**?';
      const sums = T(n(x) + '^2 + ' + n(y) + '^2 = ' + n(sx, 4) + ' + ' + n(sy, 4) + ' = ' + n(sx + sy, 4));
      const zz = T(n(z) + '^2 = ' + n(sz, 4));
      if (right) {
        ex.choices = [
          { label: 'Da: ' + T(n(x) + '^2 + ' + n(y) + '^2 = ' + n(sx + sy, 4) + ' = ' + n(z) + '^2') + '.', ok: true },
          { label: 'Nu, deoarece ' + T(n(x) + ' + ' + n(y) + ' \\ne ' + n(z)) + '.', ok: false, tag: 'sum-lengths', why: 'Pentru reciproca lui Pitagora nu se adună **lungimile**, ci se compară **pătratele**: ' + sums + ' este egal cu ' + zz + ', deci triunghiul este dreptunghic.' },
          { label: 'Da, deoarece ' + T(n(x) + ' + ' + n(y) + ' > ' + n(z)) + '.', ok: false, tag: 'triangle-ineq', why: 'Inegalitatea ' + T(n(x) + '+' + n(y) + '>' + n(z)) + ' arată doar că triunghiul **există**. Dreptunghic înseamnă ' + T('a^2 + b^2 = c^2') + '.' },
          { label: 'Nu, deoarece ' + T(n(x) + '^2 + ' + n(z) + '^2 \\ne ' + n(y) + '^2') + '.', ok: false, tag: 'wrong-hyp', why: 'Ai tratat latura ' + T(n(z)) + ' ca pe o catetă. Ipotenuza e cea mai lungă latură (' + T(n(z)) + '): se verifică ' + T(n(x) + '^2 + ' + n(y) + '^2') + ' cu ' + T(n(z) + '^2') + '.' },
        ];
        ex.steps = ['Cea mai lungă latură este ' + T(n(z)) + ' (candidata la ipotenuză).', sums, zz + ' — egal, deci (reciproca teoremei lui Pitagora) triunghiul este **dreptunghic**.'];
      } else {
        const rel = sx + sy > sz ? '>' : '<';
        ex.choices = [
          { label: 'Nu: ' + T(n(x) + '^2 + ' + n(y) + '^2 = ' + n(sx + sy, 4) + ' \\ne ' + n(sz, 4) + ' = ' + n(z) + '^2') + '.', ok: true },
          { label: 'Da, deoarece ' + T(n(x) + ' + ' + n(y) + ' > ' + n(z)) + '.', ok: false, tag: 'triangle-ineq', why: 'Inegalitatea ' + T(n(x) + '+' + n(y) + '>' + n(z)) + ' arată doar că triunghiul există. Dreptunghic înseamnă ' + T('a^2 + b^2 = c^2') + ': ' + sums + ', dar ' + zz + '.' },
          { label: 'Nu, deoarece ' + T(n(x) + ' + ' + n(y) + ' \\ne ' + n(z)) + '.', ok: false, tag: 'wrong-reason', why: 'Concluzia „nu” este corectă, dar justificarea nu: lungimile nu se adună. Se compară pătratele: ' + sums + ' și ' + zz + '.' },
          { label: 'Da, deoarece laturile sunt numere „frumoase”.', ok: false, tag: 'nice-numbers', why: 'Numerele „frumoase” nu garantează unghiul drept. Se verifică relația lui Pitagora: ' + sums + ' față de ' + zz + '.' },
        ];
        ex.steps = ['Cea mai lungă latură este ' + T(n(z)) + '.', sums + ', iar ' + zz + '.', 'Cum ' + T(n(sx + sy, 4) + (rel === '>' ? ' > ' : ' < ') + n(sz, 4)) + ', egalitatea nu are loc: triunghiul **nu** este dreptunghic.'];
      }
      ex.hints = ['Cea mai lungă latură este singura care poate fi ipotenuză.', 'Compară suma pătratelor celor două laturi mai scurte cu pătratul laturii celei mai lungi.'];
      return ex;
    },
    verify: function (p, ex) {
      const sd = p.sides.map(function (v) { return Math.round(v * 100); }).sort(function (a, b) { return a - b; });
      const right = sd[0] * sd[0] + sd[1] * sd[1] === sd[2] * sd[2];
      const ok = ex.options.filter(function (o) { return o.ok; })[0];
      return right === /^Da:/.test(ok.label) && sd[0] + sd[1] > sd[2];
    },
  });

  /* ================= Triplete pitagoreice ================= */
  D({
    id: 'conv-triple', skill: 'p.conv.triple', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) {
        U.triples(50).forEach(function (t, i) { for (let pos = 0; pos < 3; pos++) out.push({ t: 'complete', a: t[0], b: t[1], c: t[2], pos: pos, u: i % 3 }); });
        U.triples(40, 5).forEach(function (t, i) { for (let j = 0; j < 4; j++) out.push({ t: 'which', a: t[0], b: t[1], c: t[2], v: j, u: i % 3 }); });
      } else if (level === 2) {
        [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]].forEach(function (b) { for (let k = 2; k <= 12; k++) if (b[2] * k <= 130) for (let w = 0; w < 3; w++) out.push({ t: 'scale', a0: b[0], b0: b[1], c0: b[2], k: k, w: w }); });
        U.triples(60, 10).forEach(function (t, i) { out.push({ t: 'which', a: t[0], b: t[1], c: t[2], v: i % 4, u: i % 3 }); });
      } else {
        for (let m = 2; m <= 9; m++) for (let n = 1; n < m; n++) for (let ask = 0; ask < 3; ask++) out.push({ t: 'euclid', m: m, n: n, ask: ask });
      }
      return out;
    },
    build: function (p) {
      const ex = {};
      const u = UN[p.u || 0];
      if (p.t === 'complete') {
        const nums = [p.a, p.b, p.c];
        const shown = nums.map(function (v, i) { return i === p.pos ? '?' : String(v); });
        const val = nums[p.pos];
        ex.text = 'Completează tripletul pitagoreic ' + T('(' + shown.join(',\\; ') + ')') + ', cu numerele în ordine crescătoare.';
        ex.answer = { kind: 'int', value: val };
        const known = nums.filter(function (v, i) { return i !== p.pos; });
        ex.mistakes = [U.mkAny(known[0] + known[1], 'sum', 'Ai adunat numerele date. Într-un triplet pitagoreic ' + T('a^2 + b^2 = c^2') + '.'), U.mkAny(Math.abs(known[1] - known[0]), 'diff', 'Ai scăzut numerele, dar trebuie să scazi/aduni **pătratele** și să extragi rădăcina.'), U.mkAny(val + 1, 'near', null)];
        const eq = p.pos === 2 ? T('c^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + (p.a * p.a + p.b * p.b)) : p.pos === 1 ? T('b^2 = ' + p.c + '^2 - ' + p.a + '^2 = ' + (p.c * p.c - p.a * p.a)) : T('a^2 = ' + p.c + '^2 - ' + p.b + '^2 = ' + (p.c * p.c - p.b * p.b));
        ex.steps = [eq, T((p.pos === 2 ? 'c' : p.pos === 1 ? 'b' : 'a') + ' = ' + val)];
        ex.hints = ['Cel mai mare număr din triplet este ipotenuza: ' + T('a^2 + b^2 = c^2') + '.', p.pos === 2 ? 'Adună pătratele numerelor mici și extrage rădăcina.' : 'Scade din pătratul ipotenuzei pătratul celuilalt număr, apoi extrage rădăcina.'];
      } else if (p.t === 'which') {
        const mk3 = function (x, y, z) { return [x, y, z]; };
        const cands = [
          { s: mk3(p.a, p.b, p.c), ok: true },
          { s: mk3(p.a, p.b, p.c + 1), ok: false },
          { s: mk3(p.a, p.b + 1, p.c), ok: false },
          { s: mk3(p.a + 1, p.b, p.c + (p.v % 2 ? 1 : 2)), ok: false },
        ];
        ex.text = 'Care dintre tripletele următoare este **pitagoreic**? (numerele sunt lungimi în ' + T('\\text{' + u + '}') + ')';
        ex.choices = cands.map(function (c) {
          const x = c.s[0], y = c.s[1], z = c.s[2];
          return { label: T('(' + x + ',\\; ' + y + ',\\; ' + z + ')'), ok: c.ok, tag: c.ok ? null : 'not-triple', why: c.ok ? null : 'Nu: ' + T(x + '^2 + ' + y + '^2 = ' + (x * x + y * y)) + ', dar ' + T(z + '^2 = ' + z * z) + '. Un triplet pitagoreic are ' + T('a^2 + b^2 = c^2') + '.' };
        });
        ex.hints = ['Pentru fiecare triplet calculează ' + T('a^2 + b^2') + ' și compară cu ' + T('c^2') + '.', 'Doar unul dintre ele are egalitate exactă.'];
        ex.steps = [T(p.a + '^2 + ' + p.b + '^2 = ' + p.a * p.a + ' + ' + p.b * p.b + ' = ' + p.c * p.c + ' = ' + p.c + '^2'), 'Deci ' + T('(' + p.a + ',\\; ' + p.b + ',\\; ' + p.c + ')') + ' este tripletul pitagoreic.'];
      } else if (p.t === 'scale') {
        const k = p.k, a = p.a0 * k, b = p.b0 * k, c = p.c0 * k;
        const ask = p.w;                       // 0 = ipotenuza, 1 = cateta mică, 2 = cateta mare
        const given = ask === 0 ? [a, b] : ask === 1 ? [b, c] : [a, c];
        const val = ask === 0 ? c : ask === 1 ? a : b;
        ex.text = 'Se știe că ' + T('(' + p.a0 + ',\\; ' + p.b0 + ',\\; ' + p.c0 + ')') + ' este triplet pitagoreic. Un triunghi dreptunghic are ' + (ask === 0 ? 'catetele ' + T(a) + ' și ' + T(b) : ask === 1 ? 'cateta ' + T(b) + ' și ipotenuza ' + T(c) : 'cateta ' + T(a) + ' și ipotenuza ' + T(c)) + '. Calculează lungimea laturii rămase, **fără să folosești rădăcini** (gândește-te la scalare).';
        ex.answer = { kind: 'int', value: val };
        const base0 = ask === 0 ? p.c0 : ask === 1 ? p.a0 : p.b0;
        ex.mistakes = [mk.int(base0, 'unscaled', 'Ai dat latura din tripletul inițial. Laturile sunt înmulțite cu ' + T(k) + ': ' + T(base0 + '\\cdot ' + k) + '.'), U.mkAny(given[0] + given[1], 'sum', 'Ai adunat lungimile date. Folosește scalarea sau teorema lui Pitagora.'), mk.int(val + k, 'add-k', 'Nu se adaugă ' + T(k) + ', se **înmulțește** tripletul cu ' + T(k) + '.')];
        ex.hints = ['Raportul dintre latura dată și latura corespunzătoare din ' + T('(' + p.a0 + ',\\; ' + p.b0 + ',\\; ' + p.c0 + ')') + ' este ' + T(k) + '.', 'Înmulțește și latura căutată din tripletul inițial cu ' + T(k) + '.'];
        ex.steps = [T(a + ' = ' + p.a0 + '\\cdot ' + k + ',\\; ' + b + ' = ' + p.b0 + '\\cdot ' + k + ',\\; ' + c + ' = ' + p.c0 + '\\cdot ' + k), 'Triunghiul este asemenea cu cel din triplet, cu raport ' + T(k) + ': latura căutată este ' + T(base0 + '\\cdot ' + k + ' = ' + val) + '.'];
      } else {
        const m = p.m, n = p.n;
        const A = m * m - n * n, B = 2 * m * n, C = m * m + n * n;
        const val = p.ask === 0 ? C : p.ask === 1 ? A : B;
        const nm = p.ask === 0 ? 'ipotenuza' : p.ask === 1 ? 'prima catetă ' + T('m^2 - n^2') : 'a doua catetă ' + T('2mn');
        ex.text = 'Orice numere ' + T('m > n') + ' dau un triplet pitagoreic ' + T('(m^2 - n^2,\\; 2mn,\\; m^2 + n^2)') + '. Pentru ' + T('m = ' + m) + ' și ' + T('n = ' + n) + ', care este ' + nm + '?';
        ex.answer = { kind: 'int', value: val };
        ex.mistakes = [mk.int((m + n) * (m + n), 'sum-square', 'Ai calculat ' + T('(m+n)^2') + '. Formulele sunt ' + T('m^2 - n^2') + ', ' + T('2mn') + ' și ' + T('m^2 + n^2') + '.'), mk.int(m * m + n, 'half-square', 'Ai ridicat la pătrat doar ' + T('m') + '. Ambele numere se ridică la pătrat.'), mk.int(m * n, 'forgot-2', 'Lipsește factorul ' + T('2') + ' din ' + T('2mn') + '.'), mk.int(m * m - n, 'mix', 'Ai ridicat la pătrat doar ' + T('m') + '.')];
        ex.hints = ['Înlocuiește ' + T('m = ' + m) + ' și ' + T('n = ' + n) + ' în formula cerută.', 'Atenție: ' + T('m^2') + ' înseamnă ' + T('m \\cdot m') + '.'];
        ex.steps = [T('m^2 = ' + m * m + ',\\; n^2 = ' + n * n + ',\\; 2mn = ' + B), T('(' + A + ',\\; ' + B + ',\\; ' + C + ')'), 'Verificare: ' + T(A + '^2 + ' + B + '^2 = ' + (A * A + B * B) + ' = ' + C + '^2') + '.'];
      }
      return ex;
    },
    verify: function (p, ex) {
      if (p.t === 'which') { const ok = ex.options.filter(function (o) { return o.ok; })[0]; const bad = ex.options.filter(function (o) { return !o.ok; }); return ok.label === T('(' + p.a + ',\\; ' + p.b + ',\\; ' + p.c + ')') && U.isRight(p.a, p.b, p.c) && bad.length === 3; }
      if (p.t === 'complete') return U.isRight(p.a, p.b, p.c) && [p.a, p.b, p.c][p.pos] === ex.answer.value;
      if (p.t === 'scale') { const k = p.k; return U.isRight(p.a0 * k, p.b0 * k, p.c0 * k); }
      const m = p.m, n = p.n; return U.isRight(m * m - n * n, 2 * m * n, m * m + n * n);
    },
  });

  /* ================= Natura triunghiului: ascuțitunghic / dreptunghic / obtuzunghic ================= */
  D({
    id: 'conv-nature', skill: 'p.conv.nature', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) {
        U.triples(30, 5).forEach(function (t, i) {
          [[t[0], t[1], t[2]], [t[0], t[1], t[2] + 1], [t[0], t[1], t[2] - 1]].forEach(function (s, j) { out.push({ s: PM[(i + j) % 6].map(function (k) { return s[k]; }), u: (i + j) % 3, r: false }); });
        });
      } else if (level === 2) {
        for (let a = 3; a <= 20; a++) for (let b = a; b <= 22; b++) for (let c = b; c <= 24; c++) { if (a + b <= c) continue; if ((a * 7 + b * 5 + c * 3) % 5) continue; out.push({ s: PM[(a + b + c) % 6].map(function (k) { return [a, b, c][k]; }), u: (a + c) % 3, r: false }); }
      } else {
        const sqs = [];
        for (let p2 = 2; p2 <= 30; p2++) for (let q = p2; q <= 30; q++) for (let r2 = q; r2 <= 45; r2++) {
          if (Math.sqrt(p2) + Math.sqrt(q) <= Math.sqrt(r2) + 1e-9) continue;
          const right = p2 + q === r2;
          if (right || (p2 * 3 + q * 5 + r2 * 7) % 23 === 0) sqs.push([p2, q, r2]);
        }
        sqs.forEach(function (t, i) { out.push({ s: PM[i % 6].map(function (k) { return t[k]; }), u: 0, r: true }); });
      }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const sd = p.s.slice().sort(function (x, y) { return x - y; });
      const sqv = p.r ? sd : sd.map(function (x) { return x * x; });
      const S = sqv[0] + sqv[1], C = sqv[2];
      const kind = S === C ? 'dreptunghic' : S > C ? 'ascuțitunghic' : 'obtuzunghic';
      const show = function (v) { return p.r ? (M.isSquare(v) ? String(Math.round(Math.sqrt(v))) : '\\sqrt{' + v + '}') : String(v); };
      const lst = p.s.map(function (v) { return p.r ? T(show(v) + '\\,\\text{' + u + '}') : U.val(v, u); });
      ex.text = 'Un triunghi are laturile ' + lst[0] + ', ' + lst[1] + ' și ' + lst[2] + '. Triunghiul este ascuțitunghic, dreptunghic sau obtuzunghic?';
      const x = show(sd[0]), y = show(sd[1]), z = show(sd[2]);
      const rel = S === C ? '=' : S > C ? '>' : '<';
      const cmp = T(x + '^2 + ' + y + '^2 = ' + S + ',\\; ' + z + '^2 = ' + C + ' \\Rightarrow ' + S + (rel === '=' ? ' = ' : rel === '>' ? ' > ' : ' < ') + C);
      const why = {
        'dreptunghic': 'Se compară ' + T('a^2 + b^2') + ' cu ' + T('c^2') + ': ' + cmp + '. Unghiul drept apare doar la egalitate.',
        'ascuțitunghic': 'Se compară ' + T('a^2 + b^2') + ' cu ' + T('c^2') + ': ' + cmp + '. Dacă suma pătratelor este **mai mare**, triunghiul este ascuțitunghic.',
        'obtuzunghic': 'Se compară ' + T('a^2 + b^2') + ' cu ' + T('c^2') + ': ' + cmp + '. Dacă suma pătratelor este **mai mică**, triunghiul este obtuzunghic.',
      };
      ex.choices = ['ascuțitunghic', 'dreptunghic', 'obtuzunghic'].map(function (k) {
        return { label: k[0].toUpperCase() + k.slice(1), ok: k === kind, tag: k === kind ? null : 'wrong-nature-' + kind, why: k === kind ? null : why[kind] };
      });
      ex.keepOrder = true;
      ex.hints = ['Alege cea mai lungă latură, ' + T('c') + '. Compară ' + T('a^2 + b^2') + ' cu ' + T('c^2') + '.', 'Egal ⇒ dreptunghic; mai mare ⇒ ascuțitunghic; mai mic ⇒ obtuzunghic.'];
      ex.steps = [cmp, 'Triunghiul este **' + kind + '**.'];
      ex.kindTruth = kind;
      return ex;
    },
    verify: function (p, ex) {
      const sd = p.s.slice().sort(function (x, y) { return x - y; });
      const q = p.r ? sd : sd.map(function (x) { return x * x; });
      const truth = q[0] + q[1] === q[2] ? 'Dreptunghic' : q[0] + q[1] > q[2] ? 'Ascuțitunghic' : 'Obtuzunghic';
      const ok = ex.options.filter(function (o) { return o.ok; })[0];
      return ok.label === truth;
    },
  });

  /* ================= Dreptunghi ================= */
  D({
    id: 'fig-rect', skill: 'p.fig.rect', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(50).forEach(function (t) { for (let u = 0; u < 3; u++) { out.push({ t: 'diag', a: t[0], b: t[1], u: u }); out.push({ t: 'diag', a: t[1], b: t[0], u: u }); out.push({ t: 'side', a: t[0], d: t[2], u: u }); out.push({ t: 'side', a: t[1], d: t[2], u: u }); } });
      else if (level === 2) { for (let a = 2; a <= 14; a++) for (let b = 2; b <= 14; b++) { const n = a * a + b * b; if (M.isSquare(n)) continue; out.push({ t: 'diagrad', a: a, b: b, u: (a + b) % 3 }); if (U.safeRound(Math.sqrt(n), 1)) out.push({ t: 'diagdec', a: a, b: b, u: (a * b) % 3 }); } }
      else {
        U.triples(100, 25).forEach(function (t) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, i) { out.push({ t: 'area', a: s[0], b: s[1], d: t[2], u: (t[2] + i) % 3 }); out.push({ t: 'perim', a: s[0], b: s[1], d: t[2], u: (t[2] + i + 1) % 3 }); }); });
        for (let d = 8; d <= 30; d++) for (let a = 3; a < d - 1; a++) { const n = d * d - a * a; if (M.isSquare(n) || !U.safeRound(Math.sqrt(n), 1)) continue; if ((a + d) % 3) continue; out.push({ t: 'sidedec', a: a, d: d, u: (a + d) % 3 }); }
      }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const tx = 'Dreptunghiul ' + T('ABCD') + ' ';
      if (p.t === 'diag' || p.t === 'diagrad' || p.t === 'diagdec') {
        const kind = p.t === 'diag' ? 'int' : p.t === 'diagrad' ? 'rad' : 'dec';
        const n = p.a * p.a + p.b * p.b;
        const R = root(kind, n);
        ex.text = tx + 'are ' + U.len('AB', p.a, u) + ' și ' + U.len('BC', p.b, u) + '. Calculează lungimea diagonalei ' + T('AC') + '.' + tail(kind);
        ex.figure = F.rect(p.a, p.b, { AB: U.fl(p.a, u), BC: U.fl(p.b, u), AC: '?' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(p.a + p.b, 'add-legs', 'Ai adunat laturile. Diagonala este ipotenuza triunghiului dreptunghic ' + T('ABC') + ': ' + T('AC^2 = AB^2 + BC^2') + '.'), U.mkAny(n, 'forgot-root', 'Ai calculat ' + T('AC^2') + ' și ai uitat rădăcina pătrată.'), U.mkAny(p.a * p.b, 'product', 'Ai înmulțit laturile (asta ar fi aria). Diagonala se află cu Pitagora.')];
        if (kind === 'rad' && radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
        ex.hints = ['Diagonala ' + T('AC') + ' este ipotenuza triunghiului dreptunghic ' + T('ABC') + ' (unghiul drept e în ' + T('B') + ').', 'Aplică Pitagora: ' + T('AC^2 = AB^2 + BC^2') + '.'];
        ex.steps = [T('AC^2 = AB^2 + BC^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + p.a * p.a + ' + ' + p.b * p.b + ' = ' + n), T('AC = ' + R.tex + '\\,\\text{' + u + '}')];
      } else if (p.t === 'side' || p.t === 'sidedec') {
        const kind = p.t === 'side' ? 'int' : 'dec';
        const n = p.d * p.d - p.a * p.a;
        const R = root(kind, n);
        ex.text = tx + 'are diagonala ' + U.len('AC', p.d, u) + ' și latura ' + U.len('AB', p.a, u) + '. Calculează lungimea laturii ' + T('BC') + '.' + tail(kind);
        ex.figure = F.rect(p.a, Math.sqrt(n), { AB: U.fl(p.a, u), BC: '?', AC: U.fl(p.d, u) });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(p.d - p.a, 'diff-lengths', 'Ai scăzut lungimile. Se scad **pătratele**: ' + T('BC^2 = AC^2 - AB^2') + '.'), U.mkAny(Math.sqrt(p.d * p.d + p.a * p.a), 'add-for-leg', 'Aici diagonala (ipotenuza) este dată: latura se află prin **scădere**, nu prin adunare.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        ex.hints = ['Diagonala ' + T('AC') + ' este ipotenuza triunghiului ' + T('ABC') + '; ' + T('AB') + ' și ' + T('BC') + ' sunt catetele.', T('BC^2 = AC^2 - AB^2') + ', apoi rădăcina pătrată.'];
        ex.steps = [T('BC^2 = AC^2 - AB^2 = ' + p.d + '^2 - ' + p.a + '^2 = ' + p.d * p.d + ' - ' + p.a * p.a + ' = ' + n), T('BC = ' + R.tex + '\\,\\text{' + u + '}')];
      } else if (p.t === 'area') {
        const A = p.a * p.b;
        ex.text = tx + 'are diagonala ' + U.len('AC', p.d, u) + ' și latura ' + U.len('AB', p.a, u) + '. Calculează **aria** dreptunghiului.';
        ex.figure = F.rect(p.a, p.b, { AB: U.fl(p.a, u), BC: '?', AC: U.fl(p.d, u) });
        ex.answer = { kind: 'int', value: A, unit: cm2(u) };
        ex.mistakes = [mk.int(p.a * p.d, 'wrong-side', 'Ai înmulțit latura cu diagonala. Aria este ' + T('AB \\cdot BC') + ' și mai întâi trebuie aflată ' + T('BC') + '.'), mk.int(p.d * p.d - p.a * p.a, 'forgot-root', 'Ai găsit ' + T('BC^2') + ' și te-ai oprit: ' + T('BC') + ' se obține cu rădăcina, apoi se înmulțește cu ' + T('AB') + '.'), mk.int(A / 2, 'half', 'Aria dreptunghiului nu se împarte la 2 (asta e la triunghi).')];
        ex.hints = ['Află mai întâi cealaltă latură, ' + T('BC') + ', cu Pitagora în triunghiul ' + T('ABC') + '.', 'Apoi ' + T('A = AB \\cdot BC') + '.'];
        ex.steps = [T('BC^2 = ' + p.d + '^2 - ' + p.a + '^2 = ' + p.b * p.b), T('BC = ' + p.b + '\\,\\text{' + u + '}'), T('A = AB \\cdot BC = ' + p.a + ' \\cdot ' + p.b + ' = ' + A + '\\,\\text{' + u + '}^{2}')];
      } else {
        const P = 2 * (p.a + p.b);
        ex.text = tx + 'are diagonala ' + U.len('AC', p.d, u) + ' și latura ' + U.len('AB', p.a, u) + '. Calculează **perimetrul** dreptunghiului.';
        ex.figure = F.rect(p.a, p.b, { AB: U.fl(p.a, u), BC: '?', AC: U.fl(p.d, u) });
        ex.answer = { kind: 'int', value: P, unit: cm(u) };
        ex.mistakes = [mk.int(p.a + p.b, 'half-perimeter', 'Ai calculat semiperimetrul. Perimetrul este ' + T('2(AB + BC)') + '.'), mk.int(2 * (p.a + p.d), 'diag-as-side', 'Diagonala nu este latură a dreptunghiului. Află ' + T('BC') + ' cu Pitagora.'), mk.int(p.a * p.b, 'area', 'Ai calculat aria. Perimetrul este suma tuturor laturilor.')];
        ex.hints = ['Perimetrul are nevoie de ambele laturi. Află ' + T('BC') + ' din triunghiul dreptunghic ' + T('ABC') + '.', T('P = 2(AB + BC)') + '.'];
        ex.steps = [T('BC^2 = ' + p.d + '^2 - ' + p.a + '^2 = ' + p.b * p.b + ' \\Rightarrow BC = ' + p.b), T('P = 2 \\cdot (' + p.a + ' + ' + p.b + ') = ' + P + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'diag' || p.t === 'diagrad' || p.t === 'diagdec') return Math.abs(v * v - (p.a * p.a + p.b * p.b)) < 1e-6;
      if (p.t === 'side' || p.t === 'sidedec') return Math.abs(v * v + p.a * p.a - p.d * p.d) < 1e-6;
      if (p.t === 'area') return Math.abs(v - p.a * Math.sqrt(p.d * p.d - p.a * p.a)) < 1e-6;
      return Math.abs(v - 2 * (p.a + Math.sqrt(p.d * p.d - p.a * p.a))) < 1e-6;
    },
  });

  /* ================= Pătrat ================= */
  D({
    id: 'fig-square', skill: 'p.fig.square', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) { for (let l = 1; l <= 12; l++) for (let u = 0; u < 3; u++) out.push({ t: 'diag', l: l, u: u }); for (let k = 1; k <= 10; k++) for (let u = 0; u < 3; u++) out.push({ t: 'side', k: k, u: u }); }
      else if (level === 2) { for (let l = 13; l <= 25; l++) for (let u = 0; u < 3; u++) out.push({ t: 'diag', l: l, u: u }); for (let d = 4; d <= 40; d += 2) for (let u = 0; u < 3; u++) out.push({ t: 'area', d: d, u: u }); }
      else { for (let k = 2; k <= 15; k++) for (let u = 0; u < 3; u++) out.push({ t: 'perim', k: k, u: u }); for (let l = 3; l <= 30; l++) if (U.safeRound(l * Math.SQRT2, 1)) for (let u = 0; u < 3; u++) out.push({ t: 'diagdec', l: l, u: u }); }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const tx = 'Pătratul ' + T('ABCD') + ' ';
      if (p.t === 'diag' || p.t === 'diagdec') {
        const kind = p.t === 'diag' ? 'rad' : 'dec';
        const n = 2 * p.l * p.l;
        const R = root(kind, n);
        ex.text = tx + 'are latura ' + U.len('AB', p.l, u) + '. Calculează lungimea diagonalei ' + T('AC') + '.' + tail(kind);
        ex.figure = F.square(p.l, { AB: U.fl(p.l, u), AC: '?' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [mk.int(2 * p.l, 'double-side', 'Ai dublat latura. Diagonala este ipotenuza unui triunghi dreptunghic isoscel cu catetele ' + T(p.l) + ': ' + T('AC^2 = ' + p.l + '^2 + ' + p.l + '^2') + '.'), mk.int(p.l * p.l, 'area', 'Ai calculat aria. Diagonala se află cu Pitagora.'), mk.raw(p.l + '\\sqrt{3}', p.l * Math.sqrt(3), 'wrong-root', 'Diagonala pătratului este ' + T('l\\sqrt{2}') + ', nu ' + T('l\\sqrt{3}') + ' (aici ' + T('AC^2 = l^2 + l^2 = 2l^2') + ').')];
        ex.hints = ['În triunghiul ' + T('ABC') + ' unghiul drept este în ' + T('B') + ', iar ' + T('AB = BC') + '.', T('AC^2 = AB^2 + BC^2 = 2 \\cdot AB^2') + '.'];
        ex.steps = [T('AC^2 = AB^2 + BC^2 = ' + p.l + '^2 + ' + p.l + '^2 = 2 \\cdot ' + p.l * p.l + ' = ' + n), T('AC = ' + R.tex + '\\,\\text{' + u + '}'), 'Reține: diagonala pătratului este ' + T('d = l\\sqrt{2}') + '.'];
      } else if (p.t === 'side') {
        ex.text = tx + 'are diagonala ' + T('AC = ' + p.k + '\\sqrt{2}\\,\\text{' + u + '}') + '. Calculează lungimea **laturii** pătratului.';
        ex.figure = F.square(p.k, { AB: '?', AC: p.k + '√2 ' + u });
        ex.answer = { kind: 'int', value: p.k, unit: cm(u) };
        ex.mistakes = [mk.int(2 * p.k, 'double', 'Ai dublat. Din ' + T('d = l\\sqrt{2}') + ' obții ' + T('l = d : \\sqrt{2}') + '.'), mk.raw(p.k + '\\sqrt{2}', p.k * Math.SQRT2, 'diag-as-side', 'Aceasta este chiar diagonala. Latura este mai mică: ' + T('l = d : \\sqrt{2}') + '.'), mk.int(p.k * 2 * p.k, 'square-diag', 'Ai ridicat la pătrat. Se cere lungimea laturii, nu aria.'), mk.int(Math.max(1, p.k - 1), 'near', null)];
        ex.hints = [T('AC = AB \\sqrt{2}') + ' pentru pătrat.', 'Împarte ' + T(p.k + '\\sqrt{2}') + ' la ' + T('\\sqrt{2}') + '.'];
        ex.steps = [T('AC^2 = 2 \\cdot AB^2 \\Rightarrow (' + p.k + '\\sqrt{2})^2 = 2 \\cdot AB^2'), T(2 * p.k * p.k + ' = 2 \\cdot AB^2 \\Rightarrow AB^2 = ' + p.k * p.k), T('AB = ' + p.k + '\\,\\text{' + u + '}')];
      } else if (p.t === 'area') {
        const A = p.d * p.d / 2;
        ex.text = tx + 'are diagonala ' + U.len('AC', p.d, u) + '. Calculează **aria** pătratului.';
        ex.figure = F.square(Math.sqrt(A), { AB: '?', AC: U.fl(p.d, u) });
        ex.answer = { kind: 'int', value: A, unit: cm2(u) };
        ex.mistakes = [mk.int(p.d * p.d, 'forgot-half', 'Ai ridicat diagonala la pătrat, dar ' + T('d^2 = 2 \\cdot A') + ': aria este jumătate din ' + T(p.d * p.d) + '.'), mk.int(p.d, 'diag-as-area', 'Ai dat diagonala. Aria este ' + T('l^2') + ' și ' + T('2l^2 = d^2') + '.'), mk.int(p.d * p.d / 4, 'quarter', 'Aria este ' + T('d^2 : 2') + ', nu ' + T('d^2 : 4') + '.'), mk.int(2 * p.d, 'double', 'Nu dublăm diagonala.')];
        ex.hints = [T('AC^2 = AB^2 + BC^2 = 2 \\cdot AB^2') + ', iar ' + T('AB^2') + ' este chiar aria.', 'Deci aria este ' + T('AC^2 : 2') + '.'];
        ex.steps = [T('AC^2 = 2 \\cdot AB^2 \\Rightarrow AB^2 = ' + p.d + '^2 : 2 = ' + p.d * p.d + ' : 2 = ' + A), T('A = AB^2 = ' + A + '\\,\\text{' + u + '}^{2}')];
      } else {
        ex.text = tx + 'are diagonala ' + T('AC = ' + p.k + '\\sqrt{2}\\,\\text{' + u + '}') + '. Calculează **perimetrul** pătratului.';
        ex.figure = F.square(p.k, { AB: '?', AC: p.k + '√2 ' + u });
        ex.answer = { kind: 'int', value: 4 * p.k, unit: cm(u) };
        ex.mistakes = [mk.raw(4 * p.k + '\\sqrt{2}', 4 * p.k * Math.SQRT2, 'diag-times-4', 'Ai înmulțit diagonala cu 4. Perimetrul este ' + T('4 \\cdot l') + ', iar latura este mai mică decât diagonala.'), mk.int(p.k, 'side-only', 'Ai dat latura, nu perimetrul.'), mk.int(2 * p.k, 'half', 'Perimetrul unui pătrat are 4 laturi.'), mk.int(p.k * p.k, 'area', 'Ai dat aria. Perimetrul este ' + T('4l') + '.')];
        ex.hints = ['Din ' + T('d = l\\sqrt{2}') + ' află latura ' + T('l') + '.', 'Perimetrul este ' + T('4l') + '.'];
        ex.steps = [T('l = d : \\sqrt{2} = ' + p.k), T('P = 4l = 4 \\cdot ' + p.k + ' = ' + 4 * p.k + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'diag' || p.t === 'diagdec') return Math.abs(v - p.l * Math.SQRT2) < 1e-6;
      if (p.t === 'side') return Math.abs(v * Math.SQRT2 - p.k * Math.SQRT2) < 1e-9 && v === p.k;
      if (p.t === 'area') return Math.abs(v * 2 - p.d * p.d) < 1e-9;
      return Math.abs(v - 4 * p.k) < 1e-9;
    },
  });

  /* ================= Triunghi isoscel ================= */
  D({
    id: 'fig-iso', skill: 'p.fig.iso', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(50).forEach(function (t) { for (let u = 0; u < 3; u++) { out.push({ t: 'height', hb: t[0], h: t[1], l: t[2], u: u }); out.push({ t: 'height', hb: t[1], h: t[0], l: t[2], u: u }); } });
      else if (level === 2) { for (let k = 1; k <= 12; k++) for (let l = k + 1; l <= 18; l++) { const n = l * l - k * k; if (M.isSquare(n)) continue; out.push({ t: 'heightrad', k: k, l: l, u: (k + l) % 3 }); if (U.safeRound(Math.sqrt(n), 1)) out.push({ t: 'heightdec', k: k, l: l, u: (k * l) % 3 }); } }
      else U.triples(80, 13).forEach(function (t) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, i) { out.push({ t: 'area', hb: s[0], h: s[1], l: t[2], u: (t[2] + i) % 3 }); out.push({ t: 'perim', hb: s[0], h: s[1], l: t[2], u: (t[2] + i + 1) % 3 }); }); });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const lead = 'Triunghiul isoscel ' + T('ABC') + ' ';
      if (p.t === 'height' || p.t === 'heightrad' || p.t === 'heightdec') {
        const hb = p.t === 'height' ? p.hb : p.k, l = p.l;
        const kind = p.t === 'height' ? 'int' : p.t === 'heightrad' ? 'rad' : 'dec';
        const n = l * l - hb * hb;
        const R = root(kind, n);
        ex.text = lead + 'are ' + U.len('AB = AC', l, u) + ' și baza ' + U.len('BC', 2 * hb, u) + '. Calculează înălțimea ' + T('AD') + ' corespunzătoare bazei (' + T('AD \\perp BC') + ').' + tail(kind);
        ex.figure = F.iso(2 * hb, Math.sqrt(n), { BC: U.fl(2 * hb, u), AB: U.fl(l, u), AC: U.fl(l, u), AD: '?', BD: '', DC: '' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(l - hb, 'diff-lengths', 'Ai scăzut lungimile. În triunghiul dreptunghic ' + T('ABD') + ' se scad **pătratele**.'), U.mkAny(Math.sqrt(l * l + hb * hb), 'add-for-leg', 'Latura ' + T('AB') + ' este ipotenuză: ' + T('AD^2 = AB^2 - BD^2') + ' (se scade).'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        if (2 * hb < l) ex.mistakes.push(U.mkAny(Math.sqrt(l * l - 4 * hb * hb), 'whole-base', 'Ai folosit toată baza ' + T(2 * hb) + ' în loc de jumătatea ei. Înălțimea cade în **mijlocul** bazei: ' + T('BD = ' + hb) + '.'));
        ex.hints = ['Într-un triunghi isoscel, înălțimea din vârf cade în **mijlocul** bazei: ' + T('BD = BC : 2') + '.', 'Aplică Pitagora în triunghiul dreptunghic ' + T('ABD') + ' (ipotenuza este ' + T('AB') + ').'];
        ex.steps = [T('BD = BC : 2 = ' + 2 * hb + ' : 2 = ' + hb), T('AD^2 = AB^2 - BD^2 = ' + l + '^2 - ' + hb + '^2 = ' + l * l + ' - ' + hb * hb + ' = ' + n), T('AD = ' + R.tex + '\\,\\text{' + u + '}')];
      } else if (p.t === 'area') {
        const A = p.hb * p.h;
        ex.text = lead + 'are ' + U.len('AB = AC', p.l, u) + ' și baza ' + U.len('BC', 2 * p.hb, u) + '. Calculează **aria** triunghiului.';
        ex.figure = F.iso(2 * p.hb, p.h, { BC: U.fl(2 * p.hb, u), AB: U.fl(p.l, u), AC: U.fl(p.l, u), AD: '?' });
        ex.answer = { kind: 'int', value: A, unit: cm2(u) };
        ex.mistakes = [mk.int(2 * p.hb * p.h, 'forgot-half', 'Aria triunghiului este ' + T('\\frac{b \\cdot h}{2}') + ': ai uitat de împărțirea la 2.'), mk.int(p.hb * p.l, 'wrong-height', 'Ai folosit latura ' + T('AB') + ' ca înălțime. Înălțimea este ' + T('AD') + ' și se află cu Pitagora.'), mk.int(2 * p.hb * p.l, 'side-times-base', 'Ai înmulțit baza cu latura laterală. Aria folosește **înălțimea** ' + T('AD') + ', perpendiculară pe bază.')];
        ex.hints = ['Ai nevoie de înălțimea ' + T('AD') + ': află-o cu Pitagora în ' + T('ABD') + ', cu ' + T('BD = BC : 2') + '.', 'Aria este ' + T('\\frac{BC \\cdot AD}{2}') + '.'];
        ex.steps = [T('BD = ' + p.hb + ',\\; AD^2 = ' + p.l + '^2 - ' + p.hb + '^2 = ' + p.h * p.h + ' \\Rightarrow AD = ' + p.h), T('A = \\frac{BC \\cdot AD}{2} = \\frac{' + 2 * p.hb + ' \\cdot ' + p.h + '}{2} = ' + A + '\\,\\text{' + u + '}^{2}')];
      } else {
        const P = 2 * p.hb + 2 * p.l;
        ex.text = lead + 'are baza ' + U.len('BC', 2 * p.hb, u) + ' și înălțimea ' + U.len('AD', p.h, u) + ' (' + T('AD \\perp BC') + '). Calculează **perimetrul** triunghiului.';
        ex.figure = F.iso(2 * p.hb, p.h, { BC: U.fl(2 * p.hb, u), AB: '?', AC: '?', AD: U.fl(p.h, u) });
        ex.answer = { kind: 'int', value: P, unit: cm(u) };
        ex.mistakes = [mk.int(2 * p.hb + 2 * p.h, 'height-as-side', 'Ai folosit înălțimea ca latură. Laturile egale ' + T('AB = AC') + ' sunt ipotenuza triunghiului ' + T('ABD') + '.'), mk.int(2 * p.hb + p.l, 'one-side', 'Perimetrul include **ambele** laturi egale ' + T('AB') + ' și ' + T('AC') + '.'), mk.int(p.hb + 2 * p.l, 'half-base', 'Baza întreagă ' + T('BC = ' + 2 * p.hb) + ' intră în perimetru, nu jumătatea ei.'), mk.int(P - 1, 'near', null)];
        ex.hints = ['Află ' + T('AB') + ' din triunghiul dreptunghic ' + T('ABD') + ': ipotenuza este ' + T('AB') + ', catetele ' + T('BD') + ' și ' + T('AD') + '.', T('P = AB + AC + BC') + '.'];
        ex.steps = [T('BD = ' + p.hb + ',\\; AB^2 = BD^2 + AD^2 = ' + p.hb * p.hb + ' + ' + p.h * p.h + ' = ' + p.l * p.l + ' \\Rightarrow AB = ' + p.l), T('P = ' + p.l + ' + ' + p.l + ' + ' + 2 * p.hb + ' = ' + P + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'height') return v * v + p.hb * p.hb === p.l * p.l;
      if (p.t === 'heightrad' || p.t === 'heightdec') return Math.abs(v * v + p.k * p.k - p.l * p.l) < 1e-6;
      if (p.t === 'area') return U.isRight(p.hb, p.h, p.l) && v === p.hb * p.h;
      return U.isRight(p.hb, p.h, p.l) && v === 2 * p.hb + 2 * p.l;
    },
  });

  /* ================= Triunghi echilateral ================= */
  D({
    id: 'fig-equi', skill: 'p.fig.equi', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) for (let k = 1; k <= 6; k++) for (let u = 0; u < 3; u++) { out.push({ t: 'height', k: k, u: u }); out.push({ t: 'sideH', k: k, u: u }); }
      else if (level === 2) for (let k = 3; k <= 12; k++) for (let u = 0; u < 3; u++) { out.push({ t: 'height', k: k, u: u }); out.push({ t: 'area', k: k, u: u }); }
      else for (let k = 2; k <= 14; k++) for (let u = 0; u < 3; u++) { out.push({ t: 'perimH', k: k, u: u }); out.push({ t: 'area', k: k, u: u }); out.push({ t: 'sideH', k: k, u: u }); }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const k = p.k, l = 2 * k;
      const ex = {};
      const lead = 'Triunghiul echilateral ' + T('ABC') + ' ';
      const fig = function (lab) { return F.iso(l, k * Math.sqrt(3), lab); };
      if (p.t === 'height') {
        const n = 3 * k * k;
        ex.text = lead + 'are latura ' + U.len('AB', l, u) + '. Calculează **înălțimea** ' + T('AD') + ' (' + T('AD \\perp BC') + '). Scrie rezultatul sub formă de radical.';
        ex.figure = fig({ BC: U.fl(l, u), AB: U.fl(l, u), AC: U.fl(l, u), AD: '?' });
        ex.answer = { kind: 'rad', value: Math.sqrt(n), n: n, unit: cm(u) };
        ex.mistakes = [mk.raw(l + '\\sqrt{3}', l * Math.sqrt(3), 'forgot-half', 'Ai uitat că ' + T('BD') + ' este **jumătate** din latură: ' + T('AD^2 = AB^2 - BD^2 = ' + l + '^2 - ' + k + '^2') + '.'), mk.int(k, 'forgot-root3', 'Ai omis ' + T('\\sqrt{3}') + ': ' + T('AD^2 = ' + 3 * k * k) + ', deci ' + T('AD = ' + k + '\\sqrt{3}') + '.'), mk.int(l, 'height-as-side', 'Înălțimea este mai mică decât latura.'), mk.raw(k + '\\sqrt{2}', k * Math.SQRT2, 'wrong-root', 'Verifică: ' + T('AD^2 = ' + l + '^2 - ' + k + '^2 = ' + 3 * k * k) + '.')];
        ex.hints = ['În triunghiul echilateral înălțimea cade în mijlocul bazei: ' + T('BD = BC : 2') + '.', T('AD^2 = AB^2 - BD^2') + ' (triunghiul ' + T('ABD') + ' este dreptunghic în ' + T('D') + ').'];
        ex.steps = [T('BD = ' + l + ' : 2 = ' + k), T('AD^2 = ' + l + '^2 - ' + k + '^2 = ' + l * l + ' - ' + k * k + ' = ' + n), T('AD = \\sqrt{' + n + '} = ' + k + '\\sqrt{3}\\,\\text{' + u + '}'), 'Reține: înălțimea echilateralului este ' + T('h = \\frac{l\\sqrt{3}}{2}') + '.'];
      } else if (p.t === 'area') {
        const n = 3 * Math.pow(k, 4);
        ex.text = lead + 'are latura ' + U.len('AB', l, u) + '. Calculează **aria** triunghiului. Scrie rezultatul sub formă de radical simplificat.';
        ex.figure = fig({ BC: U.fl(l, u), AB: U.fl(l, u), AC: U.fl(l, u), AD: '?' });
        ex.answer = { kind: 'rad', value: Math.sqrt(n), n: n, unit: cm2(u) };
        ex.mistakes = [mk.raw(l * l + '\\sqrt{3}', l * l * Math.sqrt(3), 'forgot-quarter', 'Ai uitat împărțirea la 4: aria este ' + T('\\frac{l^2\\sqrt{3}}{4}') + '.'), mk.raw(k + '\\sqrt{3}', k * Math.sqrt(3), 'height-as-area', 'Aceasta este înălțimea. Aria este ' + T('\\frac{BC \\cdot AD}{2}') + '.'), mk.raw(2 * k * k + '\\sqrt{3}', 2 * k * k * Math.sqrt(3), 'double', 'Verifică: ' + T('\\frac{' + l + ' \\cdot ' + k + '\\sqrt{3}}{2}') + '.'), mk.int(l * l, 'square-side', 'Aria echilateralului nu este ' + T('l^2') + ' (asta e la pătrat).')];
        ex.hints = ['Află înălțimea ' + T('AD') + ' (cade în mijlocul bazei), apoi aplică ' + T('\\frac{BC \\cdot AD}{2}') + '.', T('AD = ' + k + '\\sqrt{3}') + '.'];
        ex.steps = [T('AD = ' + k + '\\sqrt{3}'), T('A = \\frac{BC \\cdot AD}{2} = \\frac{' + l + ' \\cdot ' + k + '\\sqrt{3}}{2} = ' + k * k + '\\sqrt{3}\\,\\text{' + u + '}^{2}')];
      } else if (p.t === 'sideH') {
        ex.text = lead + 'are înălțimea ' + T('AD = ' + k + '\\sqrt{3}\\,\\text{' + u + '}') + '. Calculează lungimea **laturii** triunghiului.';
        ex.figure = fig({ BC: '?', AB: '?', AC: '?', AD: k + '√3 ' + u });
        ex.answer = { kind: 'int', value: l, unit: cm(u) };
        ex.mistakes = [mk.int(k, 'half-side', 'Aceasta este jumătate din latură (' + T('BD') + '). Latura este ' + T('BC = 2 \\cdot BD') + '.'), mk.raw(k + '\\sqrt{3}', k * Math.sqrt(3), 'height-as-side', 'Aceasta este chiar înălțimea.'), mk.int(3 * k, 'times-3', 'Verifică cu ' + T('h = \\frac{l\\sqrt{3}}{2}') + ': ' + T('l = \\frac{2h}{\\sqrt{3}}') + '.'), mk.int(l + 1, 'near', null)];
        ex.hints = [T('h = \\frac{l\\sqrt{3}}{2}') + ', deci ' + T('l\\sqrt{3} = 2h') + '.', 'Sau: ' + T('AB^2 = AD^2 + BD^2') + ' cu ' + T('BD = AB : 2') + '.'];
        ex.steps = [T('AB^2 = AD^2 + (AB : 2)^2 \\Rightarrow \\frac{3}{4}AB^2 = ' + 3 * k * k), T('AB^2 = ' + 4 * k * k + ' \\Rightarrow AB = ' + l + '\\,\\text{' + u + '}')];
      } else {
        ex.text = lead + 'are înălțimea ' + T('AD = ' + k + '\\sqrt{3}\\,\\text{' + u + '}') + '. Calculează **perimetrul** triunghiului.';
        ex.figure = fig({ BC: '?', AB: '?', AC: '?', AD: k + '√3 ' + u });
        ex.answer = { kind: 'int', value: 6 * k, unit: cm(u) };
        ex.mistakes = [mk.int(3 * k, 'half', 'Ai calculat ' + T('3 \\cdot BD') + '. Perimetrul este ' + T('3 \\cdot BC') + ', iar ' + T('BC = 2 \\cdot BD') + '.'), mk.raw(6 * k + '\\sqrt{3}', 6 * k * Math.sqrt(3), 'times-root3', 'Perimetrul nu conține ' + T('\\sqrt{3}') + ': latura este număr întreg.'), mk.int(l, 'side-only', 'Ai dat doar latura. Perimetrul are 3 laturi.'), mk.int(4 * k, 'near', null)];
        ex.hints = ['Află latura din înălțime: ' + T('h = \\frac{l\\sqrt{3}}{2}') + '.', 'Perimetrul echilateralului este ' + T('3l') + '.'];
        ex.steps = [T('l\\sqrt{3} = 2h = ' + 2 * k + '\\sqrt{3} \\Rightarrow l = ' + l), T('P = 3l = 3 \\cdot ' + l + ' = ' + 6 * k + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value, k = p.k, l = 2 * k;
      if (p.t === 'height') return Math.abs(v * v + k * k - l * l) < 1e-6;
      if (p.t === 'area') return Math.abs(v - 0.5 * l * k * Math.sqrt(3)) < 1e-6;
      if (p.t === 'sideH') return Math.abs(v * v - 4 * (k * Math.sqrt(3)) * (k * Math.sqrt(3)) / 3) < 1e-6;
      return Math.abs(v - 3 * l) < 1e-9;
    },
  });

  /* ================= Romb ================= */
  D({
    id: 'fig-rhomb', skill: 'p.fig.rhomb', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(30).forEach(function (t) { for (let u = 0; u < 3; u++) { out.push({ t: 'side', a: t[0], b: t[1], u: u }); out.push({ t: 'side', a: t[1], b: t[0], u: u }); } });
      else if (level === 2) { for (let a = 2; a <= 10; a++) for (let b = 2; b <= 10; b++) { const n = a * a + b * b; if (M.isSquare(n)) continue; out.push({ t: 'siderad', a: a, b: b, u: (a + b) % 3 }); if (U.safeRound(Math.sqrt(n), 1)) out.push({ t: 'sidedec', a: a, b: b, u: (a * b) % 3 }); } }
      else U.triples(60, 10).forEach(function (t) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, i) { out.push({ t: 'diag', a: s[0], b: s[1], c: t[2], u: (t[2] + i) % 3 }); out.push({ t: 'area', a: s[0], b: s[1], c: t[2], u: (t[2] + i + 1) % 3 }); }); });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const lead = 'Rombul ' + T('ABCD') + ' ';
      if (p.t === 'side' || p.t === 'siderad' || p.t === 'sidedec') {
        const kind = p.t === 'side' ? 'int' : p.t === 'siderad' ? 'rad' : 'dec';
        const n = p.a * p.a + p.b * p.b;
        const R = root(kind, n);
        ex.text = lead + 'are diagonalele ' + U.len('AC', 2 * p.a, u) + ' și ' + U.len('BD', 2 * p.b, u) + '. Calculează lungimea **laturii** rombului.' + tail(kind);
        ex.figure = F.rhomb(2 * p.a, 2 * p.b, { AC: U.fl(2 * p.a, u), BD: U.fl(2 * p.b, u), AB: '?' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(Math.sqrt(4 * n), 'whole-diagonals', 'Ai folosit diagonalele întregi. Ele se **înjumătățesc**: ' + T('AO = ' + p.a) + ' și ' + T('BO = ' + p.b) + '; latura este ipotenuza triunghiului ' + T('AOB') + '.'), U.mkAny(p.a + p.b, 'sum-of-halves', 'Ai adunat jumătățile diagonalelor. Se aplică Pitagora în ' + T('AOB') + '.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        if (kind === 'rad' && radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
        ex.hints = ['Diagonalele rombului sunt perpendiculare și se înjumătățesc: ' + T('AO = AC : 2') + ', ' + T('BO = BD : 2') + '.', 'Latura ' + T('AB') + ' este ipotenuza triunghiului dreptunghic ' + T('AOB') + '.'];
        ex.steps = [T('AO = ' + 2 * p.a + ' : 2 = ' + p.a + ',\\; BO = ' + 2 * p.b + ' : 2 = ' + p.b), T('AB^2 = AO^2 + BO^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + n), T('AB = ' + R.tex + '\\,\\text{' + u + '}')];
      } else if (p.t === 'diag') {
        ex.text = lead + 'are latura ' + U.len('AB', p.c, u) + ' și diagonala ' + U.len('AC', 2 * p.a, u) + '. Calculează lungimea diagonalei ' + T('BD') + '.';
        ex.figure = F.rhomb(2 * p.a, 2 * p.b, { AC: U.fl(2 * p.a, u), BD: '?', AB: U.fl(p.c, u) });
        ex.answer = { kind: 'int', value: 2 * p.b, unit: cm(u) };
        ex.mistakes = [mk.int(p.b, 'forgot-double', T('BO = ' + p.b) + ' este doar jumătate din diagonală: ' + T('BD = 2 \\cdot BO') + '.'), mk.int(p.c - p.a, 'diff-lengths', 'Se scad pătratele (nu lungimile) în triunghiul ' + T('AOB') + '.'), mk.int(Math.round(Math.sqrt(p.c * p.c - 4 * p.a * p.a > 0 ? p.c * p.c - 4 * p.a * p.a : 1)), 'whole-diag', 'Ai scăzut diagonala întreagă. Folosește jumătatea ei: ' + T('AO = ' + p.a) + '.'), mk.int(2 * p.b + 2, 'near', null)];
        ex.hints = ['Diagonalele sunt perpendiculare și se înjumătățesc în ' + T('O') + ': ' + T('AO = ' + p.a) + '.', 'În triunghiul dreptunghic ' + T('AOB') + ' ipotenuza este ' + T('AB') + '.'];
        ex.steps = [T('AO = ' + 2 * p.a + ' : 2 = ' + p.a), T('BO^2 = AB^2 - AO^2 = ' + p.c + '^2 - ' + p.a + '^2 = ' + p.b * p.b + ' \\Rightarrow BO = ' + p.b), T('BD = 2 \\cdot BO = ' + 2 * p.b + '\\,\\text{' + u + '}')];
      } else {
        const A = 2 * p.a * p.b;
        ex.text = lead + 'are latura ' + U.len('AB', p.c, u) + ' și diagonala ' + U.len('AC', 2 * p.a, u) + '. Calculează **aria** rombului.';
        ex.figure = F.rhomb(2 * p.a, 2 * p.b, { AC: U.fl(2 * p.a, u), BD: '?', AB: U.fl(p.c, u) });
        ex.answer = { kind: 'int', value: A, unit: cm2(u) };
        ex.mistakes = [mk.int(4 * p.a * p.b, 'forgot-half', 'Aria rombului este ' + T('\\frac{d_1 \\cdot d_2}{2}') + ': ai uitat împărțirea la 2.'), mk.int(p.a * p.b, 'halves', 'Ai înmulțit jumătățile diagonalelor. Aria este produsul diagonalelor întregi împărțit la 2.'), mk.int(p.c * 2 * p.a, 'side-times-diag', 'Aria nu este latura × diagonala. Folosește ' + T('\\frac{AC \\cdot BD}{2}') + '.')];
        ex.hints = ['Află mai întâi cealaltă diagonală, ' + T('BD') + ', cu Pitagora în ' + T('AOB') + '.', 'Aria rombului: ' + T('\\frac{AC \\cdot BD}{2}') + '.'];
        ex.steps = [T('BO^2 = ' + p.c + '^2 - ' + p.a + '^2 = ' + p.b * p.b + ' \\Rightarrow BD = ' + 2 * p.b), T('A = \\frac{AC \\cdot BD}{2} = \\frac{' + 2 * p.a + ' \\cdot ' + 2 * p.b + '}{2} = ' + A + '\\,\\text{' + u + '}^{2}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'side' || p.t === 'siderad' || p.t === 'sidedec') return Math.abs(v * v - (p.a * p.a + p.b * p.b)) < 1e-6;
      if (p.t === 'diag') return U.isRight(p.a, p.b, p.c) && v === 2 * p.b;
      return U.isRight(p.a, p.b, p.c) && v === 2 * p.a * p.b;
    },
  });

  /* ================= Trapez ================= */
  D({
    id: 'fig-trap', skill: 'p.fig.trap', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(50, 5).forEach(function (t, i) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, j) { for (const b of [6, 9, 12]) out.push({ t: 'isoh', k: s[0], h: s[1], l: t[2], b: b + ((i + j) % 4), u: (i + j) % 3 }); }); });
      else if (level === 2) { U.triples(60, 5).forEach(function (t, i) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, j) { out.push({ t: 'rightleg', h: s[0], d: s[1], l: t[2], b: 5 + ((i + j) % 6), u: (i + j) % 3 }); }); }); for (let h = 2; h <= 10; h++) for (let d = 2; d <= 10; d++) { const n = h * h + d * d; if (M.isSquare(n)) continue; out.push({ t: 'rightlegrad', h: h, d: d, b: 4 + (h % 5), u: (h + d) % 3 }); } }
      else U.triples(60, 10).forEach(function (t, i) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (s, j) { out.push({ t: 'area', k: s[0], h: s[1], l: t[2], b: 6 + ((i + j) % 7), u: (i + j) % 3 }); out.push({ t: 'perim', k: s[0], h: s[1], l: t[2], b: 6 + ((i * 2 + j) % 7), u: (i + j + 1) % 3 }); }); });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      if (p.t === 'rightleg' || p.t === 'rightlegrad') {
        const kind = p.t === 'rightleg' ? 'int' : 'rad';
        const n = p.h * p.h + p.d * p.d;
        const R = root(kind, n);
        const B = p.b + p.d;
        ex.text = 'Trapezul dreptunghic ' + T('ABCD') + ' (' + T('AB \\parallel CD') + ', ' + T('AD \\perp AB') + ') are bazele ' + U.len('AB', B, u) + ' și ' + U.len('CD', p.b, u) + ', iar înălțimea ' + U.len('AD', p.h, u) + '. Calculează lungimea laturii oblice ' + T('BC') + '.' + tail(kind);
        ex.figure = F.trapRight(B, p.b, p.h, { AB: U.fl(B, u), DC: U.fl(p.b, u), AD: U.fl(p.h, u), BC: '?' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(p.h + p.d, 'add-legs', 'Ai adunat lungimile. Latura ' + T('BC') + ' este ipotenuza triunghiului ' + T('CEB') + ' și se află cu Pitagora.'), U.mkAny(Math.sqrt(B * B + p.h * p.h), 'whole-base', 'Ai folosit baza mare întreagă. Catetă este doar ' + T('EB = AB - CD = ' + p.d) + '.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        if (kind === 'rad' && radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
        ex.hints = ['Duci ' + T('CE \\perp AB') + ', cu ' + T('E \\in AB') + '. Atunci ' + T('CE = AD') + ' și ' + T('EB = AB - CD') + '.', 'Aplică Pitagora în triunghiul dreptunghic ' + T('CEB') + '.'];
        ex.steps = [T('EB = AB - CD = ' + B + ' - ' + p.b + ' = ' + p.d + ',\\; CE = AD = ' + p.h), T('BC^2 = CE^2 + EB^2 = ' + p.h + '^2 + ' + p.d + '^2 = ' + n), T('BC = ' + R.tex + '\\,\\text{' + u + '}')];
      } else {
        const B = p.b + 2 * p.k;
        const trapTxt = 'Trapezul isoscel ' + T('ABCD') + ' (' + T('AB \\parallel CD') + ') are bazele ' + U.len('AB', B, u) + ' și ' + U.len('CD', p.b, u);
        const L = { AB: U.fl(B, u), DC: U.fl(p.b, u), AD: U.fl(p.l, u), BC: U.fl(p.l, u), DE: '?', AE: '' };
        if (p.t === 'isoh') {
          ex.text = trapTxt + ' și laturile neparalele ' + U.len('AD = BC', p.l, u) + '. Calculează **înălțimea** trapezului.';
          ex.figure = F.trap(B, p.b, p.h, p.k, L);
          ex.answer = { kind: 'int', value: p.h, unit: cm(u) };
          ex.mistakes = [mk.int(p.l - p.k, 'diff-lengths', 'Ai scăzut lungimile. Se scad pătratele în triunghiul ' + T('AED') + '.'), U.mkAny(Math.sqrt(p.l * p.l - (B - p.b) * (B - p.b)) || 1, 'whole-difference', 'Ai folosit toată diferența bazelor. Proiecția laturii ' + T('AD') + ' pe bază este **jumătate** din ea: ' + T('AE = (AB - CD) : 2 = ' + p.k) + '.'), U.mkAny(Math.sqrt(p.l * p.l + p.k * p.k), 'add-for-leg', 'Latura ' + T('AD') + ' este ipotenuză: se scade ' + T('AE^2') + '.'), mk.int(p.h * p.h, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
          ex.hints = ['Duci înălțimile ' + T('DE') + ' și ' + T('CF') + ' pe ' + T('AB') + '. În trapezul isoscel, ' + T('AE = (AB - CD) : 2') + '.', 'Aplică Pitagora în triunghiul dreptunghic ' + T('AED') + '.'];
          ex.steps = [T('AE = (AB - CD) : 2 = (' + B + ' - ' + p.b + ') : 2 = ' + p.k), T('DE^2 = AD^2 - AE^2 = ' + p.l + '^2 - ' + p.k + '^2 = ' + p.h * p.h), T('DE = ' + p.h + '\\,\\text{' + u + '}')];
        } else if (p.t === 'area') {
          const A = (p.b + p.k) * p.h;
          ex.text = trapTxt + ' și laturile neparalele ' + U.len('AD = BC', p.l, u) + '. Calculează **aria** trapezului.';
          ex.figure = F.trap(B, p.b, p.h, p.k, L);
          ex.answer = { kind: 'int', value: A, unit: cm2(u) };
          ex.mistakes = [mk.int((B + p.b) * p.l / 2, 'wrong-height', 'Ai folosit latura neparalelă ca înălțime. Înălțimea ' + T('DE') + ' se află cu Pitagora.'), mk.int((B + p.b) * p.h, 'forgot-half', 'Aria trapezului este ' + T('\\frac{(B + b) \\cdot h}{2}') + ': ai uitat împărțirea la 2.'), mk.int(B * p.h, 'one-base', 'Aria trapezului folosește **ambele** baze: ' + T('\\frac{(B + b) \\cdot h}{2}') + '.')];
          ex.hints = ['Ai nevoie de înălțime: duci ' + T('DE \\perp AB') + ' și afli ' + T('DE') + ' cu Pitagora (' + T('AE = (AB - CD) : 2') + ').', 'Aria trapezului: ' + T('\\frac{(AB + CD) \\cdot DE}{2}') + '.'];
          ex.steps = [T('AE = (' + B + ' - ' + p.b + ') : 2 = ' + p.k + ',\\; DE^2 = ' + p.l + '^2 - ' + p.k + '^2 = ' + p.h * p.h + ' \\Rightarrow DE = ' + p.h), T('A = \\frac{(' + B + ' + ' + p.b + ') \\cdot ' + p.h + '}{2} = ' + A + '\\,\\text{' + u + '}^{2}')];
        } else {
          const P = B + p.b + 2 * p.l;
          ex.text = trapTxt + ' și înălțimea ' + U.len('DE', p.h, u) + '. Calculează **perimetrul** trapezului.';
          ex.figure = F.trap(B, p.b, p.h, p.k, { AB: U.fl(B, u), DC: U.fl(p.b, u), AD: '?', BC: '?', DE: U.fl(p.h, u), AE: '' });
          ex.answer = { kind: 'int', value: P, unit: cm(u) };
          ex.mistakes = [mk.int(B + p.b + 2 * p.h, 'height-as-side', 'Înălțimea nu este latură a trapezului. Laturile neparalele ' + T('AD') + ' și ' + T('BC') + ' se află cu Pitagora în ' + T('AED') + '.'), mk.int(B + p.b + p.l, 'one-leg', 'Perimetrul conține **ambele** laturi neparalele.'), mk.int(B + p.b + 2 * p.k, 'projection', 'Ai folosit proiecția ' + T('AE') + ' în loc de latura ' + T('AD') + '.')];
          ex.hints = ['Calculează ' + T('AE = (AB - CD) : 2') + ', apoi ' + T('AD') + ' din triunghiul dreptunghic ' + T('AED') + '.', 'Perimetrul: ' + T('AB + BC + CD + DA') + '.'];
          ex.steps = [T('AE = (' + B + ' - ' + p.b + ') : 2 = ' + p.k), T('AD^2 = AE^2 + DE^2 = ' + p.k * p.k + ' + ' + p.h * p.h + ' = ' + p.l * p.l + ' \\Rightarrow AD = ' + p.l), T('P = ' + B + ' + ' + p.b + ' + 2 \\cdot ' + p.l + ' = ' + P + '\\,\\text{' + u + '}')];
        }
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'rightleg' || p.t === 'rightlegrad') return Math.abs(v * v - (p.h * p.h + p.d * p.d)) < 1e-6;
      if (!U.isRight(p.k, p.h, p.l)) return false;
      const B = p.b + 2 * p.k;
      if (p.t === 'isoh') return v === p.h;
      if (p.t === 'area') return v === (B + p.b) * p.h / 2;
      return v === B + p.b + 2 * p.l;
    },
  });

  /* ================= Distanța dintre două puncte ================= */
  D({
    id: 'fig-coord', skill: 'p.fig.coord', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const sg = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      if (level === 1) U.triples(25).forEach(function (t, i) { [[t[0], t[1]], [t[1], t[0]]].forEach(function (d, j) { sg.forEach(function (s, k) { const x1 = ((i + j) % 4) - 1, y1 = ((i + k) % 4) - 1; out.push({ x1: x1, y1: y1, x2: x1 + s[0] * d[0], y2: y1 + s[1] * d[1], kind: 'int' }); }); }); });
      else if (level === 2) { for (let dx = 1; dx <= 8; dx++) for (let dy = 1; dy <= 8; dy++) { const n = dx * dx + dy * dy; if (M.isSquare(n)) continue; [[1, 1], [-1, 1]].forEach(function (s, k) { const x1 = (dx % 4), y1 = (dy % 3); out.push({ x1: x1, y1: y1, x2: x1 + s[0] * dx, y2: y1 + s[1] * dy, kind: 'rad' }); if (U.safeRound(Math.sqrt(n), 1)) out.push({ x1: x1 - 1, y1: y1, x2: x1 - 1 + s[0] * dx, y2: y1 + s[1] * dy, kind: 'dec' }); }); } }
      else { for (let dx = 1; dx <= 10; dx++) for (let dy = 1; dy <= 10; dy++) { const n = dx * dx + dy * dy; if (M.isSquare(n) || M.simplifyRadical(n).b === n) continue; sg.forEach(function (s, k) { const x1 = -((dx + k) % 5) - 1, y1 = ((dy + k) % 6) - 3; out.push({ x1: x1, y1: y1, x2: x1 + s[0] * dx, y2: y1 + s[1] * dy, kind: 'rad' }); }); } }
      return out;
    },
    build: function (p) {
      const dx = Math.abs(p.x2 - p.x1), dy = Math.abs(p.y2 - p.y1);
      const n = dx * dx + dy * dy;
      const R = root(p.kind, n);
      const ex = {};
      const P = function (x, y) { return '(' + x + ',\\; ' + y + ')'; };
      ex.text = 'În sistemul de axe ' + T('xOy') + ' se dau punctele ' + T('A' + P(p.x1, p.y1)) + ' și ' + T('B' + P(p.x2, p.y2)) + '. Calculează lungimea segmentului ' + T('AB') + '.' + tail(p.kind);
      ex.figure = F.coord([p.x1, p.y1], [p.x2, p.y2]);
      ex.answer = R.a;
      ex.mistakes = [U.mkAny(dx + dy, 'add-diffs', 'Ai adunat diferențele ' + T(dx + ' + ' + dy) + '. Ele sunt catetele unui triunghi dreptunghic: distanța este ipotenuza.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
      const sx = Math.abs(Math.abs(p.x2) - Math.abs(p.x1)), sy = Math.abs(Math.abs(p.y2) - Math.abs(p.y1));
      if ((sx !== dx || sy !== dy) && sx * sx + sy * sy > 0) ex.mistakes.push(U.mkAny(Math.sqrt(sx * sx + sy * sy), 'sign-error', 'Ai scăzut valorile absolute ale coordonatelor. Diferența corectă: ' + T(P(p.x2, p.y2).replace(/[(),;\\ ]/g, ' ').trim() ? 'x_B - x_A = ' + p.x2 + ' - ' + (p.x1 < 0 ? '(' + p.x1 + ')' : p.x1) + ' = ' + (p.x2 - p.x1) : '') + '.'));
      if (p.kind === 'rad' && radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
      ex.hints = ['Desenează triunghiul dreptunghic cu catetele paralele cu axele. Lungimile lor sunt ' + T('|x_B - x_A|') + ' și ' + T('|y_B - y_A|') + '.', 'Distanța este ipotenuza: ' + T('AB = \\sqrt{(x_B - x_A)^2 + (y_B - y_A)^2}') + '.'];
      const sub = function (a, b) { return a + ' - ' + (b < 0 ? '(' + b + ')' : b); };
      ex.steps = [T('AB^2 = (' + sub(p.x2, p.x1) + ')^2 + (' + sub(p.y2, p.y1) + ')^2 = ' + (p.x2 - p.x1) + '^2 + ' + (p.y2 - p.y1) + '^2 = ' + dx * dx + ' + ' + dy * dy + ' = ' + n), T('AB = ' + R.tex)];
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      return Math.abs(v - Math.hypot(p.x2 - p.x1, p.y2 - p.y1)) < 1e-6 && (p.x1 !== p.x2 || p.y1 !== p.y2);
    },
  });

  /* ================= Aplicații: scară, cablu, zmeu ================= */
  const slipPairs = (function () {
    let cache = null;
    return function () {
      if (cache) return cache;
      const byC = {};
      U.triples(130, 10).forEach(function (t) { (byC[t[2]] = byC[t[2]] || []).push({ f: t[0], h: t[1] }, { f: t[1], h: t[0] }); });
      cache = [];
      Object.keys(byC).forEach(function (c) { const e = byC[c]; for (let i = 0; i < e.length; i++) for (let j = 0; j < e.length; j++) if (e[i].f < e[j].f) cache.push({ L: +c, d1: e[i].f, h1: e[i].h, d2: e[j].f, h2: e[j].h }); });
      return cache;
    };
  })();

  D({
    id: 'app-ladder', skill: 'p.app.ladder', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) {
        U.triples(50).forEach(function (t, i) {
          const sw = i % 2;
          const x = sw ? t[1] : t[0], y = sw ? t[0] : t[1];
          out.push({ t: 'ladder', L: t[2], d: x });          // înălțimea = y
          out.push({ t: 'ladderD', L: t[2], h: y });         // distanța bazei = x
          out.push({ t: 'cable', d: x, h: y });
          out.push({ t: 'kite', d: y, h: x });
        });
      } else if (level === 2) {
        for (let a = 2; a <= 14; a++) for (let b = 2; b <= 14; b++) {
          const n = a * a + b * b;
          if (M.isSquare(n) || !U.safeRound(Math.sqrt(n), 1) || (a * 3 + b) % 4) continue;
          out.push({ t: 'cable', d: a, h: b }); out.push({ t: 'kite', d: b, h: a });
        }
        for (let L = 5; L <= 20; L++) for (let x = 2; x < L - 1; x++) {
          const n = L * L - x * x;
          if (M.isSquare(n) || !U.safeRound(Math.sqrt(n), 1) || (L + x) % 3) continue;
          out.push({ t: 'ladder', L: L, d: x }); out.push({ t: 'ladderD', L: L, h: x });
        }
      } else slipPairs().forEach(function (s, i) { if (i % 2 === 0) out.push({ t: 'slip', L: s.L, d1: s.d1, h1: s.h1, d2: s.d2, h2: s.h2 }); });
      return out;
    },
    build: function (p, level) {
      const ex = {};
      const kind = level === 2 ? 'dec' : 'int';
      if (p.t === 'slip') {
        const drop = p.h1 - p.h2;
        ex.text = 'O scară de ' + U.val(p.L, 'm') + ' este sprijinită de un perete vertical, cu baza la ' + U.val(p.d1, 'm') + ' de perete. Baza scării este trasă mai departe, la ' + U.val(p.d2, 'm') + ' de perete. Cu cât **coboară** capătul de sus al scării pe perete?';
        ex.figure = F.slip(p.d1, p.h1, p.d2, p.h2, { FT: U.fl(p.L, 'm'), PF: U.fl(p.d1, 'm') });
        ex.answer = { kind: 'int', value: drop, unit: cm('m') };
        ex.mistakes = [mk.int(p.d2 - p.d1, 'foot-move', 'Ai calculat cu cât s-a mutat **baza** (' + T(p.d2 + ' - ' + p.d1) + '). Se cere cu cât coboară **vârful**: diferența înălțimilor.'), mk.int(p.h2, 'new-height', 'Aceasta este înălțimea nouă. Se cere **diferența** dintre înălțimea veche și cea nouă.'), mk.int(p.h1 + p.h2, 'sum-heights', 'Ai adunat înălțimile; coborârea este diferența lor.')];
        ex.hints = ['Calculează înălțimea la care ajunge scara în fiecare poziție, cu Pitagora.', 'Coborârea este înălțimea inițială minus cea finală.'];
        ex.steps = [T('h_1^2 = ' + p.L + '^2 - ' + p.d1 + '^2 = ' + p.h1 * p.h1 + ' \\Rightarrow h_1 = ' + p.h1), T('h_2^2 = ' + p.L + '^2 - ' + p.d2 + '^2 = ' + p.h2 * p.h2 + ' \\Rightarrow h_2 = ' + p.h2), T('h_1 - h_2 = ' + p.h1 + ' - ' + p.h2 + ' = ' + drop + '\\,\\text{m}')];
        return ex;
      }
      if (p.t === 'ladder' || p.t === 'ladderD') {
        const isH = p.t === 'ladder';                 // cerem înălțimea (ladder) sau distanța bazei (ladderD)
        const known = isH ? p.d : p.h;
        const n = p.L * p.L - known * known;
        const R = root(kind, n);
        const unk = Math.sqrt(n);
        ex.text = isH
          ? 'O scară de ' + U.val(p.L, 'm') + ' lungime este sprijinită de un perete vertical, cu baza la ' + U.val(known, 'm') + ' de perete. La ce **înălțime** atinge scara peretele?' + tail(kind)
          : 'O scară de ' + U.val(p.L, 'm') + ' lungime ajunge pe un perete vertical la înălțimea de ' + U.val(known, 'm') + '. La ce **distanță de perete** se află baza scării?' + tail(kind);
        ex.figure = isH ? F.ladder(known, unk, { PF: U.fl(known, 'm'), FT: U.fl(p.L, 'm'), PT: '?' }) : F.ladder(unk, known, { PF: '?', FT: U.fl(p.L, 'm'), PT: U.fl(known, 'm') });
        ex.answer = withUnit(R.a, 'm');
        ex.mistakes = [U.mkAny(p.L - known, 'diff-lengths', 'Ai scăzut lungimile. Scara este ipotenuza: se scad **pătratele**.'), U.mkAny(Math.sqrt(p.L * p.L + known * known), 'add-for-leg', 'Scara este ipotenuza (cea mai lungă latură): o catetă se află prin **scădere**.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        ex.hints = ['Peretele, solul și scara formează un triunghi dreptunghic. Scara este ipotenuza.', T((isH ? 'h' : 'd') + '^2 = L^2 - ' + (isH ? 'd' : 'h') + '^2') + ', apoi rădăcina pătrată.'];
        ex.steps = [T((isH ? 'h' : 'd') + '^2 = L^2 - ' + (isH ? 'd' : 'h') + '^2 = ' + p.L + '^2 - ' + known + '^2 = ' + p.L * p.L + ' - ' + known * known + ' = ' + n), T((isH ? 'h' : 'd') + ' = ' + R.tex + '\\,\\text{m}')];
        return ex;
      }
      const isCable = p.t === 'cable';
      const n = p.d * p.d + p.h * p.h;
      const R = root(kind, n);
      ex.text = isCable
        ? 'Un stâlp vertical de ' + U.val(p.h, 'm') + ' este fixat cu un cablu întins de vârful lui până într-un punct de pe sol aflat la ' + U.val(p.d, 'm') + ' de baza stâlpului. Ce **lungime** are cablul?' + tail(kind)
        : 'Un zmeu se află la ' + U.val(p.h, 'm') + ' deasupra solului, iar copilul care îl ține se află pe orizontală la ' + U.val(p.d, 'm') + ' de punctul de sub zmeu. Ce **lungime** are sfoara întinsă?' + tail(kind);
      ex.figure = F.ladder(p.d, p.h, { PF: U.fl(p.d, 'm'), PT: U.fl(p.h, 'm'), FT: '?' }, isCable ? 'cable' : 'kite');
      ex.answer = withUnit(R.a, 'm');
      ex.mistakes = [U.mkAny(p.d + p.h, 'add-legs', 'Ai adunat lungimile. ' + (isCable ? 'Cablul' : 'Sfoara') + ' este ipotenuza: se adună **pătratele** și se extrage rădăcina.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.'), U.mkAny(Math.sqrt(Math.abs(p.h * p.h - p.d * p.d)), 'subtract', 'Ai scăzut pătratele; ipotenuza se află prin **adunare**.')];
      ex.hints = ['Solul, ' + (isCable ? 'stâlpul' : 'verticala zmeului') + ' și ' + (isCable ? 'cablul' : 'sfoara') + ' formează un triunghi dreptunghic. Ce latură este ipotenuza?', T('L^2 = d^2 + h^2') + ', apoi rădăcina pătrată.'];
      ex.steps = [T('L^2 = d^2 + h^2 = ' + p.d + '^2 + ' + p.h + '^2 = ' + p.d * p.d + ' + ' + p.h * p.h + ' = ' + n), T('L = ' + R.tex + '\\,\\text{m}')];
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'slip') return Math.abs(p.d1 * p.d1 + p.h1 * p.h1 - p.L * p.L) < 1e-9 && Math.abs(p.d2 * p.d2 + p.h2 * p.h2 - p.L * p.L) < 1e-9 && v === p.h1 - p.h2 && p.h1 > p.h2;
      if (p.t === 'ladder') return Math.abs(v * v + p.d * p.d - p.L * p.L) < 1e-6;
      if (p.t === 'ladderD') return Math.abs(v * v + p.h * p.h - p.L * p.L) < 1e-6;
      return Math.abs(v * v - (p.d * p.d + p.h * p.h)) < 1e-6;
    },
  });

  /* ================= Aplicații: ecran ================= */
  const DEV = ['unei tablete', 'unui monitor', 'unui televizor', 'unui telefon', 'unui laptop'];
  D({
    id: 'app-screen', skill: 'p.app.screen', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(100, 20).forEach(function (t, i) { out.push({ t: 'diag', w: t[1], h: t[0], d: i % 5 }); out.push({ t: 'height', w: t[1], diag: t[2], d: (i + 1) % 5 }); });
      else if (level === 2) { for (let w = 20; w <= 120; w += 3) for (const hh of [Math.round(w * 9 / 16), Math.round(w * 3 / 4)]) { const n = w * w + hh * hh; if (M.isSquare(n) || !U.safeRound(Math.sqrt(n), 1)) continue; out.push({ t: 'diagdec', w: w, h: hh, d: (w + hh) % 5 }); } }
      else { for (let w = 30; w <= 150; w += 5) { const hh = Math.round(w * 9 / 16); const dcm = Math.sqrt(w * w + hh * hh); if (!U.safeRound(dcm / 2.54, 1)) continue; out.push({ t: 'inch', w: w, h: hh, d: (w / 5) % 5 }); } }
      return out;
    },
    build: function (p) {
      const ex = {};
      const dev = DEV[p.d];
      if (p.t === 'diag' || p.t === 'diagdec') {
        const kind = p.t === 'diag' ? 'int' : 'dec';
        const n = p.w * p.w + p.h * p.h;
        const R = root(kind, n);
        ex.text = 'Ecranul ' + dev + ' are lățimea ' + U.val(p.w, 'cm') + ' și înălțimea ' + U.val(p.h, 'cm') + '. Calculează lungimea **diagonalei** ecranului.' + tail(kind);
        ex.figure = F.rect(p.w, p.h, { AB: U.fl(p.w, 'cm'), BC: U.fl(p.h, 'cm'), AC: '?' });
        ex.answer = withUnit(R.a, 'cm');
        ex.mistakes = [U.mkAny(p.w + p.h, 'add-legs', 'Ai adunat lățimea cu înălțimea. Diagonala este ipotenuza triunghiului dreptunghic format.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.'), U.mkAny(Math.sqrt(p.w * p.w - p.h * p.h), 'subtract', 'Ipotenuza se află prin **adunarea** pătratelor.')];
        ex.hints = ['Diagonala împarte dreptunghiul în două triunghiuri dreptunghice. Ea este ipotenuza.', T('d^2 = w^2 + h^2') + '.'];
        ex.steps = [T('d^2 = ' + p.w + '^2 + ' + p.h + '^2 = ' + p.w * p.w + ' + ' + p.h * p.h + ' = ' + n), T('d = ' + R.tex + '\\,\\text{cm}')];
      } else if (p.t === 'height') {
        const hh = Math.round(Math.sqrt(p.diag * p.diag - p.w * p.w));
        ex.text = 'Ecranul ' + dev + ' are diagonala ' + U.val(p.diag, 'cm') + ' și lățimea ' + U.val(p.w, 'cm') + '. Calculează **înălțimea** ecranului.';
        ex.figure = F.rect(p.w, hh, { AB: U.fl(p.w, 'cm'), BC: '?', AC: U.fl(p.diag, 'cm') });
        ex.answer = { kind: 'int', value: hh, unit: cm('cm') };
        ex.mistakes = [mk.int(p.diag - p.w, 'diff-lengths', 'Ai scăzut lungimile. Se scad pătratele.'), U.mkAny(Math.sqrt(p.diag * p.diag + p.w * p.w), 'add-for-leg', 'Diagonala este ipotenuza: pentru o latură se **scade**.'), mk.int(hh * hh, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        ex.hints = ['Diagonala este ipotenuza, lățimea este o catetă.', T('h^2 = d^2 - w^2') + '.'];
        ex.steps = [T('h^2 = ' + p.diag + '^2 - ' + p.w + '^2 = ' + p.diag * p.diag + ' - ' + p.w * p.w + ' = ' + hh * hh), T('h = ' + hh + '\\,\\text{cm}')];
      } else {
        const dcm = Math.sqrt(p.w * p.w + p.h * p.h);
        const inch = dcm / 2.54;
        ex.text = 'Ecranul ' + dev + ' are lățimea ' + U.val(p.w, 'cm') + ' și înălțimea ' + U.val(p.h, 'cm') + '. Diagonala ecranului se exprimă în **inci** (' + T('1\\,\\text{inci} = 2{,}54\\,\\text{cm}') + '). Calculează diagonala în inci, rotunjită la o zecimală.';
        ex.figure = F.rect(p.w, p.h, { AB: U.fl(p.w, 'cm'), BC: U.fl(p.h, 'cm'), AC: '?' });
        ex.answer = { kind: 'dec', dec: 1, value: inch, unit: M.unit('inci') };
        ex.mistakes = [U.mkAny(dcm, 'no-conversion', 'Aceasta este diagonala în **centimetri**. Împarte la ' + T('2{,}54') + ' ca să obții inci.'), U.mkAny((p.w + p.h) / 2.54, 'add-legs', 'Ai adunat lățimea cu înălțimea. Diagonala se află cu Pitagora, apoi se convertește.'), U.mkAny(dcm * 2.54, 'wrong-direction', 'Ai înmulțit cu ' + T('2{,}54') + '. Din cm în inci se **împarte** la ' + T('2{,}54') + '.')];
        ex.hints = ['Întâi află diagonala în cm, cu Pitagora.', 'Apoi împarte la ' + T('2{,}54') + ' (1 inci are ' + T('2{,}54') + ' cm).'];
        ex.steps = [T('d^2 = ' + p.w + '^2 + ' + p.h + '^2 = ' + (p.w * p.w + p.h * p.h) + ' \\Rightarrow d \\approx ' + U.n(dcm, 2) + '\\,\\text{cm}'), T('\\frac{' + U.n(dcm, 2) + '}{2{,}54} \\approx ' + U.n(inch, 1) + '\\,\\text{inci}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'diag' || p.t === 'diagdec') return Math.abs(v * v - (p.w * p.w + p.h * p.h)) < 1e-6;
      if (p.t === 'height') return Math.abs(v * v + p.w * p.w - p.diag * p.diag) < 1e-6;
      return Math.abs(v * 2.54 - Math.sqrt(p.w * p.w + p.h * p.h)) < 1e-6;
    },
  });

  /* ================= Aplicații: traseu ================= */
  const PLACES = ['un teren de fotbal', 'un parc dreptunghiular', 'curtea unei școli', 'o piață dreptunghiulară', 'un teren de sport'];
  D({
    id: 'app-path', skill: 'p.app.path', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) U.triples(130, 20).forEach(function (t, i) { out.push({ a: t[1], b: t[0], pl: i % 5, who: i % 8 }); out.push({ a: t[0], b: t[1], pl: (i + 2) % 5, who: (i + 3) % 8 }); });
      else if (level === 2) { for (let a = 30; a <= 120; a += 5) for (let b = 20; b < a; b += 5) { const n = a * a + b * b; if (M.isSquare(n) || !U.safeRound(a + b - Math.sqrt(n), 1)) continue; out.push({ a: a, b: b, pl: (a + b) % 5, who: (a * b) % 8 }); } }
      else { for (let a = 90; a <= 120; a++) for (let b = 45; b <= 90; b += 1) { const n = a * a + b * b; if (M.isSquare(n) || !U.safeRound(a + b - Math.sqrt(n), 1) || (a + b) % 4) continue; out.push({ a: a, b: b, pl: (a + b) % 5, who: (a * 3 + b) % 8 }); } }
      return out;
    },
    build: function (p, level) {
      const n = p.a * p.a + p.b * p.b;
      const c = Math.sqrt(n);
      const save = p.a + p.b - c;
      const kind = level === 1 ? 'int' : 'dec';
      const who = U.PEOPLE[p.who];
      const ex = {};
      ex.text = PLACES[p.pl].charAt(0).toUpperCase() + PLACES[p.pl].slice(1) + ' are lungimea ' + U.val(p.a, 'm') + ' și lățimea ' + U.val(p.b, 'm') + '. ' + who + ' trebuie să ajungă dintr-un colț în colțul opus. Poate merge pe lângă margini sau **pe diagonală**. Cu câți metri este mai scurt drumul pe diagonală?' + tail(kind);
      ex.figure = F.field(p.a, p.b, { AB: U.fl(p.a, 'm'), BC: U.fl(p.b, 'm'), AC: '?' });
      ex.answer = kind === 'int' ? { kind: 'int', value: save, unit: cm('m') } : { kind: 'dec', dec: 1, value: save, unit: cm('m') };
      ex.mistakes = [U.mkAny(c, 'diag-only', 'Aceasta este lungimea **diagonalei**. Se cere **diferența** dintre drumul pe margini și cel pe diagonală.'), U.mkAny(p.a + p.b, 'edges-only', 'Aceasta este lungimea drumului pe margini. Se cere cu cât este mai scurt drumul pe diagonală.'), U.mkAny(p.a + p.b - (p.a + p.b - c) * 2, 'double', 'Verifică: diferența este ' + T('(a + b) - d') + ', o singură dată.'), U.mkAny(Math.abs(p.a - p.b), 'diff-sides', 'Diferența laturilor nu are legătură cu drumul pe diagonală.')];
      ex.hints = ['Drumul pe margini: ' + T('a + b') + '. Drumul pe diagonală: ipotenuza triunghiului dreptunghic cu catetele ' + T('a') + ' și ' + T('b') + '.', 'Scade: ' + T('(a + b) - d') + '.'];
      ex.steps = [T('d^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + n + ' \\Rightarrow d ' + (kind === 'int' ? '= ' + c : '\\approx ' + U.n(c, 1)) + '\\,\\text{m}'), T('(a + b) - d = ' + (p.a + p.b) + ' - ' + (kind === 'int' ? c : U.n(c, 1)) + ' ' + (kind === 'int' ? '= ' + save : '\\approx ' + U.n(save, 1)) + '\\,\\text{m}')];
      return ex;
    },
    verify: function (p, ex) { const c = Math.sqrt(p.a * p.a + p.b * p.b); return Math.abs(ex.answer.value - (p.a + p.b - c)) < 0.051 || Math.abs(ex.answer.value - (p.a + p.b - c)) < 1e-6; },
  });

  /* ================= Probleme în doi pași ================= */
  const chainSet = (function () {
    let cache = null;
    return function () {
      if (cache) return cache;
      cache = [];
      const tr = U.triples(130, 5);
      tr.forEach(function (t1) {
        tr.forEach(function (t2) {
          [[t2[0], t2[1]], [t2[1], t2[0]]].forEach(function (pr) { if (pr[0] === t1[2] && t2[2] <= 130) cache.push({ a: t1[0], b: t1[1], c1: t1[2], d: pr[1], e: t2[2] }); });
        });
      });
      return cache;
    };
  })();
  D({
    id: 'app-multi', skill: 'p.app.multi', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const ch = chainSet();
      if (level === 1) { ch.filter(function (x) { return x.c1 <= 25; }).forEach(function (x, i) { out.push({ t: 'chain', a: x.a, b: x.b, d: x.d, c1: x.c1, e: x.e, u: i % 3 }); out.push({ t: 'chain', a: x.b, b: x.a, d: x.d, c1: x.c1, e: x.e, u: (i + 1) % 3 }); }); U.triples(50, 5).forEach(function (t, i) { out.push({ t: 'perimrect', a: t[0], b: t[1], c: t[2], u: i % 3 }); out.push({ t: 'perimrect', a: t[1], b: t[0], c: t[2], u: (i + 1) % 3 }); }); }
      else if (level === 2) { ch.forEach(function (x, i) { out.push({ t: 'chainP', a: x.a, b: x.b, d: x.d, c1: x.c1, e: x.e, u: i % 3 }); }); for (let a = 3; a <= 14; a++) for (let b = a + 1; b <= 15; b++) { const n = a * a + b * b; if (M.isSquare(n)) continue; out.push({ t: 'perimrectrad', a: a, b: b, c: 0, u: (a + b) % 3 }); } }
      else ch.filter(function (x) { return x.a * x.b / 2 + x.c1 * x.d / 2 <= 2500; }).forEach(function (x, i) { out.push({ t: 'chainA', a: x.a, b: x.b, d: x.d, c1: x.c1, e: x.e, u: i % 3 }); if (i % 2) out.push({ t: 'chainP', a: x.b, b: x.a, d: x.d, c1: x.c1, e: x.e, u: (i + 1) % 3 }); });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      if (p.t === 'perimrect' || p.t === 'perimrectrad') {
        const half = p.a + p.b;
        const n = p.a * p.a + p.b * p.b;
        const kind = p.t === 'perimrect' ? 'int' : 'rad';
        const R = root(kind, n);
        ex.text = 'Perimetrul unui dreptunghi este ' + U.val(2 * half, u) + ', iar una dintre laturi are ' + U.val(p.a, u) + '. Calculează lungimea **diagonalei** dreptunghiului.' + tail(kind);
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(half, 'semi-perimeter', 'Aceasta este suma celor două laturi (semiperimetrul), nu diagonala.'), U.mkAny(Math.sqrt(p.a * p.a + half * half), 'half-as-side', 'Ai folosit semiperimetrul ' + T(half) + ' ca a doua latură. A doua latură este ' + T(half + ' - ' + p.a + ' = ' + p.b) + '.'), U.mkAny(Math.sqrt(p.a * p.a + (2 * half - p.a) * (2 * half - p.a)), 'perimeter-as-side', 'Ai scăzut din perimetru, nu din semiperimetru. Latura lipsă: ' + T('P : 2 - ' + p.a) + '.'), U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.')];
        ex.hints = ['Semiperimetrul este suma a două laturi alăturate: ' + T('P : 2 = ' + half) + '. Află a doua latură.', 'Apoi diagonala este ipotenuza triunghiului cu cele două laturi drept catete.'];
        ex.steps = [T('P : 2 = ' + half + ' \\Rightarrow b = ' + half + ' - ' + p.a + ' = ' + p.b), T('d^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + n), T('d = ' + R.tex + '\\,\\text{' + u + '}')];
        return ex;
      }
      const L = { AB: U.fl(p.a, u), BC: U.fl(p.b, u), CD: U.fl(p.d, u), AD: '?', AC: '' };
      ex.figure = F.chain(p.a, p.b, p.d, L);
      const intro = 'În patrulaterul ' + T('ABCD') + ' se știe că ' + T('\\angle B = 90°') + ', ' + T('\\angle ACD = 90°') + ', ' + U.len('AB', p.a, u) + ', ' + U.len('BC', p.b, u) + ' și ' + U.len('CD', p.d, u) + '. ';
      const steps1 = [T('AC^2 = AB^2 + BC^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + p.c1 * p.c1 + ' \\Rightarrow AC = ' + p.c1), T('AD^2 = AC^2 + CD^2 = ' + p.c1 + '^2 + ' + p.d + '^2 = ' + p.e * p.e + ' \\Rightarrow AD = ' + p.e)];
      if (p.t === 'chain') {
        ex.text = intro + 'Calculează lungimea laturii ' + T('AD') + '.';
        ex.answer = { kind: 'int', value: p.e, unit: cm(u) };
        ex.mistakes = [mk.int(p.c1 + p.d, 'forgot-first', 'Ai adunat ' + T('AC') + ' cu ' + T('CD') + '. ' + T('AD') + ' este ipotenuza triunghiului ' + T('ACD') + ': se adună pătratele.'), U.mkAny(Math.sqrt(p.d * p.d + p.b * p.b), 'wrong-triangle', 'Ai folosit ' + T('CD') + ' și ' + T('BC') + ' ca și cum ar fi catetele aceluiași triunghi. Mai întâi trebuie aflată diagonala ' + T('AC') + '.'), mk.int(p.a + p.b + p.d, 'sum-all', 'Ai adunat toate lungimile date.'), mk.int(p.c1, 'stop-early', 'Ai aflat doar ' + T('AC') + '. Se cere ' + T('AD') + ', ipotenuza triunghiului ' + T('ACD') + '.')];
        ex.hints = ['Împarte figura în două triunghiuri dreptunghice: ' + T('ABC') + ' (dreptunghic în ' + T('B') + ') și ' + T('ACD') + ' (dreptunghic în ' + T('C') + ').', 'Află mai întâi ' + T('AC') + ', apoi ' + T('AD') + '.'];
        ex.steps = steps1;
      } else if (p.t === 'chainP') {
        const P = p.a + p.b + p.d + p.e;
        ex.text = intro + 'Calculează **perimetrul** patrulaterului.';
        ex.answer = { kind: 'int', value: P, unit: cm(u) };
        ex.mistakes = [mk.int(p.a + p.b + p.d, 'missing-side', 'Lipsește latura ' + T('AD') + '. Perimetrul are patru laturi.'), mk.int(P - p.b + p.c1, 'diag-as-side', 'Ai adăugat diagonala ' + T('AC') + ', care nu este latură a patrulaterului.'), mk.int(P + p.c1, 'extra-diag', 'Ai inclus și diagonala ' + T('AC') + ', care nu face parte din perimetru.'), mk.int(P - p.d, 'near', null)];
        ex.hints = ['Perimetrul este ' + T('AB + BC + CD + DA') + '. Îți lipsește ' + T('DA') + '.', 'Află ' + T('AC') + ' (în ' + T('ABC') + '), apoi ' + T('AD') + ' (în ' + T('ACD') + ').'];
        ex.steps = steps1.concat([T('P = ' + p.a + ' + ' + p.b + ' + ' + p.d + ' + ' + p.e + ' = ' + P + '\\,\\text{' + u + '}')]);
      } else {
        const A2 = p.a * p.b / 2 + p.c1 * p.d / 2;
        ex.text = intro + 'Calculează **aria** patrulaterului.';
        ex.answer = { kind: 'int', value: A2, unit: cm2(u) };
        ex.mistakes = [mk.int(p.a * p.b + p.c1 * p.d, 'forgot-half', 'Aria unui triunghi dreptunghic este jumătate din produsul catetelor: ai uitat împărțirea la 2.'), mk.int(p.a * p.b / 2, 'one-triangle', 'Ai calculat doar aria triunghiului ' + T('ABC') + '. Mai adaugă aria triunghiului ' + T('ACD') + '.'), mk.int((p.a + p.d) * p.b, 'rect', 'Patrulaterul nu este dreptunghi. Împarte-l în două triunghiuri dreptunghice.'), mk.int(A2 + p.c1, 'near', null)];
        ex.hints = ['Aria totală = aria triunghiului ' + T('ABC') + ' + aria triunghiului ' + T('ACD') + '.', 'Pentru ' + T('ACD') + ' ai nevoie de ' + T('AC') + ' (catetă), pe care o afli din ' + T('ABC') + '.'];
        ex.steps = [steps1[0], T('A_{ABC} = \\frac{AB \\cdot BC}{2} = \\frac{' + p.a + ' \\cdot ' + p.b + '}{2} = ' + p.a * p.b / 2), T('A_{ACD} = \\frac{AC \\cdot CD}{2} = \\frac{' + p.c1 + ' \\cdot ' + p.d + '}{2} = ' + p.c1 * p.d / 2), T('A = ' + p.a * p.b / 2 + ' + ' + p.c1 * p.d / 2 + ' = ' + A2 + '\\,\\text{' + u + '}^{2}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'perimrect') return U.isRight(p.a, p.b, p.c) && Math.abs(v - p.c) < 1e-9;
      if (p.t === 'perimrectrad') return Math.abs(v * v - (p.a * p.a + p.b * p.b)) < 1e-6;
      if (!U.isRight(p.a, p.b, p.c1) || !U.isRight(p.c1, p.d, p.e)) return false;
      if (p.t === 'chain') return v === p.e;
      if (p.t === 'chainP') return v === p.a + p.b + p.d + p.e;
      return v === p.a * p.b / 2 + p.c1 * p.d / 2;
    },
  });

  /* ================= Relații metrice în triunghiul dreptunghic ================= */
  const prodSquares = function (maxV) { const out = []; for (let p = 1; p <= maxV; p++) for (let q = p + 1; q <= maxV; q++) if (M.isSquare(p * q)) out.push([p, q, Math.round(Math.sqrt(p * q))]); return out; };

  D({
    id: 'met-height', skill: 'p.met.height', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) prodSquares(36).forEach(function (t, i) { out.push({ t: 'h', p: t[0], q: t[1], h: t[2], u: i % 3 }); out.push({ t: 'h', p: t[1], q: t[0], h: t[2], u: (i + 1) % 3 }); });
      else if (level === 2) prodSquares(60).forEach(function (t, i) { out.push({ t: 'q', p: t[0], q: t[1], h: t[2], u: i % 3 }); out.push({ t: 'p', p: t[0], q: t[1], h: t[2], u: (i + 1) % 3 }); out.push({ t: 'hbig', p: t[0], q: t[1], h: t[2], u: (i + 2) % 3 }); });
      else for (let p = 1; p <= 12; p++) for (let q = 2; q <= 20; q++) { if (p === q || M.isSquare(p * q)) continue; out.push({ t: 'hrad', p: p, q: q, u: (p + q) % 3 }); }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const head = 'În triunghiul ' + T('ABC') + ' dreptunghic în ' + T('A') + ', ' + T('AD \\perp BC') + ' cu ' + T('D \\in BC') + '. ';
      const thm = 'Teorema înălțimii: ' + T('AD^2 = BD \\cdot DC') + '.';
      if (p.t === 'h' || p.t === 'hbig') {
        const mul = p.t === 'hbig' ? 3 : 1;
        const P = p.p * (p.t === 'hbig' ? 1 : 1), Q = p.q;
        ex.text = head + 'Dacă ' + U.len('BD', P, u) + ' și ' + U.len('DC', Q, u) + ', calculează înălțimea ' + T('AD') + '.';
        ex.figure = F.hgt(P, Q, { BD: U.fl(P, u), DC: U.fl(Q, u), AD: '?', AB: '', AC: '' });
        ex.answer = { kind: 'int', value: p.h, unit: cm(u) };
        ex.mistakes = [U.mkAny((P + Q) / 2, 'mean', 'Ai făcut media celor două proiecții. Teorema înălțimii spune ' + T('AD^2 = BD \\cdot DC') + ': se **înmulțesc**, apoi rădăcina.'), mk.int(P * Q, 'forgot-root', 'Ai calculat ' + T('AD^2') + ' și ai uitat rădăcina pătrată.'), U.mkAny(Math.sqrt(P + Q), 'sum-under-root', 'Sub radical se **înmulțesc** proiecțiile (nu se adună).'), mk.int(P + Q, 'hypotenuse', 'Ai dat ipotenuza ' + T('BC = BD + DC') + '. Se cere înălțimea ' + T('AD') + '.')];
        ex.hints = [thm, 'Înmulțește ' + T('BD') + ' cu ' + T('DC') + ', apoi extrage rădăcina pătrată.'];
        ex.steps = [T('AD^2 = BD \\cdot DC = ' + P + ' \\cdot ' + Q + ' = ' + P * Q), T('AD = \\sqrt{' + P * Q + '} = ' + p.h + '\\,\\text{' + u + '}')];
      } else if (p.t === 'q' || p.t === 'p') {
        const known = p.t === 'q' ? p.p : p.q, ask = p.t === 'q' ? p.q : p.p;
        const nmK = p.t === 'q' ? 'BD' : 'DC', nmA = p.t === 'q' ? 'DC' : 'BD';
        ex.text = head + 'Dacă ' + U.len('AD', p.h, u) + ' și ' + U.len(nmK, known, u) + ', calculează lungimea segmentului ' + T(nmA) + '.';
        ex.figure = F.hgt(p.p, p.q, { BD: p.t === 'q' ? U.fl(known, u) : '?', DC: p.t === 'q' ? '?' : U.fl(known, u), AD: U.fl(p.h, u), AB: '', AC: '' });
        ex.answer = { kind: 'int', value: ask, unit: cm(u) };
        ex.mistakes = [mk.int(p.h * p.h, 'forgot-divide', 'Ai calculat ' + T('AD^2') + '. Din ' + T('AD^2 = BD \\cdot DC') + ' rezultă ' + T(nmA + ' = AD^2 : ' + nmK) + '.'), mk.int(p.h - known > 0 ? p.h - known : p.h + known, 'diff-lengths', 'Relația este cu **produsul**, nu cu diferența.'), mk.int(p.h * known, 'multiplied', 'Ai înmulțit în loc să împarți: ' + T(nmA + ' = AD^2 : ' + nmK) + '.'), U.mkAny(Math.sqrt(p.h * known), 'root', 'Nu se extrage rădăcina aici: ' + T('AD^2') + ' este deja pătratul înălțimii.')];
        ex.hints = [thm, 'Rezultă ' + T(nmA + ' = AD^2 : ' + nmK) + '.'];
        ex.steps = [T('AD^2 = BD \\cdot DC \\Rightarrow ' + p.h + '^2 = ' + known + ' \\cdot ' + nmA), T(nmA + ' = ' + p.h * p.h + ' : ' + known + ' = ' + ask + '\\,\\text{' + u + '}')];
      } else {
        const n = p.p * p.q;
        const R = root('rad', n);
        ex.text = head + 'Dacă ' + U.len('BD', p.p, u) + ' și ' + U.len('DC', p.q, u) + ', calculează înălțimea ' + T('AD') + '. Scrie rezultatul sub formă de radical simplificat.';
        ex.figure = F.hgt(p.p, p.q, { BD: U.fl(p.p, u), DC: U.fl(p.q, u), AD: '?', AB: '', AC: '' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată: ' + T('AD^2 = ' + n) + '.'), U.mkAny((p.p + p.q) / 2, 'mean', 'Teorema înălțimii folosește produsul, nu media.'), U.mkAny(Math.sqrt(p.p + p.q), 'sum-under-root', 'Se înmulțesc proiecțiile, nu se adună.')];
        if (radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
        ex.hints = [thm, 'Dacă rezultatul nu e pătrat perfect, scrie-l sub radical și simplifică-l.'];
        ex.steps = [T('AD^2 = BD \\cdot DC = ' + p.p + ' \\cdot ' + p.q + ' = ' + n), T('AD = ' + R.tex + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'h' || p.t === 'hbig') return v * v === p.p * p.q;
      if (p.t === 'q') return v * p.p === p.h * p.h;
      if (p.t === 'p') return v * p.q === p.h * p.h;
      return Math.abs(v * v - p.p * p.q) < 1e-6;
    },
  });

  D({
    id: 'met-leg', skill: 'p.met.leg', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      /* AB^2 = BD · BC, cu BD < BC; produsul pătrat perfect */
      const pr = [];
      for (let bd = 1; bd <= 30; bd++) for (let bc = bd + 1; bc <= 60; bc++) if (M.isSquare(bd * bc)) pr.push([bd, bc, Math.round(Math.sqrt(bd * bc))]);
      if (level === 1) pr.filter(function (x) { return x[1] <= 36; }).forEach(function (t, i) { out.push({ t: 'leg', bd: t[0], bc: t[1], ab: t[2], u: i % 3 }); });
      else if (level === 2) pr.forEach(function (t, i) { out.push({ t: 'proj', bd: t[0], bc: t[1], ab: t[2], u: i % 3 }); if (i % 2) out.push({ t: 'both', bd: t[0], dc: t[1] - t[0], bc: t[1], ab: t[2], u: (i + 1) % 3 }); });
      else { for (let bd = 2; bd <= 14; bd++) for (let bc = bd + 1; bc <= 24; bc++) { if (M.isSquare(bd * bc)) continue; out.push({ t: 'legrad', bd: bd, bc: bc, u: (bd + bc) % 3 }); } }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const head = 'În triunghiul ' + T('ABC') + ' dreptunghic în ' + T('A') + ', ' + T('AD \\perp BC') + ' cu ' + T('D \\in BC') + '. ';
      const thm = 'Teorema catetei: ' + T('AB^2 = BD \\cdot BC') + '.';
      if (p.t === 'leg') {
        ex.text = head + 'Dacă ' + U.len('BD', p.bd, u) + ' și ' + U.len('BC', p.bc, u) + ', calculează lungimea catetei ' + T('AB') + '.';
        ex.figure = F.hgt(p.bd, p.bc - p.bd, { BD: U.fl(p.bd, u), DC: '', AD: '', AB: '?', AC: '', BC: '' });
        ex.answer = { kind: 'int', value: p.ab, unit: cm(u) };
        ex.mistakes = [mk.int(p.bd * p.bc, 'forgot-root', 'Ai calculat ' + T('AB^2') + ' și ai uitat rădăcina pătrată.'), U.mkAny((p.bd + p.bc) / 2, 'mean', 'Teorema catetei folosește produsul ' + T('BD \\cdot BC') + ', nu media.'), U.mkAny(Math.sqrt(p.bd + p.bc), 'sum-under-root', 'Sub radical se **înmulțesc** ' + T('BD') + ' și ' + T('BC') + '.'), mk.int(p.bc - p.bd, 'diff-lengths', 'Aceasta este ' + T('DC') + '. Se cere ' + T('AB') + '.')];
        ex.hints = [thm + ' Proiecția catetei ' + T('AB') + ' pe ipotenuză este ' + T('BD') + '.', 'Înmulțește ' + T('BD') + ' cu ' + T('BC') + ' și extrage rădăcina.'];
        ex.steps = [T('AB^2 = BD \\cdot BC = ' + p.bd + ' \\cdot ' + p.bc + ' = ' + p.bd * p.bc), T('AB = \\sqrt{' + p.bd * p.bc + '} = ' + p.ab + '\\,\\text{' + u + '}')];
      } else if (p.t === 'proj') {
        ex.text = head + 'Dacă ' + U.len('AB', p.ab, u) + ' și ' + U.len('BC', p.bc, u) + ', calculează lungimea proiecției ' + T('BD') + ' a catetei ' + T('AB') + ' pe ipotenuză.';
        ex.figure = F.hgt(p.bd, p.bc - p.bd, { BD: '?', DC: '', AD: '', AB: U.fl(p.ab, u), AC: '', BC: '' });
        ex.answer = { kind: 'int', value: p.bd, unit: cm(u) };
        ex.mistakes = [mk.int(p.ab * p.ab, 'forgot-divide', 'Ai calculat ' + T('AB^2') + '. Din ' + T('AB^2 = BD \\cdot BC') + ' rezultă ' + T('BD = AB^2 : BC') + '.'), mk.int(p.ab * p.bc, 'multiplied', 'Ai înmulțit; trebuie să **împarți**.'), mk.int(p.bc - p.ab, 'diff-lengths', 'Relația nu este cu diferența lungimilor.'), U.mkAny(Math.sqrt(p.ab * p.ab / p.bc * 1) || 1, 'root', 'Aici nu se extrage rădăcina.')];
        ex.hints = [thm, T('BD = AB^2 : BC') + '.'];
        ex.steps = [T('AB^2 = BD \\cdot BC \\Rightarrow ' + p.ab + '^2 = BD \\cdot ' + p.bc), T('BD = ' + p.ab * p.ab + ' : ' + p.bc + ' = ' + p.bd + '\\,\\text{' + u + '}')];
      } else if (p.t === 'both') {
        ex.text = head + 'Dacă ' + U.len('BD', p.bd, u) + ' și ' + U.len('DC', p.dc, u) + ', calculează lungimea catetei ' + T('AB') + '.';
        ex.figure = F.hgt(p.bd, p.dc, { BD: U.fl(p.bd, u), DC: U.fl(p.dc, u), AD: '', AB: '?', AC: '', BC: '' });
        ex.answer = { kind: 'int', value: p.ab, unit: cm(u) };
        ex.mistakes = [U.mkAny(Math.sqrt(p.bd * p.dc), 'height-theorem', 'Aceasta este înălțimea ' + T('AD') + ' (teorema înălțimii). Pentru cateta ' + T('AB') + ' folosești ' + T('BD \\cdot BC') + ', cu ' + T('BC = BD + DC') + '.'), mk.int(p.bd * p.bd + p.bd * p.dc === 0 ? 1 : p.bd + p.dc, 'hypotenuse', 'Aceasta este ipotenuza ' + T('BC') + '. Se cere cateta ' + T('AB') + '.'), mk.int(p.bd * p.bc, 'forgot-root', 'Ai uitat rădăcina pătrată.'), U.mkAny(Math.sqrt(p.dc * p.bc), 'other-leg', 'Aceasta este cealaltă catetă, ' + T('AC') + ' (' + T('AC^2 = DC \\cdot BC') + ').')];
        ex.hints = ['Mai întâi află ipotenuza: ' + T('BC = BD + DC') + '.', thm];
        ex.steps = [T('BC = BD + DC = ' + p.bd + ' + ' + p.dc + ' = ' + p.bc), T('AB^2 = BD \\cdot BC = ' + p.bd + ' \\cdot ' + p.bc + ' = ' + p.bd * p.bc), T('AB = \\sqrt{' + p.bd * p.bc + '} = ' + p.ab + '\\,\\text{' + u + '}')];
      } else {
        const n = p.bd * p.bc;
        const R = root('rad', n);
        ex.text = head + 'Dacă ' + U.len('BD', p.bd, u) + ' și ' + U.len('BC', p.bc, u) + ', calculează cateta ' + T('AB') + '. Scrie rezultatul sub formă de radical simplificat.';
        ex.figure = F.hgt(p.bd, p.bc - p.bd, { BD: U.fl(p.bd, u), DC: '', AD: '', AB: '?', AC: '', BC: '' });
        ex.answer = withUnit(R.a, u);
        ex.mistakes = [U.mkAny(n, 'forgot-root', 'Ai uitat rădăcina pătrată.'), U.mkAny((p.bd + p.bc) / 2, 'mean', 'Teorema catetei folosește produsul.'), U.mkAny(Math.sqrt(p.bd + p.bc), 'sum-under-root', 'Se înmulțesc, nu se adună.')];
        if (radNotSimple(n)) ex.mistakes.push(mk.rad(n, 'not-simplified', 'Valoarea e corectă, dar radicalul se poate simplifica.', true));
        ex.hints = [thm, 'Dacă ' + T('BD \\cdot BC') + ' nu e pătrat perfect, scrie ' + T('AB') + ' ca radical simplificat.'];
        ex.steps = [T('AB^2 = BD \\cdot BC = ' + p.bd + ' \\cdot ' + p.bc + ' = ' + n), T('AB = ' + R.tex + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (p.t === 'leg' || p.t === 'both') return v * v === p.bd * p.bc;
      if (p.t === 'proj') return v * p.bc === p.ab * p.ab;
      return Math.abs(v * v - p.bd * p.bc) < 1e-6;
    },
  });

  D({
    id: 'met-hside', skill: 'p.met.hside', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      const mkp = function (t, i, kind) { return { t: kind, a: t[0], b: t[1], c: t[2], u: i % 3 }; };
      if (level === 1) U.triples(30, 5).forEach(function (t, i) { if (U.safeRound(t[0] * t[1] / t[2], 1)) out.push(mkp(t, i, 'h')); });
      else if (level === 2) U.triples(85, 5).forEach(function (t, i) { if (U.safeRound(t[0] * t[1] / t[2], 1)) { out.push(mkp(t, i, 'h')); out.push(mkp(t, i + 1, 'proj')); } });
      else U.triples(85, 10).forEach(function (t, i) { if (U.safeRound(t[0] * t[1] / t[2], 1)) { out.push({ t: 'hLegHyp', a: t[0], b: t[1], c: t[2], u: i % 3 }); out.push({ t: 'hLegHyp', a: t[1], b: t[0], c: t[2], u: (i + 1) % 3 }); } });
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const head = 'Triunghiul ' + T('ABC') + ' este dreptunghic în ' + T('A') + ', iar ' + T('AD \\perp BC') + ' cu ' + T('D \\in BC') + '. ';
      const area = 'Aria se poate scrie în două moduri: ' + T('\\frac{AB \\cdot AC}{2} = \\frac{BC \\cdot AD}{2}') + '.';
      if (p.t === 'h') {
        const h = p.a * p.b / p.c;
        ex.text = head + 'Dacă ' + U.len('AB', p.a, u) + ' și ' + U.len('AC', p.b, u) + ', calculează înălțimea ' + T('AD') + '. Rotunjește rezultatul la o zecimală.';
        ex.figure = F.hgt(p.a * p.a / p.c, p.b * p.b / p.c, { AB: U.fl(p.a, u), AC: U.fl(p.b, u), AD: '?', BD: '', DC: '' });
        ex.answer = { kind: 'dec', dec: 1, value: h, unit: cm(u) };
        ex.mistakes = [U.mkAny(p.c, 'hypotenuse', 'Aceasta este ipotenuza ' + T('BC') + '. Înălțimea ' + T('AD') + ' este mai mică.'), U.mkAny(p.a * p.b / 2, 'area', 'Aceasta este aria triunghiului. Din ' + T('\\frac{AB \\cdot AC}{2} = \\frac{BC \\cdot AD}{2}') + ' rezultă ' + T('AD = \\frac{AB \\cdot AC}{BC}') + '.'), U.mkAny(p.a * p.b, 'product', 'Ai calculat produsul catetelor. Împarte-l la ipotenuză.'), U.mkAny(Math.sqrt(p.a * p.b), 'sqrt-product', 'Radicalul din produs ar fi pentru proiecții (teorema înălțimii). Aici se folosesc ariile.')];
        ex.hints = ['Ai nevoie întâi de ipotenuza ' + T('BC') + ' (Pitagora).', area];
        ex.steps = [T('BC^2 = ' + p.a + '^2 + ' + p.b + '^2 = ' + p.c * p.c + ' \\Rightarrow BC = ' + p.c), area, T('AD = \\frac{AB \\cdot AC}{BC} = \\frac{' + p.a + ' \\cdot ' + p.b + '}{' + p.c + '} \\approx ' + U.n(h, 1) + '\\,\\text{' + u + '}')];
      } else if (p.t === 'proj') {
        const bd = p.a * p.a / p.c;
        ex.text = head + 'Dacă ' + U.len('AB', p.a, u) + ' și ' + U.len('AC', p.b, u) + ', calculează lungimea proiecției ' + T('BD') + '. Rotunjește rezultatul la o zecimală.';
        ex.figure = F.hgt(bd, p.b * p.b / p.c, { AB: U.fl(p.a, u), AC: U.fl(p.b, u), BD: '?', AD: '', DC: '' });
        ex.answer = { kind: 'dec', dec: 1, value: bd, unit: cm(u) };
        ex.mistakes = [U.mkAny(p.a * p.b / p.c, 'height', 'Aceasta este înălțimea ' + T('AD') + ', nu proiecția ' + T('BD') + '.'), U.mkAny(p.a * p.a, 'forgot-divide', 'Ai calculat ' + T('AB^2') + '; din ' + T('AB^2 = BD \\cdot BC') + ' trebuie să împarți la ' + T('BC') + '.'), U.mkAny(p.b * p.b / p.c, 'other-projection', 'Aceasta este ' + T('DC') + ' (proiecția lui ' + T('AC') + '), nu ' + T('BD') + '.'), U.mkAny(p.c - p.a, 'diff-lengths', 'Nu se scad lungimile.')];
        ex.hints = ['Află ipotenuza ' + T('BC') + ' cu Pitagora.', 'Teorema catetei: ' + T('AB^2 = BD \\cdot BC') + ', deci ' + T('BD = AB^2 : BC') + '.'];
        ex.steps = [T('BC = \\sqrt{' + p.a + '^2 + ' + p.b + '^2} = ' + p.c), T('BD = \\frac{AB^2}{BC} = \\frac{' + p.a * p.a + '}{' + p.c + '} \\approx ' + U.n(bd, 1) + '\\,\\text{' + u + '}')];
      } else {
        const h = p.a * p.b / p.c;
        ex.text = head + 'Dacă ' + U.len('BC', p.c, u) + ' și ' + U.len('AB', p.a, u) + ', calculează înălțimea ' + T('AD') + '. Rotunjește rezultatul la o zecimală.';
        ex.figure = F.hgt(p.a * p.a / p.c, p.b * p.b / p.c, { BC: '', AB: U.fl(p.a, u), AD: '?', BD: '', DC: '', AC: '' });
        ex.answer = { kind: 'dec', dec: 1, value: h, unit: cm(u) };
        ex.mistakes = [U.mkAny(p.b, 'other-leg', 'Aceasta este cateta ' + T('AC') + ', nu înălțimea ' + T('AD') + '.'), U.mkAny(p.a * p.c / p.b, 'wrong-formula', 'Verifică formula: ' + T('AD = \\frac{AB \\cdot AC}{BC}') + '.'), U.mkAny(p.a * p.b, 'product', 'Ai uitat împărțirea la ipotenuză.'), U.mkAny(p.a * p.c / 2, 'area-guess', 'Aceasta nu este nici aria, nici înălțimea.')];
        ex.hints = ['Mai întâi află cateta ' + T('AC') + ' cu Pitagora: ' + T('AC^2 = BC^2 - AB^2') + '.', area];
        ex.steps = [T('AC^2 = BC^2 - AB^2 = ' + p.c + '^2 - ' + p.a + '^2 = ' + p.b * p.b + ' \\Rightarrow AC = ' + p.b), area, T('AD = \\frac{' + p.a + ' \\cdot ' + p.b + '}{' + p.c + '} \\approx ' + U.n(h, 1) + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      const v = ex.answer.value;
      if (!U.isRight(p.a, p.b, p.c)) return false;
      if (p.t === 'proj') return Math.abs(v * p.c - p.a * p.a) < 1e-6;
      return Math.abs(v * p.c - p.a * p.b) < 1e-6;
    },
  });

  D({
    id: 'met-proj', skill: 'p.met.proj', levels: [1, 2, 3],
    space: function (level) {
      const out = [];
      if (level === 1) { for (let i = 0; i < 8; i++) for (const w of ['AB', 'AC']) out.push({ t: 'ident', w: w, v: i, u: i % 3 }); }
      else if (level === 2) { for (let i = 0; i < 8; i++) for (const w of ['AB', 'AC']) out.push({ t: 'which', w: w, v: i, u: i % 3 }); for (let a = 3; a <= 20; a++) for (let b = 3; b <= 20; b++) out.push({ t: 'sum', a: a, b: b, u: (a + b) % 3 }); }
      else { for (let bc = 10; bc <= 50; bc += 1) for (let x = 2; x < bc - 1; x += 3) out.push({ t: 'rest', bc: bc, x: x, u: (bc + x) % 3 }); for (let i = 0; i < 8; i++) for (const w of ['AB', 'AC', 'AD']) out.push({ t: 'which', w: w, v: i, u: i % 3 }); }
      return out;
    },
    build: function (p) {
      const u = UN[p.u];
      const ex = {};
      const head = 'În triunghiul ' + T('ABC') + ' dreptunghic în ' + T('A') + ', ' + T('AD \\perp BC') + ' cu ' + T('D \\in BC') + '. ';
      if (p.t === 'ident') {
        const w = p.w, ans = w === 'AB' ? 'BD' : 'DC';
        ex.text = head + 'Care este **proiecția** catetei ' + T(w) + ' pe ipotenuza ' + T('BC') + '?';
        ex.figure = F.hgt(3 + (p.v % 3), 4 + (p.v % 4), { BD: '', DC: '', AD: '', AB: '', AC: '' });
        ex.choices = ['BD', 'DC', 'AD', 'BC'].map(function (s) {
          const ok = s === ans;
          const why = s === 'AD' ? T('AD') + ' este înălțimea, nu o proiecție.' : s === 'BC' ? T('BC') + ' este ipotenuza chiar.' : T(s) + ' este proiecția celeilalte catete: proiecția lui ' + T(w) + ' este segmentul dintre piciorul înălțimii ' + T('D') + ' și capătul catetei, pe ipotenuză: ' + T(ans) + '.';
          return { label: T(s), ok: ok, tag: ok ? null : 'wrong-projection', why: ok ? null : why };
        });
        ex.keepOrder = true;
        ex.hints = ['Proiectezi ortogonal cateta pe dreapta ' + T('BC') + ': „cobori” perpendicular din capătul ei.', 'Cateta ' + T(w) + ' are un capăt în ' + T(w === 'AB' ? 'B' : 'C') + ' (pe ipotenuză) și celălalt în ' + T('A') + ', a cărui proiecție este ' + T('D') + '.'];
        ex.steps = [T('A') + ' se proiectează în ' + T('D') + ', iar ' + T(w === 'AB' ? 'B' : 'C') + ' rămâne pe loc.', 'Proiecția lui ' + T(w) + ' pe ' + T('BC') + ' este ' + T(ans) + '.'];
      } else if (p.t === 'which') {
        const opts = {
          AB: [{ r: 'AB^2 = BD \\cdot BC', ok: true }, { r: 'AB^2 = BD \\cdot DC', ok: false, why: T('BD \\cdot DC') + ' este ' + T('AD^2') + ' (teorema înălțimii), nu ' + T('AB^2') + '.' }, { r: 'AB^2 = DC \\cdot BC', ok: false, why: T('DC \\cdot BC') + ' este ' + T('AC^2') + ' (cealaltă catetă).' }, { r: 'AB^2 = AD \\cdot BC', ok: false, why: T('AD \\cdot BC') + ' dă dublul ariei, nu ' + T('AB^2') + '.' }],
          AC: [{ r: 'AC^2 = DC \\cdot BC', ok: true }, { r: 'AC^2 = BD \\cdot DC', ok: false, why: T('BD \\cdot DC') + ' este ' + T('AD^2') + ' (teorema înălțimii).' }, { r: 'AC^2 = BD \\cdot BC', ok: false, why: T('BD \\cdot BC') + ' este ' + T('AB^2') + ' (cealaltă catetă).' }, { r: 'AC^2 = AD \\cdot BC', ok: false, why: T('AD \\cdot BC') + ' dă dublul ariei, nu ' + T('AC^2') + '.' }],
          AD: [{ r: 'AD^2 = BD \\cdot DC', ok: true }, { r: 'AD^2 = BD \\cdot BC', ok: false, why: T('BD \\cdot BC') + ' este ' + T('AB^2') + ' (teorema catetei).' }, { r: 'AD^2 = DC \\cdot BC', ok: false, why: T('DC \\cdot BC') + ' este ' + T('AC^2') + ' (teorema catetei).' }, { r: 'AD^2 = BD + DC', ok: false, why: 'Proiecțiile se **înmulțesc**, nu se adună.' }],
        }[p.w];
        const known = p.w === 'AB' ? 'BD și BC' : p.w === 'AC' ? 'DC și BC' : 'BD și DC';
        ex.text = head + 'Cunoști ' + T(known.split(' și ')[0]) + ' și ' + T(known.split(' și ')[1]) + ' și vrei să afli ' + T(p.w) + '. Care relație se folosește?';
        ex.choices = opts.map(function (o) { return { label: T(o.r), ok: o.ok, tag: o.ok ? null : 'wrong-theorem', why: o.why }; });
        ex.hints = ['Teorema catetei: pătratul unei catete = proiecția ei pe ipotenuză × ipotenuza.', 'Teorema înălțimii: pătratul înălțimii = produsul proiecțiilor.'];
        ex.steps = [p.w === 'AD' ? 'Se folosește teorema înălțimii: ' + T('AD^2 = BD \\cdot DC') + '.' : 'Se folosește teorema catetei: ' + T(opts[0].r) + '.'];
      } else if (p.t === 'sum') {
        const bc = p.a + p.b;
        ex.text = head + 'Dacă ' + U.len('BD', p.a, u) + ' și ' + U.len('DC', p.b, u) + ', calculează lungimea ipotenuzei ' + T('BC') + '.';
        ex.figure = F.hgt(p.a, p.b, { BD: U.fl(p.a, u), DC: U.fl(p.b, u), BC: '?', AD: '' });
        ex.answer = { kind: 'int', value: bc, unit: cm(u) };
        ex.mistakes = [U.mkAny(Math.sqrt(p.a * p.b), 'height', 'Aceasta este înălțimea ' + T('AD') + '. Ipotenuza întreagă este ' + T('BD + DC') + '.'), U.mkAny(Math.sqrt(p.a * p.a + p.b * p.b), 'pythagoras-on-projections', 'Proiecțiile nu sunt catetele triunghiului. ' + T('D') + ' se află pe ' + T('BC') + ', deci ' + T('BC = BD + DC') + '.'), mk.int(p.a * p.b, 'product', 'Segmentele pe aceeași dreaptă se **adună**.')];
        ex.hints = [T('D') + ' se află pe segmentul ' + T('BC') + ', între ' + T('B') + ' și ' + T('C') + '.', 'Deci ' + T('BC = BD + DC') + '.'];
        ex.steps = [T('BC = BD + DC = ' + p.a + ' + ' + p.b + ' = ' + bc + '\\,\\text{' + u + '}')];
      } else {
        ex.text = head + 'Dacă ' + U.len('BC', p.bc, u) + ' și ' + U.len('BD', p.x, u) + ', calculează lungimea segmentului ' + T('DC') + '.';
        ex.figure = F.hgt(p.x, p.bc - p.x, { BC: U.fl(p.bc, u), BD: U.fl(p.x, u), DC: '?', AD: '' });
        ex.answer = { kind: 'int', value: p.bc - p.x, unit: cm(u) };
        ex.mistakes = [mk.int(p.bc + p.x, 'added', 'Ai adunat. ' + T('BC = BD + DC') + ', deci ' + T('DC = BC - BD') + '.'), mk.int(p.x, 'repeat', 'Ai repetit ' + T('BD') + '.'), U.mkAny(Math.sqrt(p.bc * p.bc - p.x * p.x), 'pythagoras', 'Aici nu se aplică Pitagora: ' + T('D') + ' este pe ' + T('BC') + '.')];
        ex.hints = [T('D \\in BC') + ', deci ' + T('BC = BD + DC') + '.', 'Scade: ' + T('DC = BC - BD') + '.'];
        ex.steps = [T('DC = BC - BD = ' + p.bc + ' - ' + p.x + ' = ' + (p.bc - p.x) + '\\,\\text{' + u + '}')];
      }
      return ex;
    },
    verify: function (p, ex) {
      if (p.t === 'ident') { const ok = ex.options.filter(function (o) { return o.ok; })[0]; return ok.label === T(p.w === 'AB' ? 'BD' : 'DC'); }
      if (p.t === 'which') { const ok = ex.options.filter(function (o) { return o.ok; })[0]; return ok.label === T(p.w === 'AB' ? 'AB^2 = BD \\cdot BC' : p.w === 'AC' ? 'AC^2 = DC \\cdot BC' : 'AD^2 = BD \\cdot DC'); }
      if (p.t === 'sum') return ex.answer.value === p.a + p.b;
      return ex.answer.value === p.bc - p.x;
    },
  });
})(window.M);
