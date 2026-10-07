/* Mini-compilator TeX → MathML (MathML Core, nativ în toate browserele moderne).
   Fără biblioteci externe, funcționează offline.
   Suportat: \frac{}{} \sqrt{} ^ _ \text{} \cdot \times \le \ge \ne \approx \pi \Rightarrow \; \quad
   culori: \ca{..} latura a (albastru), \cb{..} b (portocaliu), \cc{..} c (violet), \ck{..} corect, \cx{..} greșit, \cy{..} accent
   Numerele cu punct sunt afișate cu virgulă: 3.5 → 3,5 */
(function (M) {
  'use strict';

  const SYMS = {
    cdot: '·', times: '×', le: '≤', ge: '≥', ne: '≠', approx: '≈', pi: 'π', Rightarrow: '⇒', Leftrightarrow: '⇔',
    pm: '±', div: ':', deg: '°', circ: '°', angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', infty: '∞',
    in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', alpha: 'α', beta: 'β', sin: 'sin', cos: 'cos', tan: 'tg', cot: 'ctg',
    sim: '∼', cong: '≅', Delta: 'Δ', ldots: '…', sqrt2: '√2',
  };
  const FUNCS = { sin: 'sin', cos: 'cos', tg: 'tg', ctg: 'ctg' };
  const COLORS = { ca: 'ca', cb: 'cb', cc: 'cc', ck: 'ck', cx: 'cx', cy: 'cy', cm: 'cm' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function Parser(src) { this.s = src; this.i = 0; }
  Parser.prototype.peek = function () { return this.s[this.i]; };
  Parser.prototype.eof = function () { return this.i >= this.s.length; };

  /* Citește un grup {...} sau un singur atom. */
  Parser.prototype.group = function () {
    this.skipWs();
    if (this.peek() === '{') {
      this.i++;
      const start = this.i;
      let depth = 1;
      while (!this.eof() && depth > 0) {
        const ch = this.s[this.i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        this.i++;
      }
      return new Parser(this.s.slice(start, this.i - 1)).row();
    }
    return this.atom();
  };
  Parser.prototype.skipWs = function () { while (!this.eof() && /\s/.test(this.peek())) this.i++; };

  Parser.prototype.row = function () {
    const out = [];
    while (!this.eof()) {
      this.skipWs();
      if (this.eof()) break;
      let a = this.atom();
      if (a == null) continue;
      /* indici și exponenți */
      for (;;) {
        this.skipWs();
        const c = this.peek();
        if (c === '^') {
          this.i++;
          const e = this.group();
          a = '<msup><mrow>' + a + '</mrow><mrow>' + e + '</mrow></msup>';
        } else if (c === '_') {
          this.i++;
          const e = this.group();
          a = '<msub><mrow>' + a + '</mrow><mrow>' + e + '</mrow></msub>';
        } else break;
      }
      out.push(a);
    }
    return out.join('');
  };

  Parser.prototype.atom = function () {
    this.skipWs();
    const c = this.peek();
    if (c === undefined) return null;
    if (c === '{') return '<mrow>' + this.group() + '</mrow>';
    if (c === '\\') {
      this.i++;
      let name = '';
      if (/[a-zA-Z]/.test(this.peek() || '')) {
        while (/[a-zA-Z0-9]/.test(this.peek() || '') && !(name.length >= 1 && /\d/.test(this.peek()) && !SYMS[name + this.peek()])) { name += this.peek(); this.i++; }
      } else { name = this.peek(); this.i++; }
      if (name === 'left' || name === 'right' || name === 'displaystyle') return '';
      if (name === 'dfrac') name = 'frac';
      if (name === 'frac') { const n = this.group(), d = this.group(); return '<mfrac><mrow>' + n + '</mrow><mrow>' + d + '</mrow></mfrac>'; }
      if (name === 'sqrt') { const r = this.group(); return '<msqrt>' + r + '</msqrt>'; }
      if (name === 'text') { const t = this.rawGroup(); return '<mtext>' + esc(t) + '</mtext>'; }
      if (name === ';' || name === 'quad' || name === ' ') return '<mspace width="' + (name === 'quad' ? '1em' : '0.5em') + '"></mspace>';
      if (name === ',') return '<mspace width="0.17em"></mspace>';
      if (COLORS[name]) { const g = this.group(); return '<mrow class="mc-' + COLORS[name] + '">' + g + '</mrow>'; }
      if (FUNCS[name]) return '<mi mathvariant="normal">' + FUNCS[name] + '</mi><mo>&#x2061;</mo>';
      if (name === 'sin' || name === 'cos') return '<mi mathvariant="normal">' + name + '</mi><mo>&#x2061;</mo>';
      if (SYMS[name]) return '<mo>' + SYMS[name] + '</mo>';
      return '<mi>' + esc(name) + '</mi>';
    }
    /* număr */
    if (/[0-9]/.test(c)) {
      let n = '';
      while (/[0-9]/.test(this.peek() || '')) { n += this.peek(); this.i++; }
      if (this.peek() === '.' && /[0-9]/.test(this.s[this.i + 1] || '')) {
        this.i++;
        n += ',';
        while (/[0-9]/.test(this.peek() || '')) { n += this.peek(); this.i++; }
      }
      return '<mn>' + n + '</mn>';
    }
    this.i++;
    if (/[a-zA-ZăâîșțĂÂÎȘȚ]/.test(c)) return '<mi>' + c + '</mi>';
    if (c === '-') return '<mo>−</mo>';
    if (c === '(' || c === ')' || c === '[' || c === ']') return '<mo stretchy="false">' + c + '</mo>';
    if (c === '|') return '<mo stretchy="false">|</mo>';
    if (c === ',') return '<mo separator="true">,</mo>';
    if (c === '=' || c === '+' || c === '<' || c === '>') return '<mo>' + esc(c) + '</mo>';
    if (c === '%') return '<mo>%</mo>';
    if (c === '!' || c === ':' || c === ';' || c === '?') return '<mo>' + c + '</mo>';
    return '<mo>' + esc(c) + '</mo>';
  };
  Parser.prototype.rawGroup = function () {
    this.skipWs();
    if (this.peek() !== '{') { const ch = this.peek() || ''; this.i++; return ch; }
    this.i++;
    const start = this.i;
    let depth = 1;
    while (!this.eof() && depth > 0) {
      const ch = this.s[this.i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      this.i++;
    }
    return this.s.slice(start, this.i - 1);
  };

  /* Text simplu pentru cititoare de ecran. */
  function toSpeech(tex) {
    return String(tex)
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 supra $2')
      .replace(/\\sqrt\{([^{}]*)\}/g, 'radical din $1')
      .replace(/\^\{?2\}?/g, ' la pătrat')
      .replace(/\^\{?3\}?/g, ' la cub')
      .replace(/\^\{([^{}]*)\}/g, ' la puterea $1')
      .replace(/\^(\w)/g, ' la puterea $1')
      .replace(/\\(?:c[abckxym])\{([^{}]*)\}/g, '$1')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\cdot|\\times/g, ' ori ')
      .replace(/\\le\b/g, ' mai mic sau egal cu ')
      .replace(/\\ge\b/g, ' mai mare sau egal cu ')
      .replace(/\\ne\b/g, ' diferit de ')
      .replace(/\\approx/g, ' aproximativ ')
      .replace(/\\pi/g, ' pi ')
      .replace(/\\[;,]|\\quad/g, ' ')
      .replace(/\\([a-zA-Z]+)/g, ' $1 ')
      .replace(/[{}]/g, '')
      .replace(/\+/g, ' plus ')
      .replace(/(\d)\s*-\s*(\d)/g, '$1 minus $2')
      .replace(/=/g, ' egal cu ')
      .replace(/\./g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  }

  M.tex = function (src, opts) {
    opts = opts || {};
    let body;
    try { body = new Parser(String(src)).row(); } catch (e) { body = '<mtext>' + esc(src) + '</mtext>'; }
    return '<math' + (opts.block ? ' display="block"' : '') + ' role="math" aria-label="' + esc(toSpeech(src)) + '">' + body + '</math>';
  };

  /* Transformă un text cu $...$ în HTML cu MathML. Restul textului e escapat. */
  M.rich = function (text) {
    const parts = String(text).split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
    return parts.map(function (p) {
      if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) return M.tex(p.slice(2, -2), { block: true });
      if (p.startsWith('$') && p.endsWith('$') && p.length > 2) return M.tex(p.slice(1, -1));
      return esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }).join('');
  };
  M.speech = toSpeech;
})(window.M);
