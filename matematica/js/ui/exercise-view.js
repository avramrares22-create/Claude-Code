/* Afișarea și verificarea unui exercițiu: variante sau câmp numeric, indicii pe rând, „Arată-mi cum”, explicații pe greșeala făcută. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;

  /* opts: {mode:'learn'|'test', maxTries, onResolved(result), onContinue(), intro, forceHow, sessionNote} */
  ui.exerciseView = function (host, ex, shell, opts) {
    opts = Object.assign({ mode: 'learn', maxTries: 2 }, opts);
    M._lastExercise = ex;                       // folosit doar de testele automate
    const test = opts.mode === 'test';
    const st = { tries: 0, hints: 0, usedHow: false, selected: null, resolved: false, firstTag: null, done: false };
    const root = h('div', { class: 'ex screen' });
    host.appendChild(root);

    const meta = h('div', { class: 'ex-meta' });
    if (opts.intro) meta.appendChild(h('span', { class: 'eyebrow', style: { margin: 0 } }, opts.intro));
    else if (!test && ex.skill && M.skills[ex.skill]) meta.appendChild(h('span', { class: 'muted small' }, M.skills[ex.skill].title));
    if (!test && ex.level && ex.templateId) meta.appendChild(h('span', { class: 'pill' }, ['Ușor', 'Mediu', 'Greu'][ex.level - 1]));
    root.appendChild(meta);
    root.appendChild(h('div', { class: 'ex-text', html: M.rich(ex.text) }));
    if (ex.visual && M.visuals[ex.visual.name]) { const vh = h('div'); root.appendChild(vh); M.visuals[ex.visual.name](vh, ex.visual.cfg || {}, { done: function () {} }); }
    if (ex.figure) root.appendChild(M.figureBox(ex.figure));

    let optEls = [], input = null;
    const unitTex = ex.answer && ex.answer.unit;
    if (ex.mode === 'choice') {
      const wrap = h('div', { class: 'options', role: 'group', 'aria-label': 'Variante de răspuns' });
      ex.options.forEach(function (o, i) {
        const b = h('button', { class: 'option', type: 'button', 'aria-pressed': 'false', 'data-i': String(i), on: { click: function () { choose(i); } } },
          h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'lab', html: o.rich ? M.rich(o.label) : M.tex(o.label) }),
          h('span', { class: 'mark', 'aria-hidden': 'true' }));
        optEls.push(b); wrap.appendChild(b);
      });
      root.appendChild(wrap);
      shell.onKey = function (n) { if (!st.resolved && n >= 1 && n <= optEls.length && !optEls[n - 1].disabled) choose(n - 1); };
    } else {
      input = h('input', { class: 'input', type: 'text', inputmode: 'text', enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Răspunsul tău', placeholder: 'Răspunsul tău', maxlength: '24' });
      input.addEventListener('input', function () { input.classList.remove('wrong'); shell.primary(test ? 'Răspunde' : 'Verifică', verify, !input.value.trim()); });
      const keys = h('div', { class: 'keys', role: 'group', 'aria-label': 'Taste speciale' }, ['√', ',', '(', ')'].map(function (k) {
        return h('button', { type: 'button', 'aria-label': k === '√' ? 'radical' : k === ',' ? 'virgulă' : k, on: { click: function () { ins(k); } } }, k);
      }));
      const row = h('div', { class: 'answer-row' }, input, unitTex ? h('span', { class: 'unit', html: M.tex(unitTex.replace(/^\\,/, '')) }) : null);
      root.appendChild(h('div', { class: 'answer-wrap' }, row, keys));
      shell.onKey = null;
    }

    /* instrumente: indiciu, arată-mi cum */
    const hintBox = h('div', { class: 'hintbox', 'aria-live': 'polite' });
    const workedBox = h('div');
    let btnHint = null, btnHow = null;
    if (!test) {
      btnHint = h('button', { class: 'tool', type: 'button', on: { click: showHint } }, M.icon('bulb'), h('span', null, 'Indiciu'));
      btnHow = h('button', { class: 'tool', type: 'button', on: { click: showHow } }, M.icon('eye'), h('span', null, 'Arată-mi cum'));
      root.appendChild(h('div', { class: 'ex-tools' }, btnHint, btnHow));
      root.appendChild(hintBox); root.appendChild(workedBox);
    }
    const solutionSlot = h('div');
    root.appendChild(solutionSlot);
    shell.feedback(null);
    shell.primary(test ? 'Răspunde' : 'Verifică', verify, true);

    function ins(ch) {
      const s = input.selectionStart == null ? input.value.length : input.selectionStart, e = input.selectionEnd == null ? s : input.selectionEnd;
      input.value = input.value.slice(0, s) + ch + input.value.slice(e);
      input.focus(); input.setSelectionRange(s + ch.length, s + ch.length);
      input.dispatchEvent(new Event('input'));
    }
    function choose(i) {
      if (st.resolved) return;
      st.selected = i;
      optEls.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
      M.sound.tap();
      shell.primary(test ? 'Răspunde' : 'Verifică', verify, false);
    }
    function showHint() {
      const hs = ex.hints || [];
      if (st.hints >= hs.length) return;
      hintBox.appendChild(h('div', { class: 'hint' }, h('b', null, 'Indiciu ' + (st.hints + 1) + ': '), h('span', { html: M.rich(hs[st.hints]) })));
      st.hints++;
      if (st.hints >= hs.length) { btnHint.disabled = true; btnHint.lastChild.textContent = 'Fără alte indicii'; } else btnHint.lastChild.textContent = 'Alt indiciu';
      M.announce('Indiciu afișat');
    }
    function showHow() {
      if (!ex.templateId) { showHint(); return; }
      st.usedHow = true;
      M.clear(workedBox);
      const w = M.exercise.worked(ex);
      workedBox.appendChild(h('div', { class: 'worked rise' },
        h('div', { class: 'eyebrow' }, 'Exemplu rezolvat, cu alte numere'),
        h('div', { class: 'ex-text', html: M.rich(w.text) }),
        w.figure ? M.figureBox(w.figure) : null,
        ui.steps(w.steps)));
      btnHow.disabled = true;
    }
    if (opts.forceHow && ex.templateId) showHow();

    function finishUI(correct, giveUp) {
      st.resolved = true;
      optEls.forEach(function (b) { b.disabled = true; });
      if (input) input.disabled = true;
      if (btnHint) { btnHint.disabled = true; btnHow.disabled = true; }
      if (ex.steps && ex.steps.length) {
        const det = h('details', { class: 'solution' }, h('summary', null, M.icon('book', 18), 'Vezi rezolvarea'), ui.steps(ex.steps));
        if (!correct || giveUp) det.open = true;
        solutionSlot.appendChild(det);
      }
    }
    function result(ok) {
      return { ok: ok, firstTry: ok && st.tries === 0, counted: ok && st.tries === 0 && st.hints < 2 && !st.usedHow, tag: st.firstTag, hints: st.hints, usedHow: st.usedHow };
    }
    function advance() { if (opts.onContinue) opts.onContinue(); }

    function verify() {
      if (st.resolved) return;
      const resp = ex.mode === 'choice' ? st.selected : input.value;
      if (resp === null || resp === '') return;
      const res = M.exercise.check(ex, resp);

      if (test) {
        st.resolved = true;
        const ok = res.status === 'correct';
        if (!ok) st.firstTag = res.tag || 'other';
        const r = result(ok); r.counted = ok; r.response = ex.mode === 'choice' ? ex.options[resp].label : String(resp);
        if (opts.onResolved) opts.onResolved(r);
        advance();
        return;
      }

      if (res.status === 'invalid') { shell.feedback(fb('info', 'info', 'Verifică forma răspunsului', res.note || 'Scrie un număr.')); if (input) input.focus(); return; }
      if (res.status === 'almost') { shell.feedback(fb('info', 'info', 'Aproape!', res.note)); input.classList.add('shake'); setTimeout(function () { input.classList.remove('shake'); }, 300); return; }

      if (res.status === 'correct') {
        if (ex.mode === 'choice') optEls[st.selected].classList.add('correct'); else input.classList.add('correct');
        M.sound.ok();
        finishUI(true, false);
        const r = result(true);
        shell.feedback(fb('ok', 'check', M.pickMsg('correct'), res.note || (r.counted ? '' : 'Contează ca exersare, nu ca răspuns din prima.')));
        if (opts.onResolved) opts.onResolved(r);
        shell.primary('Continuă', advance, false);
        return;
      }
      /* greșit */
      st.tries++;
      if (!st.firstTag) st.firstTag = res.tag || 'other';
      M.sound.bad();
      if (ex.mode === 'choice') { const b = optEls[st.selected]; b.classList.add('wrong'); b.disabled = true; b.setAttribute('aria-pressed', 'false'); st.selected = null; }
      else { input.classList.add('wrong'); input.classList.add('shake'); setTimeout(function () { input.classList.remove('shake'); }, 300); }
      const why = res.why || 'Nu este corect.';
      if (st.tries >= opts.maxTries) {
        /* arătăm răspunsul corect și rezolvarea */
        if (ex.mode === 'choice') optEls.forEach(function (b, k) { if (ex.options[k].ok) b.classList.add('correct'); else b.classList.add('dim'); });
        finishUI(false, true);
        const ans = ex.mode === 'choice' ? '' : ' Răspunsul corect: ' + M.tex(correctText(ex));
        shell.feedback(h('div', { class: 'fb bad rise', role: 'alert' }, M.icon('cross'), h('div', null, h('b', { class: 't' }, 'Nu de data aceasta'), h('div', { class: 'why', html: M.rich(why) + ans }), h('div', { class: 'why muted small', style: { 'margin-top': '6px' } }, 'Citește rezolvarea de mai jos — te ajută la următorul exercițiu.'))));
        if (opts.onResolved) opts.onResolved(result(false));
        shell.primary('Continuă', advance, false);
      } else {
        shell.feedback(h('div', { class: 'fb bad rise', role: 'alert' }, M.icon('cross'), h('div', null, h('b', { class: 't' }, M.pickMsg('wrong')), h('div', { class: 'why', html: M.rich(why) }), h('div', { class: 'why muted small', style: { 'margin-top': '6px' } }, 'Poți cere un indiciu, apoi încearcă din nou.'))));
        shell.primary('Verifică', verify, true);
        if (input) { input.focus(); input.select(); }
      }
    }
    function fb(kind, icon, title, text) {
      return h('div', { class: 'fb ' + kind + ' rise' }, M.icon(icon), h('div', null, h('b', { class: 't' }, title), text ? h('div', { class: 'why', html: M.rich(text) }) : null));
    }
    if (input) setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 60);
    return { state: st, root: root, destroy: function () { shell.onKey = null; } };
  };

  function correctText(ex) {
    const a = ex.answer;
    if (a.kind === 'int') return M.texNum(a.value, 0) + (a.unit || '');
    if (a.kind === 'dec') return M.texNum(a.value, a.dec === undefined ? 1 : a.dec) + (a.unit || '');
    if (a.kind === 'rad') return M.radTex(a.n) + (a.unit || '');
    return M.texNum(a.value, 2);
  }
})(window.M);
