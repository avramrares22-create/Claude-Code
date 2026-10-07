/* Vizualizări interactive (partea 1): unghiul drept, pătrate pe laturi, demonstrația prin decupare, radicali, calculator Pitagora. */
(function (M) {
  'use strict';
  const h = M.h, s = M.s, V = M.vz, F = M.fig;
  const f2 = function (x) { return M.fmt(x, 2); };

  /* ================= 1. Unghiul din A reglabil ================= */
  M.visuals['rt-explorer'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const U = 52, A = { x: 74, y: 214 }, AB = 4, AC = 3;
    const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 380 270', role: 'img', 'aria-label': 'Triunghi ABC cu AB = 4 și AC = 3; unghiul din A se poate modifica.' });
    const poly = s('path', { class: 'fig-poly fill' });
    const sAB = s('line', { class: 'fig-seg c-a' }), sAC = s('line', { class: 'fig-seg c-b' }), sBC = s('line', { class: 'fig-seg c-c' });
    const arc = s('path', { class: 'fig-right', style: { fill: 'none' } });
    const right = s('path', { class: 'fig-right' });
    const lAB = s('text', { class: 'fig-label t-a', 'text-anchor': 'middle' }), lAC = s('text', { class: 'fig-label t-b', 'text-anchor': 'middle' }), lBC = s('text', { class: 'fig-label t-c', 'text-anchor': 'middle' });
    const nA = s('text', { class: 'fig-name', 'text-anchor': 'middle' }, 'A'), nB = s('text', { class: 'fig-name', 'text-anchor': 'middle' }, 'B'), nC = s('text', { class: 'fig-name', 'text-anchor': 'middle' }, 'C');
    const ang = s('text', { class: 'fig-label t-h', 'text-anchor': 'middle' });
    const handle = s('circle', { r: 17, class: 'handle', 'aria-hidden': 'true', style: { fill: 'var(--cb)', opacity: '.22', cursor: 'grab' } });
    const dotC = s('circle', { r: 6, class: 'fig-dot', style: { fill: 'var(--cb)' } });
    [poly, sAB, sAC, sBC, arc, right, lAB, lAC, lBC, nA, nB, nC, ang, handle, dotC].forEach(function (e) { svg.appendChild(e); });
    const note = V.note();
    const seen = V.counter();
    let sawRight = false;
    const sl = V.slider({ label: 'Unghiul din A', aria: 'Unghiul din A, în grade', min: 30, max: 150, value: 70, step: 1, cls: 'cc', fmt: function (v) { return v + '°'; }, onInput: function (v) { set(v, true); } });
    const read = h('div', { class: 'viz-readout', 'aria-live': 'off' });
    viz.appendChild(svg); viz.appendChild(read); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, sl.el));

    function set(deg, fromUser) {
      if (Math.abs(deg - 90) <= 1) deg = 90;
      const th = deg * Math.PI / 180;
      const B = { x: A.x + AB * U, y: A.y };
      const C = { x: A.x + AC * U * Math.cos(th), y: A.y - AC * U * Math.sin(th) };
      const bc = Math.sqrt(AB * AB + AC * AC - 2 * AB * AC * Math.cos(th));
      const set2 = function (el, a, b) { el.setAttribute('x1', a.x); el.setAttribute('y1', a.y); el.setAttribute('x2', b.x); el.setAttribute('y2', b.y); };
      poly.setAttribute('d', 'M' + A.x + ' ' + A.y + 'L' + B.x + ' ' + B.y + 'L' + C.x + ' ' + C.y + 'Z');
      set2(sAB, A, B); set2(sAC, A, C); set2(sBC, B, C);
      const mid = function (p, q, dx, dy) { return { x: (p.x + q.x) / 2 + dx, y: (p.y + q.y) / 2 + dy }; };
      let p = mid(A, B, 0, 22); lAB.setAttribute('x', p.x); lAB.setAttribute('y', p.y); lAB.textContent = '4';
      p = mid(A, C, deg < 90 ? -16 : 16, 4); lAC.setAttribute('x', p.x); lAC.setAttribute('y', p.y); lAC.textContent = '3';
      p = mid(B, C, 16, -6); lBC.setAttribute('x', p.x); lBC.setAttribute('y', p.y); lBC.textContent = f2(bc);
      nA.setAttribute('x', A.x - 14); nA.setAttribute('y', A.y + 20); nB.setAttribute('x', B.x + 14); nB.setAttribute('y', B.y + 6);
      nC.setAttribute('x', C.x + (deg < 90 ? 18 : -18)); nC.setAttribute('y', C.y - 14);
      handle.setAttribute('cx', C.x); handle.setAttribute('cy', C.y); dotC.setAttribute('cx', C.x); dotC.setAttribute('cy', C.y);
      /* arc */
      const r = 30;
      arc.setAttribute('d', deg === 90 ? '' : 'M' + (A.x + r) + ' ' + A.y + 'A' + r + ' ' + r + ' 0 0 0 ' + (A.x + r * Math.cos(th)) + ' ' + (A.y - r * Math.sin(th)));
      right.setAttribute('d', deg === 90 ? 'M' + (A.x + 14) + ' ' + A.y + 'L' + (A.x + 14) + ' ' + (A.y - 14) + 'L' + A.x + ' ' + (A.y - 14) : '');
      ang.setAttribute('x', A.x + 52 * Math.cos(th / 2) + 6); ang.setAttribute('y', A.y - 52 * Math.sin(th / 2) + 6);
      ang.textContent = deg + '°';
      sl.set(deg);
      read.innerHTML = '';
      read.appendChild(V.pill('ca', 'AB = 4')); read.appendChild(V.pill('cb', 'AC = 3')); read.appendChild(V.pill('cc', 'BC = ' + f2(bc)));
      if (deg === 90) { sawRight = true; V.setNote(note, 'Unghi drept! BC = 5, cea mai lungă latură: ipotenuza.', true); }
      else V.setNote(note, deg < 90 ? 'Unghi ascuțit: BC este mai scurtă decât 5.' : 'Unghi obtuz: BC este mai lungă decât 5.');
      if (fromUser) { seen.add(deg); if (sawRight && seen.n() >= 5) ctx.done(); }
    }
    /* tragere cu degetul / mouse-ul */
    let drag = false;
    const move = function (ev) {
      if (!drag) return;
      const p = V.toSvg(svg, ev);
      let deg = Math.atan2(A.y - p.y, p.x - A.x) * 180 / Math.PI;
      deg = Math.max(30, Math.min(150, Math.round(deg)));
      set(deg, true);
    };
    handle.addEventListener('pointerdown', function (ev) { drag = true; handle.style.cursor = 'grabbing'; try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ } ev.preventDefault(); });
    svg.addEventListener('pointermove', move);
    const end = function () { drag = false; handle.style.cursor = 'grab'; };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    set(70, false);
    return { destroy: function () {} };
  };

  /* ================= 2. Pătrate pe laturi ================= */
  M.visuals['pyth-squares'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const R = cfg.max || 9;
    const fig = h('div', { class: 'figure' });
    const read = h('div', { class: 'viz-readout' });
    const note = V.note();
    const seen = V.counter();
    const sa = V.slider({ label: 'a', aria: 'Lungimea catetei a', min: 1, max: R, value: cfg.a || 3, cls: 'ca', onInput: function () { draw(true); } });
    const sb = V.slider({ label: 'b', aria: 'Lungimea catetei b', min: 1, max: R, value: cfg.b || 4, cls: 'cb', onInput: function () { draw(true); } });
    if (cfg.lock) { sa.disable(true); sb.disable(true); }
    viz.appendChild(fig); viz.appendChild(read); viz.appendChild(note);
    if (!cfg.lock) viz.appendChild(h('div', { class: 'viz-controls' }, sa.el, sb.el));
    function draw(user) {
      const a = sa.get(), b = sb.get(), c2 = a * a + b * b;
      const spec = F.rtSquares(a, b, [a * a, b * b, c2]);
      spec.sqGrid = true;
      V.swap(fig, M.renderFigure(spec, { w: 380, h: 290, pad: 16 }));
      read.innerHTML = '';
      read.appendChild(V.pill('ca', 'Pătratul de pe a: ' + a * a));
      read.appendChild(V.pill('cb', 'Pătratul de pe b: ' + b * b));
      read.appendChild(V.pill('cc', 'Pătratul de pe c: ' + c2));
      if (cfg.showEq) read.appendChild(V.pill('ch', a * a + ' + ' + b * b + ' = ' + c2 + ' ✓'));
      const isInt = M.isSquare(c2);
      V.setNote(note, isInt ? 'Aici și lungimea ipotenuzei este număr întreg: c = ' + Math.sqrt(c2) + '.' : 'Aria pătratului mare nu e pătrat perfect: c = √' + c2 + ' nu e întreg.', isInt);
      if (user) { seen.add(a + ',' + b); if (seen.n() >= (cfg.need || 5)) ctx.done(); }
    }
    draw(false);
    if (cfg.lock) ctx.done();
    return { destroy: function () {} };
  };

  /* ================= 3. Demonstrația prin decupare ================= */
  M.visuals['pyth-proof'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const a = 3, b = 4, S = a + b, k = 36, O = { x: 64, y: 278 };
    const X = function (x) { return O.x + x * k; }, Y = function (y) { return O.y - y * k; };
    const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 380 310', role: 'img', 'aria-label': 'Un pătrat cu latura 7 în care patru triunghiuri dreptunghice identice se pot muta; suprafața rămasă liberă are aceeași arie.' });
    const poly = function (pts, cls) { return s('path', { class: cls, d: pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('') + 'Z' }); };
    const base = poly([[0, 0], [S, 0], [S, S], [0, S]], 'fig-sq sq-c');
    const holeA = poly([[0, 0], [a, 0], [a, a], [0, a]], 'fig-sq sq-a');
    const holeB = poly([[a, a], [S, a], [S, S], [a, S]], 'fig-sq sq-b');
    svg.appendChild(base); svg.appendChild(holeA); svg.appendChild(holeB);
    svg.appendChild(poly([[0, 0], [S, 0], [S, S], [0, S]], 'fig-poly'));
    /* fiecare triunghi alunecă pe rând (fără suprapuneri): întâi cel din stânga-sus, apoi cel din stânga-jos, apoi cel din dreapta-sus */
    const T = [
      { v: [[0, 0], [a, 0], [0, b]], d: [0, a], s: 1 / 3 },
      { v: [[S, 0], [S - b, 0], [S, a]], d: [0, 0], s: 0 },
      { v: [[S, S], [S, S - b], [S - a, S]], d: [-b, 0], s: 2 / 3 },
      { v: [[0, S], [b, S], [0, S - a]], d: [a, -b], s: 0 },
    ];
    const tri = T.map(function (t) { const p = s('path', { class: 'proof-tri' }); svg.appendChild(p); return p; });
    const lc = s('text', { class: 'fig-label t-c big', 'text-anchor': 'middle' }, 'c²');
    const la = s('text', { class: 'fig-label t-a big', 'text-anchor': 'middle' }, 'a²');
    const lb = s('text', { class: 'fig-label t-b big', 'text-anchor': 'middle' }, 'b²');
    [lc, la, lb].forEach(function (e) { svg.appendChild(e); });
    la.setAttribute('x', X(a / 2)); la.setAttribute('y', Y(a / 2) + 6); lb.setAttribute('x', X(a + b / 2)); lb.setAttribute('y', Y(a + b / 2) + 6);
    lc.setAttribute('x', X(S / 2)); lc.setAttribute('y', Y(S / 2) + 6);
    const note = V.note();
    let reached = false;
    const sl = V.slider({ label: 'Mută', aria: 'Mută triunghiurile', min: 0, max: 100, value: 0, cls: 'cc', fmt: function (v) { return v + '%'; }, onInput: function (v) { render(v / 100); } });
    const play = h('button', { class: 'btn sm', type: 'button', on: { click: animate } }, M.icon('play', 18), 'Animează');
    viz.appendChild(svg); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, sl.el, h('div', { class: 'row' }, play)));
    const ease = function (u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    function render(t) {
      T.forEach(function (tr, i) {
        const u = ease((t - tr.s) * 3);
        tri[i].setAttribute('d', tr.v.map(function (p, j) { return (j ? 'L' : 'M') + X(p[0] + tr.d[0] * u).toFixed(1) + ' ' + Y(p[1] + tr.d[1] * u).toFixed(1); }).join('') + 'Z');
      });
      const fade = ease((t - 0.62) / 0.38);
      holeA.style.opacity = String(fade); holeB.style.opacity = String(fade);
      lc.style.opacity = String(Math.max(0, 1 - 2.2 * t)); la.style.opacity = lb.style.opacity = String(Math.max(0, (t - 0.8) * 5));
      sl.set(Math.round(t * 100));
      if (t < 0.02) V.setNote(note, 'Patru triunghiuri identice lasă în mijloc un pătrat înclinat: aria lui este c².');
      else if (t > 0.98) { V.setNote(note, 'Aceleași triunghiuri lasă acum două pătrate: a² și b². Suprafața liberă e aceeași!', true); if (!reached) { reached = true; ctx.done(); } }
      else V.setNote(note, 'Triunghiurile doar alunecă, pe rând — aria lor nu se schimbă.');
    }
    let raf = null;
    function animate() {
      if (M.reducedMotion()) { render(sl.get() < 50 ? 1 : 0); return; }
      const from = sl.get() / 100, to = from < 0.5 ? 1 : 0, t0 = performance.now(), dur = 1800;
      cancelAnimationFrame(raf);
      (function step(now) {
        const u = Math.min(1, (now - t0) / dur), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        render(from + (to - from) * e);
        if (u < 1) raf = requestAnimationFrame(step);
      })(t0);
    }
    render(0);
    return { destroy: function () { cancelAnimationFrame(raf); } };
  };

  /* ================= 4. Radicalul pe axa numerelor ================= */
  M.visuals['sqrt-line'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const k = 27, x0 = 24;
    const svg = s('svg', { class: 'viz-svg', viewBox: '0 0 400 130', role: 'img', 'aria-label': 'Axa numerelor de la 0 la 13 cu poziția lui radical din n.' });
    const band = s('rect', { y: 36, height: 34, rx: 6, style: { fill: 'var(--accent-soft)' } });
    svg.appendChild(band);
    svg.appendChild(s('line', { x1: x0, x2: x0 + 13 * k, y1: 70, y2: 70, class: 'fig-seg c-n' }));
    for (let i = 0; i <= 13; i++) { svg.appendChild(s('line', { x1: x0 + i * k, x2: x0 + i * k, y1: 64, y2: 76, class: 'fig-seg c-n', style: { 'stroke-width': 2 } })); svg.appendChild(s('text', { x: x0 + i * k, y: 96, class: 'tick', 'text-anchor': 'middle' }, String(i))); }
    const dot = s('circle', { cy: 70, r: 8, style: { fill: 'var(--cc)' } });
    const lab = s('text', { y: 28, class: 'fig-label t-c big', 'text-anchor': 'middle' });
    svg.appendChild(dot); svg.appendChild(lab);
    const note = V.note();
    const read = h('div', { class: 'viz-readout' });
    const seen = V.counter();
    const sl = V.slider({ label: 'n', aria: 'Numărul n de sub radical', min: 1, max: 170, value: 50, cls: 'cc', onInput: function (v) { draw(v, true); } });
    viz.appendChild(svg); viz.appendChild(read); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, sl.el));
    function draw(n, user) {
      const r = Math.sqrt(n), kk = Math.floor(r);
      dot.setAttribute('cx', x0 + r * k); lab.setAttribute('x', Math.max(34, Math.min(380, x0 + r * k))); lab.textContent = '√' + n + ' ≈ ' + f2(r);
      band.setAttribute('x', x0 + kk * k); band.setAttribute('width', k);
      read.innerHTML = '';
      if (M.isSquare(n)) { read.appendChild(V.pill('ch', n + ' = ' + kk + '² → √' + n + ' = ' + kk)); V.setNote(note, 'Pătrat perfect: rădăcina este număr întreg.', true); }
      else { read.appendChild(V.pill('ca', kk + '² = ' + kk * kk)); read.appendChild(V.pill('cc', n)); read.appendChild(V.pill('cb', (kk + 1) + '² = ' + (kk + 1) * (kk + 1))); V.setNote(note, kk + ' < √' + n + ' < ' + (kk + 1)); }
      if (user) { seen.add(n); if (seen.n() >= 5) ctx.done(); }
    }
    draw(50, false);
    return { destroy: function () {} };
  };

  /* ================= 5. Calculator Pitagora cu pași ================= */
  M.visuals['pyth-solver'] = function (host, cfg, ctx) {
    const viz = V.card(host);
    const mode = cfg.mode || 'hyp';
    const fig = h('div', { class: 'figure' });
    const calc = h('div', { class: 'calc' });
    const note = V.note();
    const found = V.counter(); const seen = V.counter();
    const R = 12;
    const bnd = M.figureBounds(F.rt(R, R, {}, ['A', 'B', 'C']), { w: 360, h: 250 });
    const s1 = mode === 'hyp'
      ? V.slider({ label: 'a', aria: 'Lungimea catetei a', min: 1, max: R, value: 6, cls: 'ca', onInput: function () { draw(true); } })
      : V.slider({ label: 'c', aria: 'Lungimea ipotenuzei c', min: 2, max: 15, value: 13, cls: 'cc', onInput: function () { draw(true); } });
    const s2 = mode === 'hyp'
      ? V.slider({ label: 'b', aria: 'Lungimea catetei b', min: 1, max: R, value: 8, cls: 'cb', onInput: function () { draw(true); } })
      : V.slider({ label: 'a', aria: 'Lungimea catetei a', min: 1, max: 14, value: 5, cls: 'ca', onInput: function () { draw(true); } });
    viz.appendChild(fig); viz.appendChild(calc); viz.appendChild(note); viz.appendChild(h('div', { class: 'viz-controls' }, s1.el, s2.el));
    const row = function (tex) { return h('div', { class: 'calc-row', html: M.tex(tex) }); };
    function draw(user) {
      calc.innerHTML = '';
      let a, b, c, ok = true, intRes = false;
      if (mode === 'hyp') {
        a = s1.get(); b = s2.get(); const n = a * a + b * b; c = Math.sqrt(n);
        calc.appendChild(row('\\ca{a^2} = ' + a + '^2 = ' + a * a));
        calc.appendChild(row('\\cb{b^2} = ' + b + '^2 = ' + b * b));
        calc.appendChild(row('\\cc{c^2} = \\ca{' + a * a + '} + \\cb{' + b * b + '} = ' + n));
        calc.appendChild(row('\\cc{c} = \\sqrt{' + n + '} ' + (M.isSquare(n) ? '= \\cc{' + c + '}' : '\\approx \\cc{' + U(c) + '}')));
        intRes = M.isSquare(n);
        V.swap(fig, M.renderFigure(F.rt(a, b, { AB: String(a), AC: String(b), BC: M.isSquare(n) ? String(c) : '√' + n }, ['A', 'B', 'C']), { w: 360, h: 250, bounds: bnd, pad: 24 }));
        if (user) { seen.add(a + ',' + b); if (intRes) found.add(Math.min(a, b) + ',' + Math.max(a, b)); }
        V.setNote(note, intRes ? 'Ipotenuza e număr întreg: (' + Math.min(a, b) + ', ' + Math.max(a, b) + ', ' + c + ') este triplet pitagoreic!' : 'Încearcă să găsești două perechi (a, b) pentru care ipotenuza e număr întreg.', intRes);
        if (found.n() >= 2) ctx.done();
      } else {
        c = s1.get(); a = s2.get();
        s2.range(1, c - 1); if (a >= c) { a = c - 1; s2.set(a); }
        const n = c * c - a * a; b = Math.sqrt(n);
        calc.appendChild(row('\\cc{c^2} = ' + c + '^2 = ' + c * c));
        calc.appendChild(row('\\ca{a^2} = ' + a + '^2 = ' + a * a));
        calc.appendChild(row('\\cb{b^2} = \\cc{' + c * c + '} - \\ca{' + a * a + '} = ' + n));
        calc.appendChild(row('\\cb{b} = \\sqrt{' + n + '} ' + (M.isSquare(n) ? '= \\cb{' + b + '}' : '\\approx \\cb{' + U(b) + '}')));
        intRes = M.isSquare(n);
        V.swap(fig, M.renderFigure(F.rt(a, b, { AB: String(a), AC: M.isSquare(n) ? String(b) : '√' + n, BC: String(c) }, ['A', 'B', 'C']), { w: 360, h: 250, bounds: bnd, pad: 24 }));
        if (user) { seen.add(c + ',' + a); if (intRes) found.add(c + ',' + a); }
        V.setNote(note, intRes ? 'Cealaltă catetă e număr întreg: b = ' + b + '.' : 'Ipotenuza este mereu cea mai lungă latură, de aceea a < c.', intRes);
        if (found.n() >= 1 && seen.n() >= 4) ctx.done();
      }
    }
    function U(x) { return M.fmt(x, 2).replace(',', '.'); }
    draw(false);
    return { destroy: function () {} };
  };
})(window.M);
