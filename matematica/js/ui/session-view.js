/* Sesiuni de exersare: set adaptiv, test de unitate, puncte slabe, recapitulare. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;

  /* cfg: {mode:'practice'|'test'|'weak'|'review', skills:[], count, title, back:'/unit/u1', unitId} */
  ui.sessionView = function (mount, cfg) {
    const test = cfg.mode === 'test';
    const shell = ui.focusShell(mount, { progressLabel: 'Progresul sesiunii', onClose: leave });
    const session = cfg.session || new M.Session({ mode: cfg.mode, skills: cfg.skills, count: cfg.count, adaptive: true });
    const log = [];
    let alive = true, forceHow = false;
    const before = {}; cfg.skills.forEach(function (s) { before[s] = M.masteryLevel(s); });

    function leave() {
      ui.confirm('Închizi sesiunea?', test ? 'Testul nu va fi salvat.' : 'Răspunsurile date până acum rămân salvate.', 'Închide').then(function (ok) {
        if (!ok) return;
        alive = false;
        if (!test) session.finish();
        shell.destroy(); M.nav.go(cfg.back || '/');
      });
    }
    function step() {
      if (!alive) return;
      if (session.done()) { results(); return; }
      M.clear(shell.body); shell.feedback(null); shell.focusBody();
      shell.setProgress(session.n / session.cfg.count);
      const ex = session.next();
      const force = forceHow; forceHow = false;
      const wrap = h('div'); shell.body.appendChild(wrap);
      ui.exerciseView(wrap, ex, shell, {
        mode: test ? 'test' : 'learn', forceHow: force,
        intro: (test ? 'Test' : cfg.title || 'Exersare') + ' · ' + session.n + ' din ' + session.cfg.count,
        onResolved: function (r) {
          const out = session.record(ex, { ok: r.ok, firstTry: r.counted, tag: r.tag });
          log.push({ ex: ex, r: r });
          shell.setXp(session.xp);
          if (!test && out.changed === 'up') ui.toast('Nivel nou: exercițiile devin mai grele.');
          if (!test && (out.changed === 'down' || out.changed === 'down-min')) { forceHow = true; ui.toast('Mai încet — la următorul exercițiu vezi un exemplu rezolvat.'); }
        },
        onContinue: step,
      });
    }

    function results() {
      shell.setProgress(1);
      const res = session.finish();
      M.clear(shell.body); shell.feedback(null); shell.focusBody();
      const s = h('div', { class: 'screen result' }); shell.body.appendChild(s);
      s.appendChild(h('div', { class: 'eyebrow', style: { 'text-align': 'center' } }, test ? 'Rezultatul testului' : 'Sesiune terminată'));
      s.appendChild(h('div', { class: 'big', style: { 'text-align': 'center', color: res.pct >= 80 ? 'var(--ok)' : res.pct >= 50 ? 'var(--text)' : 'var(--bad)' } }, res.pct + '%'));
      s.appendChild(h('p', { class: 'muted', style: { 'text-align': 'center' } }, res.correct + ' din ' + res.n + ' răspunsuri corecte din prima' + (test ? '' : ' · +' + res.xp + ' XP')));
      if (test) M.store.update(function (st) { const t = st.tests[cfg.unitId] || { best: 0 }; st.tests[cfg.unitId] = { last: res.pct, best: Math.max(t.best || 0, res.pct), ts: Date.now() }; });

      /* pe abilități */
      const rows = Object.keys(res.perSkill).map(function (id) { const r = res.perSkill[id]; return { id: id, n: r.n, c: r.c, pct: Math.round(100 * r.c / r.n) }; }).sort(function (a, b) { return a.pct - b.pct; });
      s.appendChild(h('h2', { style: { 'margin-top': '22px' } }, 'Pe abilități'));
      const list = h('div', { class: 'skill-list' });
      rows.forEach(function (r) {
        const lvl = M.masteryLevel(r.id), was = before[r.id];
        list.appendChild(h('div', { class: 'skill-row' },
          h('div', null, h('div', { style: { 'font-weight': '650' } }, M.skills[r.id].title), h('div', { class: 'small muted' }, r.c + ' din ' + r.n + ' corecte' + (lvl > was ? ' · ↑ ' + M.LEVELS[lvl].name : ''))),
          ui.levelBadge(lvl), h('div', { class: 'bar thin', role: 'img', 'aria-label': r.pct + '%' }, h('i', { style: { width: r.pct + '%', background: r.pct >= 80 ? 'var(--ok)' : r.pct >= 50 ? 'var(--accent)' : 'var(--bad)' } }))));
      });
      s.appendChild(list);

      /* revizuire greșeli (test) */
      const wrong = log.filter(function (l) { return !l.r.ok; });
      if (test && wrong.length) {
        s.appendChild(h('h2', { style: { 'margin-top': '22px' } }, 'Ce poți îmbunătăți'));
        wrong.forEach(function (l) {
          const ex = l.ex;
          s.appendChild(h('div', { class: 'card flat stack' },
            h('div', { class: 'small muted' }, M.skills[ex.skill].title),
            h('div', { class: 'ex-text', html: M.rich(ex.text) }),
            ex.figure ? M.figureBox(ex.figure) : null,
            h('details', { class: 'solution', open: true }, h('summary', null, 'Rezolvarea corectă'), ui.steps(ex.steps))));
        });
      }
      ui.confetti();
      shell.primary(cfg.mode === 'weak' ? 'Înapoi la Zona mea' : 'Gata', function () { shell.destroy(); M.nav.go(cfg.back || '/'); }, false);
      s.appendChild(h('div', { class: 'row', style: { 'justify-content': 'center', 'margin-top': '12px' } },
        h('button', { class: 'btn sm', type: 'button', on: { click: function () { shell.destroy(); M.nav.go(cfg.again || cfg.back || '/'); } } }, M.icon('refresh', 18), 'Încă o sesiune'),
        h('a', { class: 'btn ghost sm', href: '#/zona-mea', on: { click: function () { shell.destroy(); } } }, 'Zona mea')));
    }

    step();
    return { destroy: function () { alive = false; shell.destroy(); } };
  };
})(window.M);
