/* Playerul de lecții: un singur motor pentru orice lecție descrisă ca date. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;

  function legendEl(items) {
    return h('div', { class: 'legend' }, items.map(function (it) {
      return h('span', null, h('i', { style: { background: 'var(--' + it[0] + ')' } }), it[1]);
    }));
  }
  function trickEl(text, title) {
    return h('div', { class: 'trick' }, M.icon('bulb', 22), h('div', null, h('b', null, (title || 'Truc rapid') + ': '), h('span', { html: M.rich(text) })));
  }
  ui.legendEl = legendEl; ui.trickEl = trickEl;

  ui.lessonPlayer = function (mount, lessonId) {
    const lesson = M.lessonById(lessonId);
    if (!lesson || !lesson.screens.length) { M.nav.go('/cursuri'); return; }
    const shell = ui.focusShell(mount, { progressLabel: 'Progresul lecției', onClose: leave });
    const screens = lesson.screens;
    const S = { idx: 0, xp: 0, rightRun: 0, wrongRun: 0, delta: 0, forceHow: false, answered: 0, counted: 0, quiz: null, seen: {} };
    const before = {}; lesson.skills.forEach(function (sk) { before[sk] = M.masteryLevel(sk); });
    let alive = true;

    function leave() {
      ui.confirm('Părăsești lecția?', 'Răspunsurile date până acum rămân salvate. Lecția nu va fi marcată ca terminată.', 'Ieși').then(function (ok) { if (ok) { alive = false; shell.destroy(); M.nav.go('/unit/' + lesson.unit); } });
    }
    function gain(n) { if (!n) return; S.xp += n; M.store.addXp(n); shell.setXp(S.xp); }
    function progress(frac) { shell.setProgress((S.idx + (frac || 0)) / (screens.length + 1)); }
    function next() { if (!alive) return; S.idx++; render(); }
    function section(extra) { M.clear(shell.body); shell.feedback(null); shell.onKey = null; shell.focusBody(); const s = h('div', { class: 'screen' }); shell.body.appendChild(s); if (extra) s.className += ' ' + extra; return s; }

    function render() {
      if (!alive) return;
      if (S.idx >= screens.length) { complete(); return; }
      progress(0);
      const sc = screens[S.idx];
      ({ explain: rExplain, play: rPlay, question: rQuestion, ask: rAsk, reveal: rReveal, quiz: rQuiz, example: rExample })[sc.type](sc);
    }

    function rExplain(sc) {
      const s = section();
      if (sc.title) s.appendChild(h('h2', { class: 'screen-title' }, sc.title));
      sc.body.forEach(function (p) { s.appendChild(h('div', { class: 'lead', html: M.rich(p) })); });
      if (sc.figure) s.appendChild(M.figureBox(sc.figure));
      if (sc.legend) s.appendChild(legendEl(sc.legend));
      if (sc.trick) s.appendChild(trickEl(sc.trick));
      shell.primary('Continuă', next, false);
    }

    function rReveal(sc) {
      const s = section();
      s.appendChild(h('div', { class: 'eyebrow' }, 'Regula'));
      s.appendChild(h('h2', { class: 'screen-title' }, sc.title));
      s.appendChild(h('div', { class: 'formula-card rise', html: M.tex(sc.formula, { block: true }) }));
      if (sc.legend) s.appendChild(legendEl(sc.legend));
      s.appendChild(h('div', { class: 'lead', html: M.rich(sc.text) }));
      if (sc.trick) s.appendChild(trickEl(sc.trick));
      M.sound.done();
      shell.primary('Am înțeles', next, false);
    }

    function rPlay(sc) {
      const s = section();
      s.appendChild(h('div', { class: 'eyebrow' }, 'Încearcă singur'));
      s.appendChild(h('div', { class: 'lead', html: M.rich(sc.prompt) }));
      const host = h('div'); s.appendChild(host);
      const hint = h('span', { class: 'muted small grow' }, 'Încearcă mai multe valori; „Continuă” se activează când ai explorat.');
      const skip = h('button', { class: 'btn ghost sm', type: 'button', on: { click: next } }, 'Sari peste');
      s.appendChild(h('div', { class: 'row between', style: { gap: '8px' } }, hint, skip));
      let done = false;
      shell.primary('Continuă', next, true);
      M.visuals[sc.visual](host, sc.cfg, { done: function () { if (done) return; done = true; hint.textContent = 'Bine! Ai explorat destul — poți continua.'; hint.style.color = 'var(--ok)'; shell.primary('Continuă', next, false); M.sound.ok(); } });
    }

    function rExample(sc) {
      const s = section();
      const ex = M.exercise.make(sc.template, sc.seed, sc.level || 1, 'input');
      s.appendChild(h('div', { class: 'eyebrow' }, 'Exemplu rezolvat'));
      s.appendChild(h('div', { class: 'ex-text', html: M.rich(ex.text) }));
      if (ex.figure) s.appendChild(M.figureBox(ex.figure));
      s.appendChild(h('div', { class: 'card flat' }, ui.steps(ex.steps)));
      shell.primary('Continuă', next, false);
    }

    function runExercise(ex, o) {
      const s = section();
      ui.exerciseView(s, ex, shell, {
        mode: 'learn', intro: o.intro, forceHow: o.forceHow,
        onResolved: function (r) { o.resolved(r); },
        onContinue: o.next,
      });
    }

    function rQuestion(sc) {
      const opts = sc.options.map(function (o) { return { label: o.t, ok: !!o.ok, tag: o.ok ? null : 'other', why: o.why || null, rich: true }; });
      const sh = M.rng((lessonId.length * 131 + S.idx * 17 + 7) >>> 0).shuffle(opts);
      const ex = { text: sc.q, mode: 'choice', options: sh, hints: sc.hints || ['Citește din nou enunțul și privește figura.'], figure: sc.figure, visual: sc.visual, skill: sc.skill, steps: sc.explain ? [sc.explain] : null };
      runExercise(ex, {
        intro: 'Întrebare',
        resolved: function (r) {
          if (sc.skill) M.recordAnswer({ skill: sc.skill, ok: r.counted, tag: r.tag, mode: 'lesson' });
          S.answered++; if (r.counted) S.counted++; gain(r.counted ? 4 : r.ok ? 2 : 0);
        },
        next: next,
      });
    }

    function rAsk(sc) {
      const tpls = M.templatesForSkill(sc.skill);
      let k = 0;
      (function one() {
        if (!alive) return;
        const level = Math.max(1, Math.min(3, sc.level + S.delta));
        let ex = null;
        for (let tries = 0; tries < 40 && !ex; tries++) {
          const t = tpls[Math.floor(Math.random() * tpls.length)];
          const cand = M.exercise.make(t.id, (Math.floor(Math.random() * 2147483000) + tries) >>> 0, level);
          const key = M.exercise.key(cand);
          if (!S.seen[key] || tries > 30) { S.seen[key] = 1; ex = cand; }
        }
        progress(k / sc.count);
        const force = S.forceHow; S.forceHow = false;
        runExercise(ex, {
          intro: (sc.intro ? sc.intro + ' · ' : '') + 'Exercițiu ' + (k + 1) + ' din ' + sc.count, forceHow: force,
          resolved: function (r) {
            M.recordAnswer({ skill: ex.skill, ok: r.counted, tag: r.tag, mode: 'lesson', level: ex.level });
            S.answered++; if (r.counted) S.counted++;
            gain(r.counted ? 4 + 2 * ex.level : r.ok ? 2 : 0);
            if (r.counted) { S.rightRun++; S.wrongRun = 0; if (S.rightRun >= 3 && S.delta < 1) { S.delta++; S.rightRun = 0; ui.toast('Merge bine — următoarele exerciții sunt mai grele.'); } }
            else { S.wrongRun++; S.rightRun = 0; if (S.wrongRun >= 2) { S.wrongRun = 0; if (S.delta > -1) S.delta--; S.forceHow = true; ui.toast('Mai încet. Vei vedea un exemplu rezolvat înainte de următorul exercițiu.'); } }
          },
          next: function () { k++; if (k < sc.count) one(); else next(); },
        });
      })();
    }

    function rQuiz(sc) {
      const session = new M.Session({ mode: 'quiz', skills: sc.skills, count: sc.count });
      S.quiz = session;
      (function one() {
        if (!alive) return;
        if (session.done()) { next(); return; }
        const ex = session.next();
        progress(session.n / sc.count);
        runExercise(ex, {
          intro: 'Test scurt · întrebarea ' + session.n + ' din ' + sc.count, forceHow: false,
          resolved: function (r) { const out = session.record(ex, { ok: r.ok, firstTry: r.counted, tag: r.tag }); S.answered++; if (r.counted) S.counted++; S.xp += out.xp; shell.setXp(S.xp); },
          next: one,
        });
      })();
    }

    function complete() {
      shell.setProgress(1);
      const res = S.quiz ? S.quiz.finish() : { pct: 0, xp: 0 };
      const prev = M.store.get().lessons[lesson.id];
      const bonus = prev && prev.done ? 5 : 20;
      M.store.addXp(bonus);
      M.store.touchStreak();
      M.store.update(function (s) { s.lessons[lesson.id] = { done: true, ts: Date.now(), quiz: res.pct, best: Math.max(res.pct, (prev && prev.best) || 0) }; });
      const total = S.xp + bonus;
      shell.setXp(total);
      const s = section('result');
      s.appendChild(h('div', { class: 'eyebrow', style: { 'text-align': 'center' } }, 'Lecție terminată'));
      s.appendChild(h('h1', { style: { 'text-align': 'center' } }, lesson.title));
      s.appendChild(h('p', { class: 'muted', style: { 'text-align': 'center' } }, M.pickMsg('complete')));
      s.appendChild(h('div', { class: 'stat-grid' },
        stat('+' + total, 'XP câștigat'), stat(res.pct + '%', 'test scurt, din prima'), stat(S.counted + '/' + S.answered, 'răspunsuri din prima'), stat(M.store.streakNow() + '', M.store.streakNow() === 1 ? 'zi la rând' : 'zile la rând')));
      const changes = lesson.skills.map(function (sk) { return { sk: sk, a: before[sk], b: M.masteryLevel(sk) }; });
      const list = h('div', { class: 'skill-list' });
      changes.forEach(function (c) {
        list.appendChild(h('div', { class: 'skill-row' }, h('div', null, h('div', { style: { 'font-weight': '650' } }, M.skills[c.sk].title), c.b > c.a ? h('span', { class: 'small', style: { color: 'var(--ok)' } }, '↑ ' + M.LEVELS[c.a].name + ' → ' + M.LEVELS[c.b].name) : null), ui.levelBadge(c.b)));
      });
      s.appendChild(h('h2', { style: { 'margin-top': '22px' } }, 'Unde ești acum'));
      s.appendChild(list);
      const weak = changes.filter(function (c) { const w = M.weakness(c.sk); return w !== null && w >= 0.3; });
      if (weak.length) s.appendChild(h('div', { class: 'fb info' }, M.icon('info'), h('div', null, h('b', { class: 't' }, 'Merită recapitulat'), h('div', { class: 'why' }, weak.map(function (c) { return M.skills[c.sk].title; }).join(' · ') + '. Le găsești în „Zona mea”.'))));
      ui.confetti(); M.sound.done();
      const idx = lesson.unit ? M.unitById(lesson.unit).lessons.indexOf(lesson) : -1;
      const nextL = idx >= 0 ? M.unitById(lesson.unit).lessons[idx + 1] : null;
      const goNext = function () { shell.destroy(); M.nav.go(nextL && nextL.screens.length ? '/lectie/' + nextL.id : '/unit/' + lesson.unit); };
      shell.primary(nextL && nextL.screens.length ? 'Lecția următoare' : 'Înapoi la unitate', goNext, false);
      s.appendChild(h('div', { class: 'row', style: { 'justify-content': 'center', 'margin-top': '10px' } },
        h('a', { class: 'btn ghost sm', href: '#/exersare/' + lesson.unit, on: { click: function () { shell.destroy(); } } }, 'Exersează unitatea'),
        h('a', { class: 'btn ghost sm', href: '#/zona-mea', on: { click: function () { shell.destroy(); } } }, 'Zona mea')));
    }
    function stat(v, k) { return h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k)); }

    render();
    return { destroy: function () { alive = false; shell.destroy(); } };
  };
})(window.M);
