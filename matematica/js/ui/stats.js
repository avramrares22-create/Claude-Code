/* „Zona mea”: puncte slabe, greșeli frecvente, activitate. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;
  ui.pages = ui.pages || {};

  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(M.todayStr(d)); }
    return out;
  }

  ui.pages.stats = function (view) {
    const st = M.store.get();
    const page = h('div', { class: 'page' });
    const ids = M.allSkills().filter(function (id) { return M.skills[id] && M.unitById(M.skills[id].unit).status === 'open'; });
    let att = 0, cor = 0; ids.forEach(function (id) { const r = st.skills[id]; if (r) { att += r.att; cor += r.cor; } });
    page.appendChild(h('h1', null, 'Zona mea'));
    page.appendChild(h('p', { class: 'muted' }, 'Aici vezi unde ești puternic și unde mai ai de lucrat. Poți genera exerciții doar pe punctele slabe.'));

    page.appendChild(h('div', { class: 'stat-grid' },
      stat(att ? Math.round(100 * cor / att) + '%' : '—', 'exerciții corecte'), stat(String(att), 'exerciții rezolvate'), stat(String(st.xp.total), 'XP în total'), stat(String(M.store.streakNow()), M.store.streakNow() === 1 ? 'zi la rând' : 'zile la rând')));

    /* distribuția nivelurilor */
    const dist = [0, 0, 0, 0, 0];
    ids.forEach(function (id) { dist[M.masteryLevel(id)]++; });
    const colors = ['var(--border-strong)', '#6ea0e8', 'var(--ch)', 'var(--ok)', '#d79a00'];
    const seg = h('div', { style: { display: 'flex', height: '14px', 'border-radius': '999px', overflow: 'hidden', background: 'var(--surface-2)' }, role: 'img', 'aria-label': 'Distribuția nivelurilor: ' + dist.map(function (n, i) { return M.LEVELS[i].name + ' ' + n; }).join(', ') });
    dist.forEach(function (n, i) { if (n) seg.appendChild(h('i', { style: { width: (100 * n / ids.length) + '%', background: colors[i] } })); });
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Nivelul tău pe abilități')));
    page.appendChild(h('div', { class: 'card' }, seg, h('div', { class: 'legend', style: { 'justify-content': 'flex-start', 'margin-top': '12px' } }, dist.map(function (n, i) { return h('span', null, h('i', { style: { background: colors[i] } }), M.LEVELS[i].name + ': ' + n); }))));

    /* puncte slabe */
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Puncte slabe')));
    const weak = M.weakSkills(ids, 8);
    if (!weak.length) {
      page.appendChild(h('div', { class: 'card flat' }, att < 8 ? 'Rezolvă câteva exerciții și aici vor apărea abilitățile la care greșești cel mai des.' : 'Nu ai puncte slabe evidente acum. Continuă cu lecții noi sau cu un test de unitate.'));
    } else {
      weak.forEach(function (r) {
        const rec = st.skills[r.id], acc = Math.round(100 * rec.cor / rec.att);
        const rc = rec.recent, rcc = rc.reduce(function (a, b) { return a + b; }, 0);
        const top = Object.keys(rec.mistakes || {}).filter(function (k) { return M.mistakeCategory(k) !== 'other'; }).sort(function (a, b) { return rec.mistakes[b] - rec.mistakes[a]; })[0];
        page.appendChild(h('div', { class: 'weak-item' },
          h('div', { class: 'row between' }, h('div', { class: 'grow' }, h('div', { style: { 'font-weight': '650' } }, M.skills[r.id].title), h('div', { class: 'small muted' }, 'Ultimele ' + rc.length + ' răspunsuri: ' + rcc + ' corecte · în total ' + acc + '%')), ui.levelBadge(r.lvl)),
          h('div', { class: 'meter' }, h('div', { class: 'bar' }, h('i', { style: { width: Math.round(r.w * 100) + '%' } })), h('span', { class: 'small muted', style: { 'min-width': '4.4em', 'text-align': 'right' } }, 'risc ' + Math.round(r.w * 100) + '%')),
          top ? h('div', { class: 'small', html: '<b>Greșeala tipică:</b> ' + M.rich(M.mistakeCats[M.mistakeCategory(top)].title) }) : null,
          h('div', { class: 'row' }, h('a', { class: 'btn sm', href: '#/skill/' + encodeURIComponent(r.id) }, 'Exersează asta'))));
      });
      page.appendChild(h('a', { class: 'btn primary block', href: '#/puncte-slabe', style: { 'margin-top': '14px' } }, M.icon('target', 20), 'Exersează punctele slabe (10 exerciții)'));
    }

    /* greșeli frecvente pe categorii */
    const stats = M.mistakeStats();
    const cats = {};
    stats.forEach(function (m) { const c = M.mistakeCategory(m.tag); cats[c] = (cats[c] || 0) + m.n; });
    const catRows = Object.keys(cats).filter(function (c) { return c !== 'other'; }).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 5);
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Greșeli frecvente')));
    if (!catRows.length) page.appendChild(h('div', { class: 'card flat' }, 'Încă nu avem destule răspunsuri greșite ca să vedem un tipar. Asta e o veste bună.'));
    else {
      const totalM = catRows.reduce(function (a, c) { return a + cats[c]; }, 0);
      catRows.forEach(function (c) {
        page.appendChild(h('div', { class: 'card stack', style: { 'margin-top': '10px' } },
          h('div', { class: 'row between' }, h('b', null, M.mistakeCats[c].title), h('span', { class: 'chip' }, cats[c] + '×')),
          h('div', { class: 'bar thin' }, h('i', { style: { width: Math.round(100 * cats[c] / totalM) + '%', background: 'var(--cb)' } })),
          h('div', { class: 'small', html: M.rich(M.mistakeCats[c].tip) })));
      });
    }

    /* activitate pe zile */
    const days = lastDays(14);
    const by = {}; days.forEach(function (d) { by[d] = { n: 0, c: 0 }; });
    st.history.forEach(function (e) { const d = M.todayStr(new Date(e.ts)); if (by[d]) { by[d].n++; by[d].c += e.ok; } });
    const max = Math.max(5, Math.max.apply(null, days.map(function (d) { return by[d].n; })));
    const W = 340, H = 120, bw = W / days.length;
    const svg = M.s('svg', { viewBox: '0 0 ' + W + ' ' + (H + 22), class: 'chart', role: 'img', 'aria-label': 'Exerciții rezolvate în ultimele 14 zile: ' + days.map(function (d) { return d.slice(5) + ' ' + by[d].n; }).join(', ') });
    svg.appendChild(M.s('line', { x1: 0, x2: W, y1: H, y2: H, class: 'axis-line' }));
    days.forEach(function (d, i) {
      const hh = by[d].n ? Math.max(4, by[d].n / max * (H - 8)) : 0;
      svg.appendChild(M.s('rect', { x: i * bw + 4, y: H - hh, width: bw - 8, height: hh, rx: 4, class: 'bar-rect' + (i === days.length - 1 ? ' today' : '') }));
      if (i % 2 === 1 || i === days.length - 1) svg.appendChild(M.s('text', { x: i * bw + bw / 2, y: H + 15, 'text-anchor': 'middle' }, d.slice(8) + '.' + d.slice(5, 7)));
    });
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Ultimele 14 zile')));
    page.appendChild(h('div', { class: 'card' }, svg, h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'Exerciții rezolvate pe zi (ultimele 600 de răspunsuri păstrate).')));
    view.appendChild(page);
  };
  function stat(v, k) { return h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k)); }
})(window.M);
