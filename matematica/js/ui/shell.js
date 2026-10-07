/* Elemente de interfață comune: mesaje scurte, dialoguri, celebrare discretă, ecranul de focus. */
(function (M) {
  'use strict';
  const h = M.h;
  const ui = (M.ui = M.ui || {});

  ui.toast = function (msg, ms) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2600);
  };

  /* confirmare cu <dialog>; întoarce Promise<boolean> */
  ui.confirm = function (title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      const dlg = h('dialog', { 'aria-labelledby': 'dlg-t' },
        h('h2', { id: 'dlg-t' }, title), h('p', { class: 'muted' }, text),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', type: 'button', on: { click: function () { dlg.close('no'); } } }, 'Renunță'),
          h('button', { class: 'btn primary' + (danger ? ' danger' : ''), type: 'button', on: { click: function () { dlg.close('yes'); } } }, okLabel || 'Confirmă')));
      dlg.addEventListener('close', function () { const r = dlg.returnValue === 'yes'; if (dlg.parentNode) dlg.parentNode.removeChild(dlg); resolve(r); });
      document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  };

  /* celebrare foarte discretă; oprită implicit, respectă „mișcare redusă” */
  ui.confetti = function () {
    if (!M.store.get().settings.celebrate || M.reducedMotion()) return;
    const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const cols = ['var(--ca)', 'var(--cb)', 'var(--cc)', 'var(--ch)', 'var(--accent)'];
    for (let i = 0; i < 34; i++) {
      const p = h('i', { style: { left: (Math.random() * 100) + '%', background: cols[i % cols.length], 'animation-duration': (1.6 + Math.random() * 1.4) + 's', 'animation-delay': (Math.random() * 0.3) + 's', '--dx': ((Math.random() - 0.5) * 160) + 'px', '--rot': (Math.random() * 720) + 'deg' } });
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3600);
  };

  /* inel pentru obiectivul zilnic */
  ui.ring = function (value, max, label, sub) {
    const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, value / max));
    const svg = M.s('svg', { viewBox: '0 0 84 84', 'aria-hidden': 'true' },
      M.s('circle', { cx: 42, cy: 42, r: r, fill: 'none', 'stroke-width': 9, class: 'track' }),
      M.s('circle', { cx: 42, cy: 42, r: r, fill: 'none', 'stroke-width': 9, class: 'val', 'stroke-dasharray': c.toFixed(1), 'stroke-dashoffset': (c * (1 - p)).toFixed(1) }));
    return h('div', { class: 'ring', role: 'img', 'aria-label': label + ': ' + value + ' din ' + max }, svg, h('div', { class: 'lbl' }, h('span', null, label, h('small', null, sub || ''))));
  };

  ui.levelBadge = function (lvl) {
    const L = M.LEVELS[lvl];
    return h('span', { class: 'lvl', 'data-l': String(lvl) }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', null, L.name));
  };

  ui.steps = function (steps) {
    return h('ol', null, steps.map(function (s) { return h('li', { html: M.rich(s) }); }));
  };

  /* ---------- ecranul de focus (lecții, exerciții, teste) ---------- */
  ui.focusShell = function (mount, opts) {
    opts = opts || {};
    M.clear(mount);
    document.body.classList.add('focus');
    const fill = h('i', { style: { width: '0%' } });
    const bar = h('div', { class: 'bar thin grow', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': opts.progressLabel || 'Progres' }, fill);
    const xp = h('span', { class: 'chip xp', 'aria-label': 'Puncte câștigate' }, M.icon('star', 16), h('span', null, '0'));
    const close = h('button', { class: 'btn ghost icon-btn', type: 'button', 'aria-label': 'Închide și revino la hartă', on: { click: function () { if (opts.onClose) opts.onClose(); } } }, M.icon('close', 22));
    const body = h('main', { class: 'focus-body', id: 'focus-main', tabindex: '-1' });
    const slot = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary', type: 'button' });
    const footer = h('footer', { class: 'focus-bar' }, slot, btn);
    mount.appendChild(h('div', { class: 'focus' }, h('header', { class: 'focus-top' }, close, bar, xp), body, footer));

    const api = {
      body: body,
      onKey: null,
      setProgress: function (p) { const v = Math.round(Math.max(0, Math.min(1, p)) * 100); fill.style.width = v + '%'; bar.setAttribute('aria-valuenow', String(v)); },
      setXp: function (n) { xp.lastChild.textContent = '+' + n; },
      feedback: function (node) { M.clear(slot); if (node) slot.appendChild(node); },
      primary: function (label, fn, disabled) {
        btn.textContent = label; btn.disabled = !!disabled; btn.onclick = fn || null; btn.hidden = !label;
      },
      focusBody: function () { body.scrollTop = 0; window.scrollTo(0, 0); },
      destroy: function () { document.removeEventListener('keydown', onKey); document.body.classList.remove('focus'); },
    };
    function onKey(ev) {
      if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target, tag = t && t.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (ev.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
        if (btn.hidden || btn.disabled) return;
        ev.preventDefault(); btn.click();
      } else if (!typing && /^[1-9]$/.test(ev.key) && api.onKey) {
        api.onKey(parseInt(ev.key, 10));
      }
    }
    document.addEventListener('keydown', onKey);
    return api;
  };
})(window.M);
