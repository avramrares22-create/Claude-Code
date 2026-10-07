/* Vizualizări interactive (partea 2): reciproca, figuri, plan cartezian, scară, relații metrice. */
(function (M) {
  'use strict';
  const h = M.h, s = M.s, V = M.vz, F = M.fig;
  const f1 = function (x) { return M.fmt(x, 1); }, f2 = function (x) { return M.fmt(x, 2); };
  const tn = function (x) { return String(M.round(x, 2)); };           // număr pentru TeX
  const lbl = function (n) { return M.isSquare(Math.round(n * 1e6) / 1e6) && Number.isInteger(Math.sqrt(n)) ? String(Math.sqrt(n)) : '√' + (Math.round(n * 100) / 100 + '').replace('.', ','); };

  /* ================= Reciproca: trei bețe ================= */
  M.visuals['converse-sticks'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const fig = h('div', { class: 'figure' });
    const read = h('div', { class: 'viz-readout' });
    const note = V.note();
    const found = { right: false, acute: false, obtuse: false };
    const badge = function (k, t) { return h('span', { class: 'chip soft', 'data-k': k }, t); };
    const checks = h('div', { class: 'chips', 'aria-label': 'Ce ai găsit' }, badge('acute', 'ascuțitunghic'), badge('right', 'dreptunghic'), badge('obtuse', 'obtuzunghic'));
    const mk = function (label, v, cls) { return V.slider({ label: label, aria: 'Lungimea laturii ' + label, min: 1, max: 15, value: v, cls: cls, onInput: function () { draw(true); } }); };
    const sx = mk('x', 6, 'ca'), sy = mk('y', 8, 'cb'), sz = mk('z', 10, 'cc');
    viz.appendChild(fig); viz.appendChild(read); viz.appendChild(note); viz.appendChild(checks); viz.appendChild(h('div', { class: 'viz-controls' }, sx.el, sy.el, sz.el));
    function draw(user) {
      const sd = [sx.get(), sy.get(), sz.get()].sort(function (p, q) { return p - q; });
      const a = sd[0], b = sd[1], c = sd[2];
      read.innerHTML = '';
      if (a + b <= c) {
        V.swap(fig, h('p', { class: 'muted', style: { 'text-align': 'center', padding: '40px 8px', margin: 0 } }, 'Cu aceste lungimi nu se poate forma un triunghi: cele două laturi mai scurte trebuie să însumeze mai mult decât cea mai lungă.'));
        V.setNote(note, '');
        return;
      }
      const cosV = (a * a + b * b - c * c) / (2 * a * b);
      const sinV = Math.sqrt(Math.max(0, 1 - cosV * cosV));
      const sgn = a * a + b * b - c * c;
      const kind = sgn === 0 ? 'right' : sgn > 0 ? 'acute' : 'obtuse';
      const spec = { pts: { V: [0, 0], X: [b, 0], Y: [a * cosV, a * sinV] }, polys: [{ ids: ['V', 'X', 'Y'], fill: true }], segs: [{ a: 'V', b: 'Y', label: String(a), col: 'a' }, { a: 'V', b: 'X', label: String(b), col: 'b' }, { a: 'X', b: 'Y', label: String(c), col: 'c' }], rights: kind === 'right' ? [{ at: 'V', p: 'X', q: 'Y' }] : [], noDot: ['V', 'X', 'Y'] };
      V.swap(fig, M.renderFigure(spec, { w: 360, h: 230, pad: 30 }));
      read.appendChild(V.pill('ca', 'a² + b² = ' + a * a + ' + ' + b * b + ' = ' + (a * a + b * b)));
      read.appendChild(V.pill('cc', 'c² = ' + c * c));
      const word = { right: 'dreptunghic', acute: 'ascuțitunghic', obtuse: 'obtuzunghic' }[kind];
      V.setNote(note, (sgn === 0 ? 'Egal! ' : sgn > 0 ? 'Suma pătratelor e mai mare. ' : 'Suma pătratelor e mai mică. ') + 'Triunghiul este ' + word + '.', kind === 'right');
      if (user) {
        found[kind] = true;
        Array.prototype.forEach.call(checks.children, function (ch) { const k = ch.getAttribute('data-k'); ch.textContent = (found[k] ? '✓ ' : '') + ({ acute: 'ascuțitunghic', right: 'dreptunghic', obtuse: 'obtuzunghic' })[k]; });
        if (found.right && found.acute && found.obtuse) ctx.done();
      }
    }
    draw(false);
    return { destroy: function () {} };
  };

  /* ================= Pitagora în figuri ================= */
  M.visuals['shape-lab'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const SH = {
      rect: { label: 'Dreptunghi', sl: [['a', 2, 12, 6, 'ca'], ['b', 2, 12, 4, 'cb']], calc: function (v) {
        const n = v.a * v.a + v.b * v.b;
        return { spec: F.rect(v.a, v.b, { AB: String(v.a), BC: String(v.b), AC: lbl(n) }), tex: ['d^2 = \\ca{a}^2 + \\cb{b}^2 = ' + v.a * v.a + ' + ' + v.b * v.b + ' = ' + n, '\\cc{d} = \\sqrt{' + n + '}'] }; } },
      square: { label: 'Pătrat', sl: [['l', 1, 12, 5, 'ca']], calc: function (v) {
        return { spec: F.square(v.l, { AB: String(v.l), AC: lbl(2 * v.l * v.l) }), tex: ['d^2 = \\ca{l}^2 + \\cb{l}^2 = 2 \\cdot ' + v.l * v.l, '\\cc{d} = \\ca{l}\\sqrt{2} = ' + v.l + '\\sqrt{2} \\approx ' + tn(v.l * Math.SQRT2)] }; } },
      iso: { label: 'Isoscel', sl: [['b', 2, 16, 8, 'ca', 2], ['l', 5, 16, 5, 'cc']], calc: function (v) {
        const hb = v.b / 2, n = v.l * v.l - hb * hb;
        return { spec: F.iso(v.b, Math.sqrt(n), { BC: String(v.b), AB: String(v.l), AC: String(v.l), AD: lbl(n) }), tex: ['\\ca{BD} = b : 2 = ' + hb, 'h^2 = \\cc{l}^2 - \\ca{BD}^2 = ' + v.l * v.l + ' - ' + hb * hb + ' = ' + n] }; } },
      equi: { label: 'Echilateral', sl: [['l', 2, 16, 8, 'cc', 2]], calc: function (v) {
        const n = 3 * v.l * v.l / 4;
        return { spec: F.iso(v.l, Math.sqrt(n), { BC: String(v.l), AB: String(v.l), AC: String(v.l), AD: lbl(n) }), tex: ['h^2 = \\cc{l}^2 - \\left(\\frac{l}{2}\\right)^2 = ' + tn(n), '\\cb{h} = \\frac{l\\sqrt{3}}{2} \\approx ' + tn(Math.sqrt(n))] }; } },
      rhomb: { label: 'Romb', sl: [['d₁', 2, 16, 12, 'ca', 2], ['d₂', 2, 16, 8, 'cb', 2]], calc: function (v) {
        const x = v['d₁'] / 2, y = v['d₂'] / 2, n = x * x + y * y;
        return { spec: F.rhomb(v['d₁'], v['d₂'], { AC: String(v['d₁']), BD: String(v['d₂']), AB: lbl(n) }), tex: ['\\ca{AO} = ' + x + ',\\; \\cb{BO} = ' + y, '\\cc{AB}^2 = ' + x * x + ' + ' + y * y + ' = ' + n] }; } },
      trap: { label: 'Trapez isoscel', sl: [['B', 8, 18, 14, 'ca', 2], ['b', 2, 12, 6, 'cb', 2], ['l', 5, 14, 5, 'cc']], calc: function (v) {
        const dx = (v.B - v.b) / 2, n = v.l * v.l - dx * dx;
        return { spec: F.trap(v.B, v.b, Math.sqrt(n), dx, { AB: String(v.B), DC: String(v.b), AD: String(v.l), BC: String(v.l), DE: lbl(n) }), tex: ['\\ca{AE} = (B - b) : 2 = ' + dx, 'h^2 = \\cc{l}^2 - \\ca{AE}^2 = ' + v.l * v.l + ' - ' + dx * dx + ' = ' + n] }; } },
    };
    const order = ['rect', 'square', 'iso', 'equi', 'rhomb', 'trap'];
    let cur = 'rect';
    const seenTabs = V.counter();
    let moves = 0;
    const tabs = h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Alege figura' });
    const fig = h('div', { class: 'figure' });
    const calc = h('div', { class: 'calc' });
    const note = V.note();
    const ctl = h('div', { class: 'viz-controls' });
    viz.appendChild(h('div', { class: 'row', style: { 'justify-content': 'center', 'margin-bottom': '10px' } }, tabs));
    viz.appendChild(fig); viz.appendChild(calc); viz.appendChild(note); viz.appendChild(ctl);
    let sliders = {};
    function valid(vals) {
      /* păstrează valori geometrice posibile */
      if (cur === 'iso') { const hb = vals.b / 2; if (vals.l <= hb) vals.l = hb + 1; }
      if (cur === 'trap') { if (vals.b >= vals.B) vals.b = vals.B - 2; const dx = (vals.B - vals.b) / 2; if (vals.l <= dx) vals.l = dx + 1; }
      return vals;
    }
    function select(key) {
      cur = key; seenTabs.add(key);
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === key)); });
      M.clear(ctl); sliders = {};
      SH[key].sl.forEach(function (d) {
        const sl = V.slider({ label: d[0], aria: 'Valoarea ' + d[0], min: d[1], max: d[2], step: d[5] || 1, value: d[3], cls: d[4], onInput: function () { draw(true); } });
        sliders[d[0]] = sl; ctl.appendChild(sl.el);
      });
      draw(false);
    }
    function draw(user) {
      let vals = {}; Object.keys(sliders).forEach(function (k) { vals[k] = sliders[k].get(); });
      vals = valid(vals);
      Object.keys(sliders).forEach(function (k) { if (sliders[k].get() !== vals[k]) sliders[k].set(vals[k]); });
      if (cur === 'iso') sliders.l.range(vals.b / 2 + 1, 16);
      if (cur === 'trap') { sliders.l.range((vals.B - vals.b) / 2 + 1, 14); sliders.b.range(2, vals.B - 2); }
      const r = SH[cur].calc(vals);
      V.swap(fig, M.renderFigure(r.spec, { w: 360, h: 240, pad: 34 }));
      calc.innerHTML = r.tex.map(function (t) { return '<div class="calc-row">' + M.tex(t) + '</div>'; }).join('');
      V.setNote(note, 'Triunghiul dreptunghic folosit este colorat: catetele albastru și portocaliu, ipotenuza violet.');
      if (user) moves++;
      if (seenTabs.n() >= 4 && moves >= 5) ctx.done();
    }
    order.forEach(function (k) { tabs.appendChild(h('button', { type: 'button', 'data-k': k, 'aria-pressed': 'false', on: { click: function () { select(k); } } }, SH[k].label)); });
    select('rect');
    return { destroy: function () {} };
  };

  /* ================= Distanța în plan ================= */
  M.visuals['coord-plane'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const k = 24, ox = 180, oy = 150, XR = 7, YR = 5;
    const X = function (x) { return ox + x * k; }, Y = function (y) { return oy - y * k; };
    const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 360 300', role: 'group', 'aria-label': 'Plan cartezian cu punctele A și B care se pot muta' });
    for (let x = -XR; x <= XR; x++) svg.appendChild(s('line', { x1: X(x), y1: Y(-YR), x2: X(x), y2: Y(YR), class: x === 0 ? 'axis-l' : 'grid-l' }));
    for (let y = -YR; y <= YR; y++) svg.appendChild(s('line', { x1: X(-XR), y1: Y(y), x2: X(XR), y2: Y(y), class: y === 0 ? 'axis-l' : 'grid-l' }));
    for (let x = -XR; x <= XR; x++) if (x) svg.appendChild(s('text', { x: X(x), y: Y(0) + 13, class: 'tick', 'text-anchor': 'middle' }, String(x)));
    for (let y = -YR; y <= YR; y++) if (y) svg.appendChild(s('text', { x: X(0) - 6, y: Y(y) + 4, class: 'tick', 'text-anchor': 'end' }, String(y)));
    const lh = s('line', { class: 'fig-seg c-a dash' }), lv = s('line', { class: 'fig-seg c-b dash' }), lab = s('line', { class: 'fig-seg c-c' });
    [lh, lv, lab].forEach(function (e) { svg.appendChild(e); });
    const tdx = s('text', { class: 'fig-label t-a', 'text-anchor': 'middle' }), tdy = s('text', { class: 'fig-label t-b', 'text-anchor': 'middle' });
    svg.appendChild(tdx); svg.appendChild(tdy);
    const P = { A: { x: -3, y: -1 }, B: { x: 2, y: 3 } };
    const el = {};
    ['A', 'B'].forEach(function (n) {
      const g = s('g', { tabindex: 0, role: 'button', class: 'pt-handle' });
      g.appendChild(s('circle', { r: 17, class: 'pt-halo' }));
      g.appendChild(s('circle', { r: 7, class: 'pt-core' }));
      const t = s('text', { class: 'fig-name', 'text-anchor': 'middle', y: -14 }, n);
      g.appendChild(t); svg.appendChild(g); el[n] = g;
      let drag = false;
      g.addEventListener('pointerdown', function (ev) { drag = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ } g.focus(); ev.preventDefault(); });
      svg.addEventListener('pointermove', function (ev) {
        if (!drag) return;
        const p = V.toSvg(svg, ev);
        move(n, Math.round((p.x - ox) / k), Math.round((oy - p.y) / k), true);
      });
      const end = function () { drag = false; };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      g.addEventListener('keydown', function (ev) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
        if (!d) return;
        ev.preventDefault(); move(n, P[n].x + d[0], P[n].y + d[1], true);
      });
    });
    const read = h('div', { class: 'viz-readout' });
    const note = V.note();
    const seen = V.counter();
    viz.appendChild(svg); viz.appendChild(read); viz.appendChild(note);
    viz.appendChild(h('p', { class: 'small muted', style: { 'text-align': 'center', margin: '8px 0 0' } }, 'Trage punctele cu degetul sau mută-le cu săgețile (după ce le selectezi cu Tab).'));
    function move(n, x, y, user) {
      P[n].x = Math.max(-XR, Math.min(XR, x)); P[n].y = Math.max(-YR, Math.min(YR, y));
      draw(user);
      if (user) seen.add(n + P[n].x + ',' + P[n].y);
    }
    function draw(user) {
      const A = P.A, B = P.B;
      ['A', 'B'].forEach(function (n) { el[n].setAttribute('transform', 'translate(' + X(P[n].x) + ',' + Y(P[n].y) + ')'); el[n].setAttribute('aria-label', 'Punctul ' + n + ', x egal ' + P[n].x + ', y egal ' + P[n].y + '. Folosește săgețile pentru a-l muta.'); });
      lh.setAttribute('x1', X(A.x)); lh.setAttribute('y1', Y(A.y)); lh.setAttribute('x2', X(B.x)); lh.setAttribute('y2', Y(A.y));
      lv.setAttribute('x1', X(B.x)); lv.setAttribute('y1', Y(A.y)); lv.setAttribute('x2', X(B.x)); lv.setAttribute('y2', Y(B.y));
      lab.setAttribute('x1', X(A.x)); lab.setAttribute('y1', Y(A.y)); lab.setAttribute('x2', X(B.x)); lab.setAttribute('y2', Y(B.y));
      const dx = Math.abs(B.x - A.x), dy = Math.abs(B.y - A.y), n = dx * dx + dy * dy;
      tdx.setAttribute('x', (X(A.x) + X(B.x)) / 2); tdx.setAttribute('y', Y(A.y) + (B.y >= A.y ? 20 : -10)); tdx.textContent = dx ? String(dx) : '';
      tdy.setAttribute('x', X(B.x) + (B.x >= A.x ? 16 : -16)); tdy.setAttribute('y', (Y(A.y) + Y(B.y)) / 2 + 5); tdy.textContent = dy ? String(dy) : '';
      read.innerHTML = '';
      read.appendChild(V.pill('ca', 'Δx = |' + B.x + ' − (' + A.x + ')| = ' + dx));
      read.appendChild(V.pill('cb', 'Δy = |' + B.y + ' − (' + A.y + ')| = ' + dy));
      read.appendChild(V.pill('cc', 'AB = √' + n + (M.isSquare(n) ? ' = ' + Math.sqrt(n) : ' ≈ ' + f2(Math.sqrt(n)))));
      V.setNote(note, M.isSquare(n) && n > 0 ? 'Distanța e număr întreg: (' + Math.min(dx, dy) + ', ' + Math.max(dx, dy) + ', ' + Math.sqrt(n) + ') este triplet pitagoreic.' : 'Catetele triunghiului dreptunghic sunt paralele cu axele.', M.isSquare(n) && n > 0);
      if (user && seen.n() >= 5) ctx.done();
    }
    draw(false);
    return { destroy: function () {} };
  };

  /* ================= Scara pe perete ================= */
  M.visuals['ladder-lab'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const L = 5, k = 40, gx = 104, gy = 226;
    const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 380 260', role: 'img', 'aria-label': 'O scară de 5 metri sprijinită de un perete; baza scării se poate depărta de perete.' });
    svg.appendChild(s('rect', { x: gx - 16, y: 14, width: 16, height: gy - 14, class: 'wall', style: { fill: 'var(--surface-2)', stroke: 'var(--border-strong)' } }));
    svg.appendChild(s('line', { x1: gx - 70, y1: gy, x2: 372, y2: gy, class: 'ground', style: { stroke: 'var(--border-strong)', 'stroke-width': 3 } }));
    const lg = s('line', { class: 'fig-seg c-a dash' }), lw = s('line', { class: 'fig-seg c-b dash' }), ll = s('line', { class: 'fig-seg c-c', style: { 'stroke-width': 5 } });
    [lg, lw, ll].forEach(function (e) { svg.appendChild(e); });
    const td = s('text', { class: 'fig-label t-a', 'text-anchor': 'middle' }), th = s('text', { class: 'fig-label t-b', 'text-anchor': 'middle' }), tl = s('text', { class: 'fig-label t-c', 'text-anchor': 'middle' }, 'L = 5 m');
    svg.appendChild(td); svg.appendChild(th); svg.appendChild(tl);
    const read = h('div', { class: 'viz-readout' });
    const note = V.note();
    const seen = V.counter(); let sawInt = false;
    const sl = V.slider({ label: 'd', aria: 'Distanța bazei scării față de perete, în metri', min: 0.5, max: 4.8, step: 0.1, value: 2, dec: 1, cls: 'ca', fmt: function (v) { return f1(v) + ' m'; }, onInput: function (v) { draw(v, true); } });
    viz.appendChild(svg); viz.appendChild(read); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, sl.el));
    function draw(d, user) {
      d = Math.round(d * 10) / 10;
      const hh = Math.sqrt(L * L - d * d);
      const bx = gx + d * k, ty = gy - hh * k;
      lg.setAttribute('x1', gx); lg.setAttribute('y1', gy); lg.setAttribute('x2', bx); lg.setAttribute('y2', gy);
      lw.setAttribute('x1', gx); lw.setAttribute('y1', gy); lw.setAttribute('x2', gx); lw.setAttribute('y2', ty);
      ll.setAttribute('x1', bx); ll.setAttribute('y1', gy); ll.setAttribute('x2', gx); ll.setAttribute('y2', ty);
      td.setAttribute('x', (gx + bx) / 2); td.setAttribute('y', gy + 24); td.textContent = 'd = ' + f1(d) + ' m';
      th.setAttribute('x', gx - 24); th.setAttribute('y', (gy + ty) / 2 + 5); th.setAttribute('text-anchor', 'end'); th.textContent = 'h ≈ ' + f2(hh);
      tl.setAttribute('x', (gx + bx) / 2 + 14); tl.setAttribute('y', (gy + ty) / 2 - 10); tl.setAttribute('text-anchor', 'start');
      read.innerHTML = '';
      read.appendChild(V.pill('cc', 'h² = 5² − d² = 25 − ' + f2(d * d) + ' = ' + f2(25 - d * d)));
      const int = Math.abs(hh - Math.round(hh)) < 1e-9;
      read.appendChild(V.pill('cb', int ? 'h = ' + Math.round(hh) + ' m' : 'h ≈ ' + f2(hh) + ' m'));
      V.setNote(note, int ? 'Triplet pitagoreic: (' + Math.min(d, hh) + ', ' + Math.max(d, hh) + ', 5)!' : 'Cu cât baza e mai departe de perete, cu atât scara ajunge mai jos.', int);
      if (user) { seen.add(d); if (int) sawInt = true; if (sawInt && seen.n() >= 4) ctx.done(); }
    }
    draw(2, false);
    return { destroy: function () {} };
  };

  /* ================= Înălțimea din unghiul drept ================= */
  M.visuals['height-lab'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const mode = cfg.mode || 'height';
    const R = 16;
    const fig = h('div', { class: 'figure' });
    const area = mode === 'leg' ? h('div', { class: 'figure' }) : null;
    const read = h('div', { class: 'viz-readout' });
    const note = V.note();
    const seen = V.counter();
        const sp = V.slider({ label: 'p', aria: 'Lungimea lui BD', min: 1, max: R, value: cfg.p || 4, cls: 'ca', onInput: function () { draw(true); } });
    const sq = V.slider({ label: 'q', aria: 'Lungimea lui DC', min: 1, max: R, value: cfg.q || 9, cls: 'cb', onInput: function () { draw(true); } });
    viz.appendChild(fig); if (area) viz.appendChild(area); viz.appendChild(read); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, sp.el, sq.el));
    function draw(user) {
      const p = sp.get(), q = sq.get();
      read.innerHTML = '';
      if (mode === 'height') {
        const n = p * q;
        V.swap(fig, M.renderFigure(F.hgt(p, q, { BD: String(p), DC: String(q), AD: lbl(n) }), { w: 360, h: 210, pad: 30 }));
        read.appendChild(V.pill('ca', 'BD · DC = ' + p + ' · ' + q + ' = ' + n));
        read.appendChild(V.pill('ch', 'AD² = ' + n));
        read.appendChild(V.pill('ch', 'AD ' + (M.isSquare(n) ? '= ' + Math.sqrt(n) : '≈ ' + f2(Math.sqrt(n)))));
        V.setNote(note, M.isSquare(n) ? 'Produsul e pătrat perfect: înălțimea este număr întreg.' : 'Înălțimea la pătrat este mereu egală cu produsul proiecțiilor.', M.isSquare(n));
      } else {
        const bc = p + q, n = p * bc;
        V.swap(fig, M.renderFigure(F.hgt(p, q, { BD: String(p), DC: String(q), AB: lbl(n), AD: '' }), { w: 360, h: 210, pad: 30 }));
        const sc = Math.min(150 / Math.max(bc, Math.sqrt(n)), 150 / Math.max(p, Math.sqrt(n)), 12);
        const w1 = bc * sc, h1 = p * sc, sd = Math.sqrt(n) * sc;
        const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 380 ' + Math.max(110, Math.max(h1, sd) + 40), role: 'img', 'aria-label': 'Dreptunghiul BD pe BC și pătratul de latură AB au aceeași arie.', style: { 'max-width': '420px', margin: '0 auto' } });
        svg.appendChild(s('rect', { x: 10, y: 20, width: w1, height: h1, class: 'fig-sq sq-a' }));
        svg.appendChild(s('text', { x: 10 + w1 / 2, y: 20 + h1 / 2 + 5, class: 'fig-label t-a', 'text-anchor': 'middle' }, 'BD · BC = ' + n));
        svg.appendChild(s('rect', { x: 10 + w1 + 24, y: 20, width: sd, height: sd, class: 'fig-sq sq-c' }));
        svg.appendChild(s('text', { x: 10 + w1 + 24 + sd / 2, y: 20 + sd / 2 + 5, class: 'fig-label t-c', 'text-anchor': 'middle' }, 'AB² = ' + n));
        V.swap(area, svg);
        read.appendChild(V.pill('ca', 'BC = BD + DC = ' + p + ' + ' + q + ' = ' + bc));
        read.appendChild(V.pill('cc', 'AB² = ' + p + ' · ' + bc + ' = ' + n));
        V.setNote(note, 'Dreptunghiul și pătratul au aceeași arie — aceasta este teorema catetei.', true);
      }
      if (user) { seen.add(p + ',' + q); if (seen.n() >= 5) ctx.done(); }
    }
    draw(false);
    return { destroy: function () {} };
  };
})(window.M);
