/* Ajutoare comune pentru exercițiile din Unitatea 1 (Teorema lui Pitagora). */
(function (M) {
  'use strict';
  const U = (M.u1 = {});

  /* Triplete pitagoreice [a, b, c] cu a<b, c ≤ maxC (primitive și multipli) */
  const tripCache = {};
  U.triples = function (maxC, minC) {
    const key = maxC + ':' + (minC || 0);
    if (tripCache[key]) return tripCache[key];
    const out = [];
    for (let m = 2; m < 40; m++) {
      for (let n = 1; n < m; n++) {
        if ((m - n) % 2 === 0 || M.gcd(m, n) !== 1) continue;
        let a = m * m - n * n, b = 2 * m * n; const c = m * m + n * n;
        if (a > b) { const t = a; a = b; b = t; }
        for (let k = 1; c * k <= maxC; k++) if (c * k >= (minC || 0)) out.push([a * k, b * k, c * k, k]);
      }
    }
    out.sort(function (x, y) { return x[2] - y[2] || x[0] - y[0]; });
    tripCache[key] = out;
    return out;
  };

  U.SETS = [['A', 'B', 'C'], ['M', 'N', 'P'], ['D', 'E', 'F'], ['X', 'Y', 'Z'], ['K', 'L', 'R'], ['S', 'T', 'U']];
  U.UNITS = ['cm', 'm', 'dm'];
  U.PEOPLE = ['Ana', 'Mihai', 'Ioana', 'Andrei', 'Maria', 'Radu', 'Elena', 'Matei'];

  /* număr în TeX (punct zecimal; mathml.js îl afișează cu virgulă) */
  U.n = function (x, d) { return String(M.round(x, d === undefined ? 2 : d)); };
  /* „AB = 6 cm” ca matematică inline */
  U.len = function (name, val, unit, d) { return '$' + name + ' = ' + U.n(val, d) + '\\,\\text{' + unit + '}$'; };
  U.val = function (val, unit, d) { return '$' + U.n(val, d) + '\\,\\text{' + unit + '}$'; };
  U.m = function (s) { return '$' + s + '$'; };
  /* etichetă pentru figură: „6 cm” */
  U.fl = function (val, unit, d) { return U.n(val, d).replace('.', ',') + (unit ? ' ' + unit : ''); };
  U.rootLabel = function (n) { return M.radText(n); };

  /* pătratul unei zecimale cu 1 zecimală, fără erori de virgulă mobilă */
  U.sq = function (x) { return M.round(x * x, 4); };

  /* indicii frecvente */
  U.H = {
    which: 'Care latură este ipotenuza? Cea care se află în fața unghiului drept (și este cea mai lungă).',
    formula: 'Folosește teorema lui Pitagora: pătratul ipotenuzei este egal cu suma pătratelor catetelor.',
    root: 'La final extragi rădăcina pătrată: dacă $x^2 = n$, atunci $x = \\sqrt{n}$.',
  };

  /* Alege din listă „k” elemente uniform distribuite (pentru spații mari de parametri) */
  U.thin = function (arr, max) {
    if (arr.length <= max) return arr;
    const out = [];
    const step = arr.length / max;
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  };

  /* Greșeală tipică cu valoare oarecare: etichetă întreagă / radical / zecimală, aleasă automat */
  U.mkAny = function (value, tag, why, dec) {
    if (Math.abs(value - Math.round(value)) < 1e-9) return M.mk.int(Math.round(value), tag, why);
    const sq = value * value;
    if (Math.abs(sq - Math.round(sq)) < 1e-6) return M.mk.rad(Math.round(sq), tag, why);
    return M.mk.dec(value, dec === undefined ? 1 : dec, tag, why);
  };
  /* Alege în mod determinist un element din listă după un contor */
  U.nth = function (arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; };
  /* Rotunjire „sigură”: evită cazurile x,x5 la limită */
  U.safeRound = function (x, d) { const f = Math.pow(10, d) * x; return Math.abs((f - Math.floor(f)) - 0.5) > 0.03; };

  /* Verificare numerică independentă: a² + b² = c² */
  U.isRight = function (a, b, c) { return Math.abs(a * a + b * b - c * c) < 1e-6; };
})(window.M);
