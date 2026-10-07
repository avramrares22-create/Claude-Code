/* Studio AI: exerciții personalizate din cereri scrise în română. */
(function (M) {
  'use strict';
  const h = M.h, ui = M.ui;
  ui.pages = ui.pages || {};

  const EXAMPLES = [
    '5 probleme mai grele cu povestea fotbalului', '6 exerciții cu radical simplificat la ipotenuză', '4 exerciții cu romb și trapez, nivel mediu',
    '3 probleme cu scara pe perete', '8 exerciții din lecțiile 3 și 4, de la ușor la greu', 'Reciproca teoremei: 5 exerciții ușoare', 'Exersează punctele mele slabe',
  ];

  ui.pages.studio = function (view) {
    const page = h('div', { class: 'page' });
    page.appendChild(h('h1', null, 'Studio AI'));
    page.appendChild(h('p', { class: 'muted' }, 'Scrie ce vrei să exersezi. Studio construiește exerciții noi sau amestecă familii existente, iar apoi fiecare exercițiu este recalculat de cod înainte să-l vezi. Nu e un chatbot: face doar exerciții de matematică.'));

    /* stare AI */
    const status = h('div', { class: 'card stack' });
    const chipRow = h('div', { class: 'row' });
    const aiBtn = h('button', { class: 'btn sm', type: 'button' });
    const aiMsg = h('p', { class: 'small muted', style: { margin: 0 } });
    status.appendChild(h('div', { class: 'row between' }, h('b', null, 'Cum lucrează'), chipRow));
    status.appendChild(aiMsg); status.appendChild(h('div', { class: 'row' }, aiBtn));
    page.appendChild(status);
    function paintStatus() {
      M.clear(chipRow);
      chipRow.appendChild(h('span', { class: 'chip soft' }, 'Generator integrat · activ'));
      const A = M.aiLocal;
      chipRow.appendChild(h('span', { class: 'chip' }, A.ready ? 'Model local · gata' : A.status === 'se încarcă' ? 'Model local · se încarcă' : 'Mod AI local · neconectat'));
      if (A.ready) { aiMsg.textContent = 'Modelul local înțelege cererea ta liberă și produce un plan; exercițiile rămân construite și verificate de cod.'; aiBtn.hidden = true; return; }
      aiBtn.hidden = false;
      if (A.configured()) {
        aiMsg.textContent = A.supported() ? 'Un model local este configurat. Se descarcă o singură dată (câteva sute de MB) și rulează pe dispozitivul tău.' : 'Modelul local are nevoie de WebGPU (Chrome sau Edge recent, pe calculator). Generatorul integrat funcționează oricum.';
        aiBtn.textContent = 'Activează modelul local'; aiBtn.disabled = !A.supported();
        aiBtn.onclick = function () { aiBtn.disabled = true; aiBtn.textContent = 'Se încarcă…'; A.load(function (p) { aiBtn.textContent = 'Se încarcă… ' + Math.round((p.progress || 0) * 100) + '%'; }).then(paintStatus).catch(function (e) { aiMsg.textContent = 'Nu s-a putut încărca modelul: ' + (A.error || e.message); aiBtn.disabled = false; aiBtn.textContent = 'Încearcă din nou'; paintStatus(); }); };
      } else {
        aiMsg.textContent = 'Modul AI local nu este conectat. Studio folosește generatorul integrat (reguli în română), care funcționează fără internet. Cum conectezi un model antrenat de tine: ai/README.md.';
        aiBtn.textContent = 'Cum îl conectez?';
        aiBtn.onclick = function () { ui.confirm('Mod AI local', 'Antrenezi un model mic pe datele acestui site (ai/README.md), îl găzduiești și îl treci în ai/config.json. Modelul doar traduce cererea în plan; exercițiile sunt mereu verificate de cod. Fără model, tot ce vezi aici funcționează.', 'Am înțeles'); };
      }
    }
    M.aiLocal.init().then(paintStatus); paintStatus();

    /* formular */
    const ta = h('textarea', { class: 'input', id: 'studio-q', 'aria-label': 'Ce exerciții vrei?', placeholder: 'Ex.: 5 probleme mai grele cu povestea fotbalului', maxlength: '300' });
    const go = h('button', { class: 'btn primary', type: 'button', on: { click: build } }, M.icon('spark', 20), 'Construiește exercițiile');
    const chips = h('div', { class: 'chips' }, EXAMPLES.map(function (t) { return h('button', { class: 'chip-btn', type: 'button', on: { click: function () { ta.value = t; ta.focus(); } } }, t); }));
    page.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Ce vrei să exersezi?')));
    page.appendChild(h('div', { class: 'card stack' }, ta, chips, h('div', { class: 'row' }, go, h('span', { class: 'small muted' }, 'Maxim 10 exerciții odată.'))));
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) build(); });

    const out = h('div', { 'aria-live': 'polite' });
    page.appendChild(out);
    const savedBox = h('div'); page.appendChild(savedBox);
    paintSaved();
    view.appendChild(page);

    function build() {
      const text = ta.value.trim();
      if (!text) { ui.toast('Scrie întâi ce vrei să exersezi.'); ta.focus(); return; }
      go.disabled = true;
      M.clear(out); out.appendChild(h('p', { class: 'muted' }, 'Construiesc și verific exercițiile…'));
      const rules = M.studio.parse(text);
      const done = function (plan, extra) {
        const res = M.studio.generate(plan, {});
        if (extra) res.notes = extra.concat(res.notes);
        show(plan, res, text); go.disabled = false;
      };
      if (M.aiLocal.ready) {
        M.aiLocal.plan(text).then(function (json) {
          const p = json ? M.studio.planFromJSON(json) : null;
          if (p) done(p); else done(rules, ['Modelul nu a dat un plan valid; am folosit regulile integrate.']);
        });
      } else setTimeout(function () { done(rules); }, 30);
    }

    function show(plan, res, text) {
      M.clear(out);
      M.studioCurrent = { exercises: res.exercises, text: text, plan: plan };
      out.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Setul tău'), h('span', { class: 'chip soft' }, plan.source === 'model' ? 'plan: model local' : 'plan: reguli integrate')));
      out.appendChild(h('div', { class: 'card flat' }, h('b', null, 'Am înțeles: '), M.studio.describe(plan), res.dropped ? h('div', { class: 'small muted' }, res.dropped + ' variante au fost aruncate la verificare.') : null));
      res.notes.forEach(function (n) { out.appendChild(h('div', { class: 'fb info' }, M.icon('info'), h('div', null, h('div', { class: 'why' }, n)))); });
      if (!res.exercises.length) return;
      res.exercises.forEach(function (ex, i) {
        const det = h('details', { class: 'solution' }, h('summary', null, M.icon('eye', 18), 'Vezi rezolvarea'), ui.steps(ex.steps));
        out.appendChild(h('div', { class: 'gen-item', style: { 'margin-top': '10px' } },
          h('div', { class: 'row between' }, h('span', { class: 'eyebrow', style: { margin: 0 } }, 'Exercițiul ' + (i + 1)), h('span', { class: 'pill' }, ['Ușor', 'Mediu', 'Greu'][ex.level - 1] + ' · ' + (M.skills[ex.skill] ? M.skills[ex.skill].title : ex.skill))),
          h('div', { class: 'ex-text', html: M.rich(ex.text) }), ex.figure ? M.figureBox(ex.figure) : null,
          ex.mode === 'choice' ? h('ol', { type: 'A', class: 'small', style: { margin: 0 } }, ex.options.map(function (o) { return h('li', { html: o.rich ? M.rich(o.label) : M.tex(o.label) }); })) : null,
          det));
      });
      out.appendChild(h('div', { class: 'row', style: { 'margin-top': '14px' } },
        h('a', { class: 'btn primary', href: '#/set/0' }, M.icon('play', 18), 'Rezolvă setul'),
        h('button', { class: 'btn', type: 'button', on: { click: save } }, 'Salvează setul')));
      out.scrollIntoView && out.scrollIntoView({ behavior: M.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    function save() {
      const cur = M.studioCurrent; if (!cur || !cur.exercises.length) return;
      M.store.update(function (s) {
        s.studio.saved.unshift({ name: cur.text.slice(0, 60), ts: Date.now(), items: M.studio.pack(cur.exercises) });
        s.studio.saved = s.studio.saved.slice(0, 20);
      });
      ui.toast('Setul a fost salvat.'); paintSaved();
    }
    function paintSaved() {
      M.clear(savedBox);
      const list = M.store.get().studio.saved;
      if (!list.length) return;
      savedBox.appendChild(h('div', { class: 'section-title' }, h('h2', null, 'Seturi salvate')));
      list.forEach(function (st, i) {
        savedBox.appendChild(h('div', { class: 'card row between', style: { 'margin-top': '10px' } },
          h('div', { class: 'grow' }, h('div', { style: { 'font-weight': '650' } }, st.name || 'Set'), h('div', { class: 'small muted' }, st.items.length + ' exerciții · ' + new Date(st.ts).toLocaleDateString('ro-RO'))),
          h('a', { class: 'btn sm', href: '#/set/' + (i + 1) }, 'Rezolvă'),
          h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Șterge setul', on: { click: function () { M.store.update(function (s) { s.studio.saved.splice(i, 1); }); paintSaved(); } } }, M.icon('close', 18))));
      });
    }
  };

  ui.studioSession = function (mount, idx) {
    let exs = null, title = 'Set personalizat';
    if (idx === 0) exs = M.studioCurrent && M.studioCurrent.exercises;
    else { const sv = M.store.get().studio.saved[idx - 1]; if (sv) { exs = M.studio.unpack(sv.items); title = sv.name; } }
    if (!exs || !exs.length) { M.nav.go('/studio'); return null; }
    const skills = []; exs.forEach(function (e) { if (skills.indexOf(e.skill) < 0) skills.push(e.skill); });
    const session = new M.Session({ mode: 'practice', skills: skills, count: exs.length, fixed: exs });
    return ui.sessionView(mount, { mode: 'practice', skills: skills, count: exs.length, title: title, back: '/studio', again: '/set/' + idx, session: session });
  };
})(window.M);
