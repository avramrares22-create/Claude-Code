/* Pagini: acasă (panou), cursuri (harta), unitate. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;
  ui.pages = ui.pages || {};

  /* ---------- logică comună ---------- */
  M.nextStep = function () {
    const done = M.store.get().lessons;
    for (const u of M.openUnits()) for (const l of u.lessons) if (l.screens.length && !(done[l.id] && done[l.id].done)) return { type: 'lesson', lesson: l, unit: u };
    return null;
  };
  M.reviewSkills = function (limit) {
    const ids = [];
    M.openUnits().forEach(function (u) { M.unitSkills(u).forEach(function (s) { ids.push(s); }); });
    const rows = [];
    const now = Date.now();
    ids.forEach(function (id) {
      const w = M.weakness(id), rec = M.store.get().skills[id];
      if (w === null) return;
      const days = rec.ts ? (now - rec.ts) / 86400000 : 0;
      const lvl = M.masteryLevel(id);
      let score = 0;
      if (w >= 0.25) score = w + 0.3;
      else if (lvl >= 2 && days >= 4) score = 0.2 + Math.min(0.3, days / 60);
      if (score > 0) rows.push({ id: id, score: score, w: w, days: days, lvl: lvl });
    });
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows.slice(0, limit || 5);
  };
  function greeting() { const hr = new Date().getHours(); return hr < 5 ? 'Noapte bună' : hr < 12 ? 'Bună dimineața' : hr < 18 ? 'Bună ziua' : 'Bună seara'; }
  function pct(x) { return Math.round(x * 100); }

  ui.unitCard = function (u) {
    const open = u.status === 'open';
    const tr = M.TRACKS[u.track];
    const head = h('div', { class: 'unit-head' },
      h('div', { class: 'unit-badge', 'aria-hidden': 'true' }, open ? String(u.no) : M.icon('lock', 22)),
      h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '8px', 'margin-bottom': '4px' } }, h('span', { class: 'track-tag ' + tr.cls }, tr.short), !open ? h('span', { class: 'pill' }, 'În curând') : null), h('h3', { html: M.rich(u.title) }), h('p', { class: 'muted small', style: { margin: 0 }, html: M.rich(u.blurb || '') })));
    if (open) {
      const p = M.unitProgress(u), done = M.store.get().lessons;
      const nd = u.lessons.filter(function (l) { return done[l.id] && done[l.id].done; }).length;
      return h('a', { class: 'card unit-card', href: '#/unit/' + u.id, 'aria-label': 'Unitatea ' + u.no + ': ' + u.title + ', stăpânire ' + pct(p) + '%' }, head,
        h('div', null, h('div', { class: 'bar', role: 'img', 'aria-label': 'Stăpânire ' + pct(p) + '%' }, h('i', { style: { width: pct(p) + '%' } })), h('div', { class: 'row between small muted', style: { 'margin-top': '6px' } }, h('span', null, nd + ' din ' + u.lessons.length + ' lecții terminate'), h('span', null, 'Stăpânire ' + pct(p) + '%'))));
    }
    return h('div', { class: 'card unit-card soon', 'aria-label': u.title + ', în curând' }, head,
      h('div', { class: 'lessons-preview' }, u.lessons.slice(0, 4).map(function (l) { return h('span', { class: 'pill', html: M.rich(l.title) }); }), u.lessons.length > 4 ? h('span', { class: 'pill' }, '+' + (u.lessons.length - 4)) : null));
  };

  /* ---------- acasă ---------- */
  ui.pages.home = function (view) {
    const st = M.store.get(), goal = st.settings.dailyGoal, today = M.store.xpToday();
    const page = h('div', { class: 'page' });
    const next = M.nextStep();
    const hero = h('section', { class: 'card hero rise' });
    hero.appendChild(h('div', null, h('div', { class: 'eyebrow' }, greeting()), h('h1', null, next ? 'Continuă: ' + next.lesson.title : 'Ești la zi cu lecțiile'),
      h('p', { class: 'muted' }, next ? next.lesson.goal : 'Exersează ca să-ți păstrezi nivelul sau vezi unde mai poți crește.')));
    hero.appendChild(h('div', { class: 'row' },
      next ? h('a', { class: 'btn primary', href: '#/lectie/' + next.lesson.id }, M.icon('play', 18), 'Începe lecția') : h('a', { class: 'btn primary', href: '#/exersare/u1' }, 'Exersare'),
      h('a', { class: 'btn', href: '#/exersare/u1' }, 'Exersare adaptivă')));
    hero.appendChild(h('div', { class: 'goal' }, ui.ring(today, goal, String(today), 'din ' + goal), h('div', null, h('div', { style: { 'font-weight': '700' } }, today >= goal ? 'Obiectivul de azi e atins' : 'Obiectivul zilei'), h('div', { class: 'muted small' }, 'Serie: ' + M.days(M.store.streakNow()) + ' · Total: ' + st.xp.total + ' XP'))));
    page.appendChild(hero);

    const rev = M.reviewSkills(4);
    if (rev.length) {
      page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Recapitulează'), h('a', { href: '#/zona-mea' }, 'Zona mea')));
      const box = h('div', { class: 'card stack' });
      rev.forEach(function (r) {
        box.appendChild(h('div', { class: 'row between' }, h('div', { class: 'grow' }, h('div', { style: { 'font-weight': '650' } }, M.skills[r.id].title), h('div', { class: 'small muted' }, r.w >= 0.25 ? 'Merită reluat — greșeli recente' : 'Nepracticat de ' + M.days(Math.round(r.days)))), ui.levelBadge(r.lvl)));
      });
      box.appendChild(h('a', { class: 'btn block', href: '#/recapitulare' }, M.icon('refresh', 18), 'Începe recapitularea'));
      page.appendChild(box);
    }

    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Cursul tău'), h('a', { href: '#/cursuri' }, 'Toate cursurile')));
    page.appendChild(ui.unitCard(M.unitById('u1')));
    const soon = M.units.filter(function (u) { return u.status !== 'open'; }).slice(0, 3);
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Urmează'), h('a', { href: '#/cursuri' }, 'Vezi harta completă')));
    soon.forEach(function (u) { page.appendChild(ui.unitCard(u)); });
    view.appendChild(page);
  };

  /* ---------- cursuri ---------- */
  ui.pages.courses = function (view) {
    const page = h('div', { class: 'page' });
    page.appendChild(h('h1', null, 'Cursuri'));
    page.appendChild(h('p', { class: 'muted' }, 'Programa oficială de clasa a VII-a, urmată de pregătire pentru clasa a VIII-a și Evaluarea Națională, și teme pentru olimpiadă. Unitățile „În curând” se adaugă prin fișiere de date.'));
    ['7', '8', 'o'].forEach(function (t) {
      const us = M.units.filter(function (u) { return u.track === t; });
      if (!us.length) return;
      page.appendChild(h('div', { class: 'section-title' }, h('h2', null, M.TRACKS[t].name)));
      us.forEach(function (u) { page.appendChild(ui.unitCard(u)); });
    });
    view.appendChild(page);
  };

  /* ---------- unitate ---------- */
  ui.pages.unit = function (view, id) {
    const u = M.unitById(id);
    if (!u) { M.nav.go('/cursuri'); return; }
    const page = h('div', { class: 'page' });
    const done = M.store.get().lessons;
    const p = M.unitProgress(u);
    page.appendChild(h('a', { class: 'btn ghost sm', href: '#/cursuri', style: { 'margin-left': '-10px' } }, M.icon('back', 18), 'Cursuri'));
    page.appendChild(h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'track-tag ' + M.TRACKS[u.track].cls }, M.TRACKS[u.track].short), h('span', { class: 'muted small' }, 'Unitatea ' + u.no)));
    page.appendChild(h('h1', { html: M.rich(u.title) }));
    page.appendChild(h('p', { class: 'muted' }, u.blurb));
    if (u.status !== 'open') {
      page.appendChild(h('div', { class: 'fb info' }, M.icon('lock'), h('div', null, h('b', { class: 't' }, 'În curând'), h('div', { class: 'why' }, 'Lecțiile acestei unități nu sunt încă gata. Se adaugă prin fișiere de date — vezi GHID.md.'))));
      view.appendChild(page); return;
    }
    page.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('b', null, 'Stăpânire a unității'), h('span', { class: 'muted' }, pct(p) + '%')), h('div', { class: 'bar', style: { 'margin-top': '10px' } }, h('i', { style: { width: pct(p) + '%' } })),
      h('div', { class: 'row', style: { 'margin-top': '14px' } }, h('a', { class: 'btn', href: '#/exersare/' + u.id }, 'Exersare adaptivă'), h('a', { class: 'btn', href: '#/test/' + u.id }, 'Test de unitate'), (M.store.get().tests[u.id] ? h('span', { class: 'chip soft' }, 'Ultimul test: ' + M.store.get().tests[u.id].last + '%') : null))));
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Lecții')));
    const nxt = M.nextStep();
    const list = h('div', { class: 'lesson-list' });
    u.lessons.forEach(function (l, i) {
      const d = done[l.id] && done[l.id].done;
      const isNext = nxt && nxt.lesson.id === l.id;
      const lp = M.lessonProgress(l);
      list.appendChild(h('a', { class: 'lesson-row' + (d ? ' done' : '') + (isNext ? ' next' : ''), href: '#/lectie/' + l.id },
        h('div', { class: 'n', 'aria-hidden': 'true' }, d ? M.icon('check', 20) : String(i + 1)),
        h('div', { class: 'grow' }, h('h3', null, l.title), h('p', null, l.goal), h('div', { class: 'bar thin', style: { 'margin-top': '8px' }, role: 'img', 'aria-label': 'Stăpânire ' + pct(lp) + '%' }, h('i', { style: { width: pct(lp) + '%' } }))),
        h('span', { class: 'muted' }, M.icon('arrow', 20))));
    });
    page.appendChild(list);
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Abilități și nivel'), h('a', { href: '#/despre' }, 'Cum se calculează?')));
    u.lessons.forEach(function (l) {
      page.appendChild(h('h3', { style: { 'margin-top': '16px' } }, l.title));
      const sk = h('div', { class: 'skill-list' });
      l.skills.forEach(function (sid) {
        const lvl = M.masteryLevel(sid), rec = M.store.get().skills[sid];
        const acc = rec && rec.att ? Math.round(100 * rec.cor / rec.att) : null;
        sk.appendChild(h('a', { class: 'skill-row', href: '#/skill/' + encodeURIComponent(sid), style: { 'text-decoration': 'none', color: 'inherit' }, 'aria-label': M.skills[sid].title + ', nivel ' + M.LEVELS[lvl].name }, h('div', null, h('div', { style: { 'font-weight': '650' } }, M.skills[sid].title), h('div', { class: 'small muted' }, acc === null ? 'Neîncercată' : rec.att + ' exerciții · ' + acc + '% corecte')), ui.levelBadge(lvl), h('div', { class: 'bar thin' }, h('i', { style: { width: (lvl * 25) + '%' } }))));
      });
      page.appendChild(sk);
    });
    page.appendChild(h('div', { class: 'card flat small muted', style: { 'margin-top': '20px' } }, h('b', null, 'Nivelurile: '), M.LEVEL_RULES.join(' ')));
    view.appendChild(page);
  };
})(window.M);
