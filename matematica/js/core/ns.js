/* Spațiu de nume comun. Același cod rulează în browser și în testele din Node. */
(function (root) {
  'use strict';
  const M = (root.M = root.M || {});
  M.units = M.units || [];          // înregistrate de data/*.js
  M.templates = M.templates || {};  // familii de exerciții
  M.lessons = M.lessons || {};      // lecții (date)
  M.visuals = M.visuals || {};      // vizualizări interactive
  M.messages = M.messages || {};
  M.version = '1.0.0';

  /* ---------- Generator pseudo-aleator cu sămânță (mulberry32) ---------- */
  M.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      seed: seed,
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; },
      shuffle: function (arr) {
        const x = arr.slice();
        for (let i = x.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = x[i]; x[i] = x[j]; x[j] = t;
        }
        return x;
      },
      weighted: function (items, weightFn) {
        let total = 0;
        const w = items.map(function (it) { const v = Math.max(0, weightFn(it)); total += v; return v; });
        if (total <= 0) return items[Math.floor(next() * items.length)];
        let x = next() * total;
        for (let i = 0; i < items.length; i++) { x -= w[i]; if (x < 0) return items[i]; }
        return items[items.length - 1];
      },
    };
    return r;
  };

  /* ---------- Funcții numerice ---------- */
  M.gcd = function (a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
  M.isSquare = function (n) { const r = Math.round(Math.sqrt(n)); return r * r === n; };
  M.round = function (x, d) { const f = Math.pow(10, d || 0); return Math.round((x + Number.EPSILON) * f) / f; };

  /* Scrie √n = a√b cu b liber de pătrate. Întoarce {a,b}. */
  M.simplifyRadical = function (n) {
    let a = 1, b = n;
    for (let f = 2; f * f <= b; f++) {
      while (b % (f * f) === 0) { b /= f * f; a *= f; }
    }
    return { a: a, b: b };
  };

  /* Radical simplificat ca text TeX: 5\sqrt{2}, 7, \sqrt{13} */
  M.radTex = function (n) {
    const s = M.simplifyRadical(n);
    if (s.b === 1) return String(s.a);
    return (s.a === 1 ? '' : String(s.a)) + '\\sqrt{' + s.b + '}';
  };
  M.radText = function (n) {
    const s = M.simplifyRadical(n);
    if (s.b === 1) return String(s.a);
    return (s.a === 1 ? '' : String(s.a)) + '√' + s.b;
  };

  /* Număr cu virgulă zecimală românească, fără zerouri inutile. */
  M.fmt = function (x, maxDec) {
    const d = maxDec === undefined ? 2 : maxDec;
    let s = (Math.round((x + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d)).toString();
    if (s.indexOf('e') >= 0) s = x.toFixed(d);
    return s.replace('.', ',');
  };

  /* număr pentru TeX (punct zecimal; se afișează cu virgulă) */
  M.texNum = function (x, d) { return String(M.round(x, d === undefined ? 2 : d)); };

  /* „1 zi”, „5 zile”, „23 de zile” */
  M.days = function (n) {
    const m = n % 100;
    if (n === 1) return '1 zi';
    return n + ((m >= 2 && m <= 19) || n === 0 ? ' zile' : ' de zile');
  };

  M.todayStr = function (d) {
    d = d || new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
})(typeof window !== 'undefined' ? window : globalThis);
