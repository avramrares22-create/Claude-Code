/* Aplicația: router pe hash, cadrul (navigație, bară de sus), pornire. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;
  let current = null;

  M.nav = {
    go: function (path) { const t = '#' + path; if (location.hash === t) route(); else location.hash = t; },
    reload: route,
  };

  const NAV = [
    ['/', 'Acasă', 'home'], ['/cursuri', 'Cursuri', 'map'], ['/zona-mea', 'Zona mea', 'chart'], ['/studio', 'Studio AI', 'spark'], ['/setari', 'Setări', 'gear'],
  ];

  function navKey(path) {
    if (path === '/' || path === '') return '/';
    if (/^\/(cursuri|unit)/.test(path)) return '/cursuri';
    if (/^\/(zona-mea)/.test(path)) return '/zona-mea';
    if (/^\/studio/.test(path)) return '/studio';
    if (/^\/(setari|despre)/.test(path)) return '/setari';
    return '';
  }

  function buildChrome() {
    const rail = document.getElementById('rail'), tabbar = document.getElementById('tabbar');
    const brand = function () { return h('a', { class: 'brand', href: '#/', 'aria-label': 'Matematică, acasă' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '∑'), h('span', null, 'Matematică')); };
    rail.appendChild(brand());
    NAV.forEach(function (n) {
      [rail, tabbar].forEach(function (host) { host.appendChild(h('a', { class: 'tab', href: '#' + n[0], 'data-k': n[0] }, M.icon(n[2]), h('span', null, n[1]))); });
    });
  }

  function renderTopbar() {
    const bar = document.getElementById('topbar');
    M.clear(bar);
    const st = M.store.get();
    const brand = h('a', { class: 'brand', href: '#/', 'aria-label': 'Acasă' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '∑'), h('span', null, 'Matematică'));
    const snd = h('button', { class: 'btn ghost icon-btn', type: 'button', 'aria-label': st.settings.sound ? 'Oprește sunetele' : 'Pornește sunetele', 'aria-pressed': String(!!st.settings.sound), on: { click: function () { M.store.update(function (s) { s.settings.sound = !s.settings.sound; }); if (M.store.get().settings.sound) M.sound.ok(); renderTopbar(); } } }, M.icon(st.settings.sound ? 'sound' : 'mute', 22));
    bar.appendChild(brand);
    bar.appendChild(h('div', { class: 'stats-row' },
      h('span', { class: 'chip flame', title: 'Zile la rând', 'aria-label': 'Serie: ' + M.days(M.store.streakNow()) }, M.icon('flame', 16), String(M.store.streakNow())),
      h('span', { class: 'chip xp', 'aria-label': 'Puncte azi: ' + M.store.xpToday() + ' din ' + st.settings.dailyGoal }, M.icon('star', 16), M.store.xpToday() + '/' + st.settings.dailyGoal),
      snd));
  }

  const ROUTES = [
    [/^\/?$/, function (v) { ui.pages.home(v); }, 'Acasă'],
    [/^\/cursuri$/, function (v) { ui.pages.courses(v); }, 'Cursuri'],
    [/^\/unit\/([\w-]+)$/, function (v, id) { ui.pages.unit(v, id); }, 'Unitate'],
    [/^\/zona-mea$/, function (v) { ui.pages.stats(v); }, 'Zona mea'],
    [/^\/studio$/, function (v) { ui.pages.studio(v); }, 'Studio AI'],
    [/^\/setari$/, function (v) { ui.pages.settings(v); }, 'Setări'],
    [/^\/despre$/, function (v) { ui.pages.about(v); }, 'Despre'],
    [/^\/lectie\/([\w-]+)$/, function (v, id) { current = ui.lessonPlayer(v, id); }, 'Lecție', true],
    [/^\/exersare\/([\w-]+)$/, function (v, id) {
      const u = M.unitById(id); if (!u) return M.nav.go('/cursuri');
      current = ui.sessionView(v, { mode: 'practice', skills: M.unitSkills(u), count: 10, title: 'Exersare', back: '/unit/' + id, again: '/exersare/' + id });
    }, 'Exersare', true],
    [/^\/skill\/([^/]+)$/, function (v, sid) {
      sid = decodeURIComponent(sid); const sk = M.skills[sid]; if (!sk) return M.nav.go('/cursuri');
      current = ui.sessionView(v, { mode: 'practice', skills: [sid], count: 8, title: sk.title, back: '/unit/' + sk.unit, again: '/skill/' + encodeURIComponent(sid) });
    }, 'Exersare', true],
    [/^\/test\/([\w-]+)$/, function (v, id) { ui.pages.testIntro(v, id); }, 'Test'],
    [/^\/test\/([\w-]+)\/start$/, function (v, id) {
      const u = M.unitById(id); if (!u) return M.nav.go('/cursuri');
      const sk = M.unitSkills(u);
      current = ui.sessionView(v, { mode: 'test', skills: sk, count: Math.min(30, sk.length), unitId: id, title: 'Test', back: '/unit/' + id, again: '/test/' + id });
    }, 'Test', true],
    [/^\/puncte-slabe$/, function (v) {
      const ids = []; M.openUnits().forEach(function (u) { M.unitSkills(u).forEach(function (s) { ids.push(s); }); });
      const session = M.weakSession(ids, 10);
      current = ui.sessionView(v, { mode: 'weak', skills: session.cfg.skills, count: 10, title: 'Puncte slabe', back: '/zona-mea', again: '/puncte-slabe', session: session });
    }, 'Puncte slabe', true],
    [/^\/recapitulare$/, function (v) {
      let ids = M.reviewSkills(6).map(function (r) { return r.id; });
      if (ids.length < 2) { ids = []; M.openUnits().forEach(function (u) { M.unitSkills(u).forEach(function (s) { ids.push(s); }); }); }
      current = ui.sessionView(v, { mode: 'review', skills: ids, count: 8, title: 'Recapitulare', back: '/', again: '/recapitulare' });
    }, 'Recapitulare', true],
    [/^\/set\/(\d+)$/, function (v, i) { current = ui.studioSession(v, parseInt(i, 10)); }, 'Set personalizat', true],
  ];

  function route() {
    if (current && current.destroy) { try { current.destroy(); } catch (e) { /* ok */ } }
    current = null;
    document.body.classList.remove('focus');
    const path = decodeURI(location.hash.replace(/^#/, '')) || '/';
    const view = document.getElementById('view');
    M.clear(view);
    let hit = null;
    for (const r of ROUTES) { const m = r[0].exec(path); if (m) { hit = { r: r, m: m }; break; } }
    if (!hit) { M.nav.go('/'); return; }
    const key = navKey(path);
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (a) { if (a.getAttribute('data-k') === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = hit.r[2] + ' · Matematică clasa a VII-a';
    if (!hit.r[3]) renderTopbar();
    document.getElementById('topbar').hidden = !!hit.r[3];
    window.scrollTo(0, 0);
    try { hit.r[1].apply(null, [view].concat(hit.m.slice(1))); }
    catch (e) { view.appendChild(h('div', { class: 'page' }, h('div', { class: 'fb bad' }, M.icon('cross'), h('div', null, h('b', { class: 't' }, 'Ceva nu a mers'), h('div', { class: 'why' }, 'A apărut o eroare la afișarea paginii. Încearcă să revii acasă.'))), h('a', { class: 'btn', href: '#/' }, 'Acasă'))); if (window.console) console.error(e); }
    M.announce(hit.r[2]);
    const hd = view.querySelector('h1'); if (hd) { hd.setAttribute('tabindex', '-1'); }
  }

  ui.pages = ui.pages || {};
  ui.pages.testIntro = function (view, id) {
    const u = M.unitById(id); if (!u) return M.nav.go('/cursuri');
    const n = Math.min(30, M.unitSkills(u).length);
    const last = M.store.get().tests[id];
    view.appendChild(h('div', { class: 'page' },
      h('a', { class: 'btn ghost sm', href: '#/unit/' + id, style: { 'margin-left': '-10px' } }, M.icon('back', 18), 'Înapoi'),
      h('h1', null, 'Test de unitate'), h('p', { class: 'lead' }, u.title),
      h('div', { class: 'card stack' },
        h('p', { style: { margin: 0 } }, h('b', null, n + ' de întrebări'), ', câte una din fiecare abilitate, amestecate, de dificultăți diferite.'),
        h('ul', { class: 'muted', style: { margin: 0 } }, h('li', null, 'Fără indicii și fără exemple rezolvate.'), h('li', null, 'O singură încercare pe întrebare.'), h('li', null, 'Rezolvările apar la final, pentru ce ai greșit.'), h('li', null, 'Un rezultat de cel puțin 90% la o abilitate (după ce ai ajuns Familiar) o duce la nivelul Stăpânit.')),
        last ? h('p', { class: 'muted small', style: { margin: 0 } }, 'Ultimul rezultat: ' + last.last + '% · cel mai bun: ' + last.best + '%') : null,
        h('a', { class: 'btn primary block', href: '#/test/' + id + '/start' }, 'Începe testul'))));
  };

  function init() {
    M.applySettings();
    buildChrome();
    window.addEventListener('hashchange', route);
    M.store.subscribe(function () { if (!document.body.classList.contains('focus')) { /* actualizăm doar cipurile */ const tb = document.getElementById('topbar'); if (tb && !tb.hidden) renderTopbar(); } });
    if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', M.applySettings); }
    route();
    /* manifest și funcționare offline doar când site-ul este găzduit (nu la deschiderea directă a fișierului) */
    if (location.protocol.indexOf('http') === 0) {
      const lk = document.createElement('link'); lk.rel = 'manifest'; lk.href = 'manifest.webmanifest'; document.head.appendChild(lk);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* opțional */ });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.M);
