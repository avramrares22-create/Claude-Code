/* Randarea figurilor geometrice (SVG) din specificațiile produse de js/engine/figures.js. */
(function (M) {
  'use strict';
  const h = M.h, s = M.s;

  function describe(spec) {
    const parts = [];
    (spec.segs || []).forEach(function (sg) { if (sg.label) parts.push(sg.a + sg.b + ' = ' + (sg.label.charAt(0) === '?' ? 'necunoscută' : sg.label)); });
    (spec.squares || []).forEach(function (q) { parts.push('pătratul de pe ' + q.a + q.b + ' are aria ' + (q.label === '?' ? 'necunoscută' : q.label)); });
    return 'Figură geometrică. ' + (parts.length ? parts.join('; ') + '.' : '');
  }

  M.renderFigure = function (spec, o) {
    o = o || {};
    const W = o.w || 340, H = o.h || 250, pad = o.pad || 38;
    const root = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'fig', role: 'img', 'aria-label': describe(spec), preserveAspectRatio: 'xMidYMid meet' });

    /* ---- geometrie în coordonate matematice ---- */
    const names = Object.keys(spec.pts);
    const P = {}; names.forEach(function (k) { P[k] = { x: spec.pts[k][0], y: spec.pts[k][1] }; });
    const poly = (spec.polys && spec.polys[0] && spec.polys[0].ids) || names;
    let cx = 0, cy = 0;
    poly.forEach(function (k) { cx += P[k].x; cy += P[k].y; });
    cx /= poly.length; cy /= poly.length;

    /* pătrate pe laturi (construite spre exterior) */
    const squares = [];
    (spec.squares || []).forEach(function (q) {
      const a = P[q.a], b = P[q.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      let nx = -dy, ny = dx;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      squares.push({ q: q, pts: [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }] });
    });

    /* limite */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const grow = function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); };
    names.forEach(function (k) { grow(P[k]); });
    squares.forEach(function (sq) { sq.pts.forEach(grow); });
    if (spec.grid) { grow({ x: spec.grid.x[0], y: spec.grid.y[0] }); grow({ x: spec.grid.x[1], y: spec.grid.y[1] }); }
    if (o.bounds) { minX = o.bounds.minX; maxX = o.bounds.maxX; minY = o.bounds.minY; maxY = o.bounds.maxY; }
    root.__bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    const bw = Math.max(maxX - minX, 1e-6), bh = Math.max(maxY - minY, 1e-6);
    const k = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
    const ox = (W - bw * k) / 2 - minX * k, oy = (H - bh * k) / 2 + maxY * k;
    const X = function (x) { return ox + x * k; };
    const Y = function (y) { return oy - y * k; };
    const sp = function (p) { return { x: X(p.x), y: Y(p.y) }; };
    const C = sp({ x: cx, y: cy });

    /* ---- grilă și axe ---- */
    if (spec.grid) {
      const g = spec.grid;
      const gg = s('g', { class: 'fig-grid', 'aria-hidden': 'true' });
      for (let x = Math.ceil(g.x[0]); x <= g.x[1]; x++) gg.appendChild(s('line', { x1: X(x), y1: Y(g.y[0]), x2: X(x), y2: Y(g.y[1]), class: x === 0 ? 'axis' : 'gl' }));
      for (let y = Math.ceil(g.y[0]); y <= g.y[1]; y++) gg.appendChild(s('line', { x1: X(g.x[0]), y1: Y(y), x2: X(g.x[1]), y2: Y(y), class: y === 0 ? 'axis' : 'gl' }));
      for (let x = Math.ceil(g.x[0]); x <= g.x[1]; x++) if (x !== 0 && (g.x[1] - g.x[0] <= 14 || x % 2 === 0)) gg.appendChild(s('text', { x: X(x), y: Y(0) + 13, class: 'tick', 'text-anchor': 'middle' }, String(x)));
      for (let y = Math.ceil(g.y[0]); y <= g.y[1]; y++) if (y !== 0 && (g.y[1] - g.y[0] <= 14 || y % 2 === 0)) gg.appendChild(s('text', { x: X(0) - 5, y: Y(y) + 4, class: 'tick', 'text-anchor': 'end' }, String(y)));
      root.appendChild(gg);
    }

    /* ---- scene decorative ---- */
    if (spec.scene && P.P) {
      const g = s('g', { class: 'fig-scene', 'aria-hidden': 'true' });
      const p0 = sp(P.P), t = P.T ? sp(P.T) : p0, f = P.F ? sp(P.F) : p0;
      const far = Math.max(f.x, P.G ? sp(P.G).x : 0) + 18;
      g.appendChild(s('line', { x1: p0.x - 24, y1: p0.y, x2: far, y2: p0.y, class: 'ground' }));
      if (spec.scene === 'ladder') {
        g.appendChild(s('rect', { x: p0.x - 14, y: t.y - 14, width: 14, height: p0.y - t.y + 14, class: 'wall' }));
      } else if (spec.scene === 'cable') {
        g.appendChild(s('circle', { cx: t.x, cy: t.y - 1, r: 4, class: 'pole-top' }));
      } else if (spec.scene === 'kite') {
        g.appendChild(s('path', { d: 'M' + t.x + ' ' + (t.y - 11) + 'l8 11l-8 11l-8 -11z', class: 'kite' }));
        g.appendChild(s('circle', { cx: f.x, cy: f.y - 15, r: 5, class: 'person' }));
        g.appendChild(s('line', { x1: f.x, y1: f.y - 10, x2: f.x, y2: f.y - 2, class: 'person-line' }));
      }
      root.appendChild(g);
    }

    /* ---- poligoane ---- */
    (spec.polys || []).forEach(function (pl) {
      const d = pl.ids.map(function (id, i) { const q = sp(P[id]); return (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('') + 'Z';
      root.appendChild(s('path', { d: d, class: 'fig-poly' + (pl.fill ? ' fill' : '') }));
    });

    /* ---- pătrate pe laturi ---- */
    squares.forEach(function (sq) {
      const pts = sq.pts.map(sp);
      const d = pts.map(function (q, i) { return (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join('') + 'Z';
      root.appendChild(s('path', { d: d, class: 'fig-sq sq-' + sq.q.col }));
      if (spec.sqGrid) {
        const A0 = sq.pts[0], B0 = sq.pts[1], D0 = sq.pts[3];
        const len = Math.hypot(B0.x - A0.x, B0.y - A0.y);
        const u = { x: (B0.x - A0.x) / len, y: (B0.y - A0.y) / len }, v = { x: (D0.x - A0.x) / len, y: (D0.y - A0.y) / len };
        let gd = '';
        for (let i = 1; i < len - 1e-9; i++) {
          const p1 = sp({ x: A0.x + u.x * i, y: A0.y + u.y * i }), p2 = sp({ x: A0.x + u.x * i + v.x * len, y: A0.y + u.y * i + v.y * len });
          const p3 = sp({ x: A0.x + v.x * i, y: A0.y + v.y * i }), p4 = sp({ x: A0.x + v.x * i + u.x * len, y: A0.y + v.y * i + u.y * len });
          gd += 'M' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + 'L' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1) + 'M' + p3.x.toFixed(1) + ' ' + p3.y.toFixed(1) + 'L' + p4.x.toFixed(1) + ' ' + p4.y.toFixed(1);
        }
        if (gd) root.appendChild(s('path', { d: gd, class: 'fig-sqgrid sq-' + sq.q.col }));
      }
      const mx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, my = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
      const unknown = String(sq.q.label).charAt(0) === '?';
      root.appendChild(s('text', { x: mx, y: my + 5, class: 'fig-label t-' + (unknown ? 'x' : sq.q.col) + ' big', 'text-anchor': 'middle' }, String(sq.q.label)));
    });

    /* ---- segmente ---- */
    const labelLayer = s('g', { class: 'fig-labels' });
    (spec.segs || []).forEach(function (sg) {
      const a = sp(P[sg.a]), b = sp(P[sg.b]);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) return;
      root.appendChild(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'fig-seg c-' + sg.col + (sg.dash ? ' dash' : '') }));
      if (sg.label) {
        const t = sg.t === undefined ? 0.5 : sg.t;
        const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        let nx = -dy / len, ny = dx / len;
        const out = (px - C.x) * nx + (py - C.y) * ny;
        if (sg.side) { if ((sg.side > 0) !== (out >= 0)) { nx = -nx; ny = -ny; } }
        else if (out < 0) { nx = -nx; ny = -ny; }
        const off = String(sg.label).length > 4 ? 15 : 13;
        const unknown = String(sg.label).charAt(0) === '?';
        labelLayer.appendChild(s('text', { x: px + nx * off, y: py + ny * off + 5, class: 'fig-label t-' + (unknown ? 'x' : sg.col), 'text-anchor': 'middle' }, String(sg.label)));
      }
    });

    /* ---- unghiuri drepte ---- */
    (spec.rights || []).forEach(function (r) {
      const v = sp(P[r.at]), a = sp(P[r.p]), b = sp(P[r.q]);
      const m = 11;
      const ua = { x: a.x - v.x, y: a.y - v.y }, ub = { x: b.x - v.x, y: b.y - v.y };
      const la = Math.hypot(ua.x, ua.y) || 1, lb = Math.hypot(ub.x, ub.y) || 1;
      ua.x = ua.x / la * m; ua.y = ua.y / la * m; ub.x = ub.x / lb * m; ub.y = ub.y / lb * m;
      root.appendChild(s('path', { d: 'M' + (v.x + ua.x) + ' ' + (v.y + ua.y) + 'L' + (v.x + ua.x + ub.x) + ' ' + (v.y + ua.y + ub.y) + 'L' + (v.x + ub.x) + ' ' + (v.y + ub.y), class: 'fig-right' }));
    });

    /* ---- puncte și nume ---- */
    const skip = {}; (spec.noDot || []).forEach(function (n) { skip[n] = true; });
    names.forEach(function (n) {
      if (skip[n]) return;
      const q = sp(P[n]);
      root.appendChild(s('circle', { cx: q.x, cy: q.y, r: 3.2, class: 'fig-dot' }));
      let vx = q.x - C.x, vy = q.y - C.y;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l; vy /= l;
      const txt = spec.coordLabels && spec.coordLabels[n] ? spec.coordLabels[n] : n;
      labelLayer.appendChild(s('text', { x: q.x + vx * (txt.length > 2 ? 24 : 13), y: q.y + vy * 13 + 5, class: 'fig-name', 'text-anchor': 'middle' }, txt));
    });
    root.appendChild(labelLayer);
    return root;
  };

  /* limitele (în coordonate matematice) ale unei figuri — folosite pentru scară fixă */
  M.figureBounds = function (spec, o) { return M.renderFigure(spec, o || {}).__bounds; };

  M.figureBox = function (spec, o) { return h('figure', { class: 'figure' }, M.renderFigure(spec, o)); };
})(window.M);
