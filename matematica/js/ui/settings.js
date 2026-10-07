/* Setări și pagina „Despre” (cu numărătoarea exercițiilor unice). */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;
  ui.pages = ui.pages || {};

  M.applySettings = function () {
    const s = M.store.get().settings, root = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
    if (s.motion === 'reduce') root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', (s.theme === 'dark' || (s.theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? '#0d1020' : '#f6f7fb');
  };

  function seg(options, value, onPick, label) {
    const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
    options.forEach(function (o) { wrap.appendChild(h('button', { type: 'button', 'aria-pressed': String(o[0] === value), on: { click: function () { onPick(o[0]); Array.prototype.forEach.call(wrap.children, function (b, i) { b.setAttribute('aria-pressed', String(options[i][0] === o[0])); }); } } }, o[1])); });
    return wrap;
  }
  function set(fn) { M.store.update(function (s) { fn(s.settings); }); M.applySettings(); }

  ui.pages.settings = function (view) {
    const st = M.store.get().settings;
    const page = h('div', { class: 'page' });
    page.appendChild(h('h1', null, 'Setări'));
    page.appendChild(h('div', { class: 'card' },
      h('div', { class: 'switch' }, h('div', null, h('b', null, 'Temă'), h('div', { class: 'small muted' }, 'Automat urmează telefonul sau calculatorul.')), seg([['auto', 'Automat'], ['light', 'Luminos'], ['dark', 'Întunecat']], st.theme, function (v) { set(function (s) { s.theme = v; }); }, 'Tema')),
      h('div', { class: 'switch' }, h('div', null, h('b', null, 'Mișcare'), h('div', { class: 'small muted' }, 'Redusă oprește animațiile.')), seg([['auto', 'Automat'], ['reduce', 'Redusă']], st.motion, function (v) { set(function (s) { s.motion = v; }); }, 'Mișcarea')),
      h('div', { class: 'switch' }, h('div', null, h('b', null, 'Sunete'), h('div', { class: 'small muted' }, 'Sunete scurte la răspuns corect sau greșit.')), toggle(st.sound, function (v) { set(function (s) { s.sound = v; }); if (v) M.sound.ok(); }, 'Sunete')),
      h('div', { class: 'switch' }, h('div', null, h('b', null, 'Celebrare discretă'), h('div', { class: 'small muted' }, 'Câteva particule la finalul unei lecții.')), toggle(st.celebrate, function (v) { set(function (s) { s.celebrate = v; }); if (v) ui.confetti(); }, 'Celebrare')),
      h('div', { class: 'switch' }, h('div', null, h('b', null, 'Obiectiv zilnic'), h('div', { class: 'small muted' }, 'XP pe zi.')), (function () {
        const sel = h('select', { class: 'input', style: { width: '120px' }, 'aria-label': 'Obiectiv zilnic în XP', on: { change: function () { set(function (s) { s.dailyGoal = parseInt(sel.value, 10); }); } } }, [30, 50, 80, 120].map(function (n) { return h('option', { value: String(n), selected: n === st.dailyGoal }, String(n)); }));
        return sel;
      })())));

    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', 'aria-label': 'Alege fișierul de progres', on: { change: function () {
      const f = file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = function () { const out = M.store.importJSON(String(r.result)); if (out.ok) { M.applySettings(); ui.toast('Progresul a fost importat.'); M.nav.go('/'); } else ui.toast(out.error, 4000); };
      r.readAsText(f);
    } } });
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Datele tale')));
    page.appendChild(h('div', { class: 'card stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Tot progresul rămâne doar pe acest dispozitiv (în browser). Exportă-l ca să-l muți sau să-l păstrezi.' + (M.store.isMemoryOnly() ? ' Atenție: browserul blochează salvarea, deci progresul se pierde la închidere.' : '')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', on: { click: function () { download('matematica-progres-' + M.todayStr() + '.json', M.store.exportJSON()); } } }, 'Exportă progresul'),
        h('button', { class: 'btn', type: 'button', on: { click: function () { file.click(); } } }, 'Importă progresul'), file,
        h('button', { class: 'btn danger', type: 'button', on: { click: function () { ui.confirm('Ștergi tot progresul?', 'Se șterg XP-ul, nivelurile, seria și răspunsurile. Nu se poate anula (exportă mai întâi dacă vrei o copie).', 'Șterge tot', true).then(function (ok) { if (ok) { M.store.reset(); M.applySettings(); ui.toast('Progresul a fost șters.'); M.nav.go('/'); } }); } } }, 'Resetează progresul'))));
    page.appendChild(h('p', { class: 'small muted', style: { 'margin-top': '18px' } }, h('a', { href: '#/despre' }, 'Despre acest site, exerciții și niveluri')));
    view.appendChild(page);
  };
  function toggle(on, fn, label) { return h('input', { type: 'checkbox', class: 'toggle', checked: on, role: 'switch', 'aria-label': label, on: { change: function (ev) { fn(ev.target.checked); } } }); }
  function download(name, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Despre ---------- */
  ui.pages.about = function (view) {
    const page = h('div', { class: 'page' });
    page.appendChild(h('h1', null, 'Despre'));
    page.appendChild(h('p', { class: 'lead' }, 'Site de matematică pentru clasa a VII-a, cu pregătire pentru clasa a VIII-a și olimpiadă. Funcționează fără internet, după prima încărcare, și nu trimite nicio dată nicăieri.'));
    page.appendChild(h('div', { class: 'card' },
      h('h3', null, 'Programa'), h('p', { class: 'small muted' }, 'Capitolele clasei a VII-a urmează programa școlară în vigoare (OMEN nr. 3393/28.02.2017). Formulele de calcul prescurtat, intervalele, inecuațiile și funcțiile aparțin clasei a VIII-a și sunt marcate ca pregătire, nu ca materie de clasa a VII-a.')));
    page.appendChild(h('div', { class: 'card', style: { 'margin-top': '14px' } },
      h('h3', null, 'Cum se calculează nivelurile'), h('ul', { class: 'small' }, M.LEVEL_RULES.map(function (r) { return h('li', null, r); }))));
    const cap = h('div', { class: 'card stack', style: { 'margin-top': '14px' } }, h('h3', null, 'Câte exerciții unice există?'), h('p', { class: 'small muted' }, 'Calculat acum, pe loc: toate familiile de exerciții × toate combinațiile valide de numere, povești și niveluri. Se numără enunțurile diferite.'));
    const out = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Se calculează…'));
    cap.appendChild(out); page.appendChild(cap);
    view.appendChild(page);
    const ids = Object.keys(M.templates), per = {}; let total = 0, i = 0;
    (function chunk() {
      const id = ids[i], t = M.templates[id];
      const seen = {};
      t.levels.forEach(function (lv) { M.templateSpace(t, lv).forEach(function (p) { seen[lv + '|' + M.exercise.fromParams(t, p, lv, 1).text] = 1; }); });
      per[id] = Object.keys(seen).length; total += per[id]; i++;
      if (i < ids.length) { setTimeout(chunk, 0); return; }
      M.clear(out);
      out.appendChild(h('div', { class: 'big', style: { 'font-size': '2.4rem', 'font-weight': '800', 'letter-spacing': '-0.03em' } }, total.toLocaleString('ro-RO')));
      out.appendChild(h('p', { class: 'muted small' }, 'exerciții diferite în Unitatea 1, din ' + ids.length + ' familii.'));
      const tb = h('table', { style: { width: '100%', 'border-collapse': 'collapse', 'font-size': '.85rem' } });
      ids.forEach(function (k) { tb.appendChild(h('tr', null, h('td', { style: { padding: '4px 0', color: 'var(--muted)' } }, k + ' · ' + (M.skills[M.templates[k].skill] ? M.skills[M.templates[k].skill].title : '')), h('td', { style: { 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' } }, String(per[k])))); });
      out.appendChild(h('details', null, h('summary', { style: { cursor: 'pointer', 'min-height': '44px' } }, 'Vezi pe familii'), tb));
    })();
    page.appendChild(h('p', { class: 'small muted', style: { 'margin-top': '18px' } }, 'Versiunea ' + M.version + ' · Font: Inter (licență SIL OFL) și fontul sistemului (San Francisco pe dispozitivele Apple).'));
  };
})(window.M);
