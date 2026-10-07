/* Figuri geometrice ca date (fără DOM). Randate de js/visuals/figure.js.
   Culori după rol, peste tot la fel: cateta 1 = a (albastru), cateta 2 = b (portocaliu), ipotenuza = c (violet),
   înălțime / unghi drept = h (verde-turcoaz), necunoscută = x, neutru = n.
   Specificație: {pts:{A:[x,y]}, polys:[{ids,fill}], segs:[{a,b,label,col,dash}], rights:[{at,p,q}], squares:[{a,b,label,col}], grid:{x:[..],y:[..]}} */
(function (M) {
  'use strict';
  const F = {};
  function lbl(L, x, y) { L = L || {}; const v = L[x + y] !== undefined ? L[x + y] : L[y + x]; return v === undefined ? '' : String(v); }
  function col(L, x, y, c) { const v = lbl(L, x, y); return v.charAt(0) === '?' ? 'x' : c; }
  function seg(a, b, L, c, dash) { return { a: a, b: b, label: lbl(L, a, b), col: col(L, a, b, c), dash: !!dash }; }

  /* Triunghi dreptunghic: vârful names[0] are unghiul drept; names[1] pe orizontală, names[2] pe verticală. */
  F.rt = function (leg1, leg2, L, names) {
    names = names || ['A', 'B', 'C'];
    const P = names[0], Q = names[1], R = names[2];
    const pts = {}; pts[P] = [0, 0]; pts[Q] = [leg1, 0]; pts[R] = [0, leg2];
    return {
      pts: pts, polys: [{ ids: [P, Q, R], fill: true }],
      segs: [seg(P, Q, L, 'a'), seg(P, R, L, 'b'), seg(Q, R, L, 'c')],
      rights: [{ at: P, p: Q, q: R }],
    };
  };

  /* Triunghi dreptunghic cu pătrate pe laturi: etichete = arii */
  F.rtSquares = function (a, b, areas) {
    const f = F.rt(a, b, null, ['A', 'B', 'C']);
    f.segs.forEach(function (s) { s.label = ''; });
    f.squares = [
      { a: 'A', b: 'B', label: String(areas[0]), col: 'a' },
      { a: 'C', b: 'A', label: String(areas[1]), col: 'b' },
      { a: 'B', b: 'C', label: String(areas[2]), col: 'c' },
    ];
    f.sideSquares = true;
    return f;
  };

  F.rect = function (w, h, L, diag) {
    return {
      pts: { A: [0, 0], B: [w, 0], C: [w, h], D: [0, h] }, polys: [{ ids: ['A', 'B', 'C', 'D'], fill: true }],
      segs: [seg('A', 'B', L, 'a'), seg('B', 'C', L, 'b'), seg('C', 'D', L, 'n'), seg('D', 'A', L, 'n')].concat(diag === false ? [] : [seg('A', 'C', L, 'c', true)]),
      rights: [{ at: 'B', p: 'A', q: 'C' }],
    };
  };
  F.square = function (s, L) {
    const f = F.rect(s, s, L, true);
    f.segs[1].col = f.segs[1].label.charAt(0) === '?' ? 'x' : 'b';
    return f;
  };

  /* Triunghi isoscel ABC (AB = AC), înălțimea AD pe baza BC */
  F.iso = function (base, height, L) {
    const hb = base / 2;
    return {
      pts: { B: [-hb, 0], C: [hb, 0], A: [0, height], D: [0, 0] }, polys: [{ ids: ['A', 'B', 'C'], fill: true }],
      segs: [seg('B', 'D', L, 'a'), seg('D', 'C', L, 'n'), seg('A', 'D', L, 'b', true), seg('A', 'B', L, 'c'), seg('A', 'C', L, 'n')],
      rights: [{ at: 'D', p: 'B', q: 'A' }],
    };
  };

  /* Romb: diagonale perpendiculare în O. Etichetele diagonalelor stau lângă capete (t), ca să nu se suprapună. */
  F.rhomb = function (d1, d2, L) {
    const ac = seg('A', 'C', L, 'n', true); ac.t = 0.14;
    const bd = seg('B', 'D', L, 'n', true); bd.t = 0.14; bd.side = -1;
    const ao = seg('A', 'O', null, 'a', true), ob = seg('O', 'B', null, 'b', true);
    return {
      pts: { A: [-d1 / 2, 0], C: [d1 / 2, 0], B: [0, d2 / 2], D: [0, -d2 / 2], O: [0, 0] }, polys: [{ ids: ['A', 'B', 'C', 'D'], fill: true }],
      segs: [ac, bd, ao, ob, seg('A', 'B', L, 'c'), seg('B', 'C', L, 'n'), seg('C', 'D', L, 'n'), seg('D', 'A', L, 'n')],
      rights: [{ at: 'O', p: 'A', q: 'B' }],
      noDot: ['O'],
    };
  };

  /* Trapez dreptunghic: AD ⟂ AB (înălțimea), BC latura oblică; CE ⟂ AB ajutător */
  F.trapRight = function (Bb, bb, height, L) {
    return {
      pts: { A: [0, 0], B: [Bb, 0], C: [bb, height], D: [0, height], E: [bb, 0] }, polys: [{ ids: ['A', 'B', 'C', 'D'], fill: true }],
      segs: [seg('A', 'B', L, 'n'), seg('D', 'C', L, 'n'), seg('A', 'D', L, 'b'), seg('B', 'C', L, 'c'), seg('C', 'E', L, 'b', true), seg('E', 'B', L, 'a', true)],
      rights: [{ at: 'A', p: 'B', q: 'D' }, { at: 'E', p: 'B', q: 'C' }],
      noDot: ['E'],
    };
  };

  /* Scara alunecă: două poziții */
  F.slip = function (d1, h1, d2, h2, L) {
    const g1 = seg('P', 'F', L, 'a'); g1.side = -1;
    const g2 = seg('F', 'G', L, 'n', true); g2.side = -1;
    return {
      scene: 'ladder',
      pts: { P: [0, 0], T: [0, h1], F: [d1, 0], G: [d2, 0], U: [0, h2] }, polys: [],
      segs: [seg('P', 'T', L, 'b'), g1, g2, seg('F', 'T', L, 'c'), seg('G', 'U', L, 'c', true)],
      rights: [{ at: 'P', p: 'G', q: 'T' }],
      noDot: ['P', 'T', 'F', 'G', 'U'],
    };
  };

  /* Trapez ABCD cu bazele AB (mare, jos) și DC (mică, sus); înălțimea DE cade pe AB. dx = proiecția piciorului stâng. */
  F.trap = function (Bb, bb, height, dxLeft, L) {
    const pts = { A: [0, 0], B: [Bb, 0], C: [dxLeft + bb, height], D: [dxLeft, height], E: [dxLeft, 0] };
    return {
      pts: pts, polys: [{ ids: ['A', 'B', 'C', 'D'], fill: true }],
      segs: [seg('A', 'B', L, 'n'), seg('D', 'C', L, 'n'), seg('A', 'D', L, 'c'), seg('B', 'C', L, 'n'), seg('D', 'E', L, 'b', true), seg('A', 'E', L, 'a', true)],
      rights: [{ at: 'E', p: 'A', q: 'D' }],
    };
  };

  /* Puncte în plan: A(x1,y1), B(x2,y2) și triunghiul dreptunghic ajutător */
  F.coord = function (p1, p2) {
    const xs = [p1[0], p2[0], 0], ys = [p1[1], p2[1], 0];
    const x0 = Math.min.apply(null, xs) - 1, x1 = Math.max.apply(null, xs) + 1;
    const y0 = Math.min.apply(null, ys) - 1, y1 = Math.max.apply(null, ys) + 1;
    const pts = { A: p1.slice(), B: p2.slice(), K: [p2[0], p1[1]] };
    return {
      pts: pts, grid: { x: [x0, x1], y: [y0, y1] }, polys: [],
      segs: [{ a: 'A', b: 'K', label: '', col: 'a', dash: true }, { a: 'K', b: 'B', label: '', col: 'b', dash: true }, { a: 'A', b: 'B', label: '?', col: 'x' }],
      rights: [{ at: 'K', p: 'A', q: 'B' }],
      noDot: ['K'],
      coordLabels: { A: 'A(' + p1[0] + ', ' + p1[1] + ')', B: 'B(' + p2[0] + ', ' + p2[1] + ')' },
    };
  };

  /* Scară sprijinită de perete */
  F.ladder = function (d, h, L, kind) {
    return {
      scene: kind || 'ladder',
      pts: { P: [0, 0], T: [0, h], F: [d, 0] }, polys: [],
      segs: [seg('P', 'F', L, 'a'), seg('P', 'T', L, 'b'), seg('F', 'T', L, 'c')],
      rights: [{ at: 'P', p: 'F', q: 'T' }],
      noDot: ['P', 'T', 'F'],
    };
  };

  /* Înălțimea din unghiul drept: A = 90°, ipotenuza BC, D piciorul înălțimii */
  F.hgt = function (p, q, L) {
    const h = Math.sqrt(p * q);
    return {
      pts: { B: [0, 0], C: [p + q, 0], A: [p, h], D: [p, 0] }, polys: [{ ids: ['A', 'B', 'C'], fill: true }],
      segs: [seg('B', 'D', L, 'a'), seg('D', 'C', L, 'b'), seg('A', 'D', L, 'h', true), seg('A', 'B', L, 'n'), seg('A', 'C', L, 'n')],
      rights: [{ at: 'A', p: 'B', q: 'C' }, { at: 'D', p: 'B', q: 'A' }],
    };
  };

  /* Patrulater compus din două triunghiuri dreptunghice: ABC (B=90°) și ACD (C=90°) */
  F.chain = function (ab, bc, cd, L) {
    const ac = Math.sqrt(ab * ab + bc * bc);
    /* B=(0,0), A=(0,ab) , C=(bc,0); D = C + cd * unit perpendicular to AC (away from B) */
    const vx = ab / ac, vy = bc / ac;       // direction perpendicular to AC pointing away from B: (ab,bc)/ac
    const D = [bc + cd * vx, 0 + cd * vy];
    return {
      pts: { A: [0, ab], B: [0, 0], C: [bc, 0], D: D },
      polys: [{ ids: ['A', 'B', 'C', 'D'], fill: true }],
      segs: [seg('A', 'B', L, 'a'), seg('B', 'C', L, 'b'), seg('C', 'D', L, 'n'), seg('D', 'A', L, 'c'), seg('A', 'C', L, 'n', true)],
      rights: [{ at: 'B', p: 'A', q: 'C' }, { at: 'C', p: 'A', q: 'D' }],
    };
  };

  /* Teren dreptunghiular cu două trasee */
  F.field = function (w, h, L) {
    const f = F.rect(w, h, L, true);
    f.field = true;
    return f;
  };

  M.fig = F;
})(window.M);
