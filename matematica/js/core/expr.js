/* Citește răspunsul scris de elev (3,5  5√2  sqrt(50)  3/4 ...) și îl verifică.
   Nu folosește eval: analizor recursiv propriu. */
(function (M) {
  'use strict';

  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/ /g, ' ')
      .replace(/[−–—]/g, '-')
      .replace(/[×·⋅]/g, '*')
      .replace(/[÷:]/g, '/')
      .replace(/radical\s*din/gi, '√')
      .replace(/sqrt/gi, '√')
      .replace(/rad\s*(?=[\d(])/gi, '√')
      .replace(/,/g, '.')
      .trim();
  }

  function P(s) { this.s = s; this.i = 0; }
  P.prototype.ws = function () { while (this.i < this.s.length && this.s[this.i] === ' ') this.i++; };
  P.prototype.peek = function () { this.ws(); return this.s[this.i]; };
  P.prototype.expr = function () {
    let v = this.term();
    for (;;) {
      const c = this.peek();
      if (c === '+') { this.i++; v += this.term(); }
      else if (c === '-') { this.i++; v -= this.term(); }
      else return v;
    }
  };
  P.prototype.term = function () {
    let v = this.factor();
    for (;;) {
      const c = this.peek();
      if (c === '*') { this.i++; v *= this.factor(); }
      else if (c === '/') { this.i++; const d = this.factor(); if (d === 0) throw new Error('div0'); v /= d; }
      else if (c === '√' || c === '(' || (c !== undefined && /[0-9.]/.test(c))) { v *= this.factor(); } /* înmulțire implicită: 5√2, 2(3+1) */
      else return v;
    }
  };
  P.prototype.factor = function () {
    const c = this.peek();
    if (c === '-') { this.i++; return -this.factor(); }
    if (c === '+') { this.i++; return this.factor(); }
    return this.power();
  };
  P.prototype.power = function () {
    const b = this.atom();
    if (this.peek() === '^') { this.i++; const e = this.factor(); return Math.pow(b, e); }
    return b;
  };
  P.prototype.atom = function () {
    const c = this.peek();
    if (c === '(') {
      this.i++;
      const v = this.expr();
      if (this.peek() !== ')') throw new Error('paren');
      this.i++;
      return v;
    }
    if (c === '√') {
      this.i++;
      const x = this.atom();
      if (x < 0) throw new Error('neg');
      return Math.sqrt(x);
    }
    if (c !== undefined && /[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(this.s.slice(this.i));
      if (!m) throw new Error('num');
      this.i += m[0].length;
      return parseFloat(m[0]);
    }
    throw new Error('atom');
  };

  /* Răspuns de tip a√b? */
  function radicalForm(norm) {
    const m = /^(?:(\d+)\s*\*?\s*)?√\s*\(?\s*(\d+)\s*\)?$/.exec(norm);
    if (!m) return null;
    return { a: m[1] ? parseInt(m[1], 10) : 1, b: parseInt(m[2], 10) };
  }

  M.parseAnswer = function (input) {
    const norm = normalize(input);
    if (!norm) return { ok: false, error: 'gol' };
    if (!/^[0-9.+\-*/^()√ ]+$/.test(norm)) return { ok: false, error: 'caractere' };
    try {
      const p = new P(norm);
      const v = p.expr();
      p.ws();
      if (p.i < norm.length || !isFinite(v)) return { ok: false, error: 'format' };
      return { ok: true, value: v, radical: radicalForm(norm), plain: /^-?[0-9]*\.?[0-9]+$/.test(norm), norm: norm };
    } catch (e) {
      return { ok: false, error: 'format' };
    }
  };

  /* ans: {kind:'int'|'dec'|'rad'|'num', value (exact), dec?}
     întoarce {status:'correct'|'wrong'|'almost'|'invalid', note?, why?} */
  M.checkAnswer = function (ans, input) {
    const p = M.parseAnswer(input);
    if (!p.ok) return { status: 'invalid', note: 'Scrie un număr (de exemplu 12, 7,5 sau 5√2).' };
    const v = p.value;
    const exact = ans.value;
    const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };

    if (ans.kind === 'int') {
      if (near(v, exact, 1e-9)) return { status: 'correct' };
      return { status: 'wrong', value: v };
    }
    if (ans.kind === 'dec') {
      const d = ans.dec === undefined ? 1 : ans.dec;
      const expected = M.round(exact, d);
      if (M.round(v, d) === expected && near(v, exact, Math.pow(10, -d) * 0.5 + 1e-9)) return { status: 'correct' };
      if (near(v, exact, 0.0005 * Math.max(1, Math.abs(exact)) + 1e-9)) return { status: 'correct', note: 'Ai dat o valoare mai exactă decât a cerut problema — foarte bine.' };
      if (near(v, exact, Math.pow(10, -d)) ) return { status: 'almost', note: 'Aproape! Verifică rotunjirea la ' + d + (d === 1 ? ' zecimală.' : ' zecimale.') };
      return { status: 'wrong', value: v };
    }
    if (ans.kind === 'rad') {
      /* exact = valoarea numerică; ans.n = numărul de sub radical înainte de simplificare (n = value^2) */
      const target = M.simplifyRadical(ans.n);
      if (p.radical) {
        const sr = M.simplifyRadical(p.radical.b);
        const sameValue = near(v, exact, 1e-7);
        if (sameValue && p.radical.a === target.a && p.radical.b === target.b) return { status: 'correct' };
        if (sameValue) return { status: 'almost', note: 'Valoarea e bună, dar radicalul nu e simplificat complet. Scoate factorii pătrați de sub radical.' };
        return { status: 'wrong', value: v };
      }
      if (target.b === 1 && near(v, exact, 1e-9) && p.plain) return { status: 'correct' };
      if (near(v, exact, 0.01 * Math.max(1, exact))) return { status: 'almost', note: 'Cerința e forma exactă, cu radical (de exemplu 5√2), nu o zecimală.' };
      return { status: 'wrong', value: v };
    }
    /* 'num' — orice expresie egală numeric */
    if (near(v, exact, 1e-7 * Math.max(1, Math.abs(exact)))) return { status: 'correct' };
    return { status: 'wrong', value: v };
  };
})(window.M);
