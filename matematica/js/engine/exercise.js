/* Motorul de exerciții: familii (șabloane) → exerciții unice, verificate.
   O familie are:  id, skill, levels, space(level) → listă de parametri valizi, build(p, level, rng) → exercițiu,
                   verify(p, value) → true dacă răspunsul e corect (calcul independent), check(p) → parametri valizi?   */
(function (M) {
  'use strict';

  const spaceCache = {};
  const bySkill = {};

  M.defineTemplate = function (t) {
    t.levels = t.levels || [1, 2, 3];
    M.templates[t.id] = t;
    (bySkill[t.skill] = bySkill[t.skill] || []).push(t);
    return t;
  };
  M.templatesForSkill = function (skill) { return bySkill[skill] || []; };
  M.templateSpace = function (t, level) {
    const key = t.id + ':' + level;
    if (!spaceCache[key]) spaceCache[key] = t.space(level);
    return spaceCache[key];
  };
  function nearestLevel(t, level) {
    if (t.levels.indexOf(level) >= 0) return level;
    let best = t.levels[0];
    t.levels.forEach(function (l) { if (Math.abs(l - level) < Math.abs(best - level)) best = l; });
    return best;
  }

  /* ---------- etichete pentru răspunsuri ---------- */
  M.unit = function (name, exp) { return '\\,\\text{' + name + '}' + (exp ? '^{' + exp + '}' : ''); };
  /* etichetele sunt TeX: punctul zecimal devine virgulă la afișare */
  function labelFor(kind, value, a) {
    if (kind === 'int') return M.texNum(value, 0);
    if (kind === 'dec') return M.texNum(value, a.dec === undefined ? 1 : a.dec);
    if (kind === 'rad') return M.radTex(Math.round(value * value));
    return M.texNum(value, 2);
  }

  /* constructori pentru greșeli tipice: valoarea greșită + eticheta + explicația */
  M.mk = {
    int: function (v, tag, why) { return { label: M.texNum(v, 0), num: v, tag: tag, why: why }; },
    dec: function (v, d, tag, why) { return { label: M.texNum(v, d), num: M.round(v, d), tag: tag, why: why }; },
    rad: function (n, tag, why, keepEqual) { return { label: M.radTex(n), num: Math.sqrt(n), tag: tag, why: why, n: n, keepEqual: !!keepEqual }; },
    num: function (v, tag, why) { return { label: M.texNum(v, 2), num: v, tag: tag, why: why }; },
    /* etichetă liberă (TeX) cu valoarea numerică asociată */
    raw: function (label, num, tag, why, keepEqual) { return { label: label, num: num, tag: tag, why: why, keepEqual: !!keepEqual }; },
  };

  /* ---------- construirea opțiunilor pentru întrebări cu variante ---------- */
  function numericOptions(ex, r) {
    const a = ex.answer;
    const unit = a.unit || '';
    const correctLabel = labelFor(a.kind, a.value, a);
    const used = {};
    used[correctLabel] = true;
    const opts = [{ label: correctLabel + unit, num: a.value, ok: true, tag: null, why: null }];
    const cands = r.shuffle((ex.mistakes || []).slice());
    const positive = a.positive !== false;

    function push(c) {
      if (opts.length >= 4) return;
      if (!isFinite(c.num) || (positive && c.num <= 0)) return;
      if (used[c.label]) return;
      if (Math.abs(c.num - a.value) < 1e-9 && !c.keepEqual) return;
      used[c.label] = true;
      opts.push({ label: c.label + unit, num: c.num, ok: false, keepEqual: !!c.keepEqual, tag: c.tag || 'other', why: c.why || 'Nu e rezultatul corect. Verifică încă o dată calculul.' });
    }
    cands.forEach(push);
    /* completări automate dacă nu sunt destule greșeli tipice */
    const v = a.value;
    const fillers = [];
    if (a.kind === 'rad') {
      const n = Math.round(v * v);
      [n + 1, n - 1, n + 4, n * 2, n + 9, Math.max(2, n - 4), n * 4].forEach(function (m) { if (m > 1) fillers.push(M.mk.rad(m, 'near', null)); });
    } else {
      const d = a.kind === 'dec' ? (a.dec === undefined ? 1 : a.dec) : 0;
      const step = d === 0 ? 1 : Math.pow(10, -d);
      [v + 1, v - 1, v * 2, v / 2, v + 2, v - 2, v * 1.1, v * 0.9, v + 10, v + step * 3, v - step * 2].forEach(function (x) {
        const y = d === 0 ? Math.round(x) : M.round(x, d);
        fillers.push(d === 0 ? M.mk.int(y, 'near', null) : M.mk.dec(y, d, 'near', null));
      });
    }
    r.shuffle(fillers).forEach(push);
    return r.shuffle(opts);
  }

  /* ---------- crearea unui exercițiu ---------- */
  M.exercise = {};

  function finalize(t, p, lv, seed, ex, forceMode) {
    ex.templateId = t.id;
    ex.skill = t.skill;
    ex.level = lv;
    ex.seed = seed;
    ex.params = p;
    /* o „greșeală tipică” care, la numere mici, ajunge egală cu răspunsul corect nu este o greșeală */
    if (ex.answer && ex.mistakes) {
      const correctLabel = labelFor(ex.answer.kind, ex.answer.value, ex.answer);
      ex.mistakes = ex.mistakes.filter(function (m) { return m.keepEqual || (m.label !== correctLabel && Math.abs(m.num - ex.answer.value) > 1e-9); });
    }
    const r = M.rng((seed ^ 0x9e3779b9) >>> 0);
    r.next(); r.next();
    if (ex.choices) {
      ex.mode = 'choice';
      ex.options = ex.choices.map(function (c) { return { label: c.label, ok: !!c.ok, tag: c.tag || (c.ok ? null : 'other'), why: c.why || (c.ok ? null : 'Nu este varianta corectă.'), rich: true }; });
      if (!ex.keepOrder) ex.options = r.shuffle(ex.options);
    } else {
      let mode = ex.mode || forceMode;
      if (!mode) mode = lv <= 1 ? 'choice' : lv === 2 ? (r.chance(0.5) ? 'choice' : 'input') : 'input';
      ex.mode = mode;
      if (mode === 'choice') ex.options = numericOptions(ex, r);
    }
    return ex;
  }

  M.exercise.fromParams = function (t, p, level, seed, forceMode) {
    const lv = nearestLevel(t, level);
    const rb = M.rng((seed ^ 0x51ed270b) >>> 0);
    const ex = t.build(p, lv, rb);
    return finalize(t, p, lv, seed, ex, forceMode);
  };

  M.exercise.make = function (templateId, seed, level, forceMode) {
    const t = M.templates[templateId];
    if (!t) throw new Error('Șablon necunoscut: ' + templateId);
    const lv = nearestLevel(t, level || 1);
    const sp = M.templateSpace(t, lv);
    if (!sp.length) throw new Error('Spațiu gol: ' + templateId + ' nivel ' + lv);
    const r = M.rng(seed >>> 0);
    const p = r.pick(sp);
    return M.exercise.fromParams(t, p, lv, seed, forceMode);
  };

  /* ---------- verificarea unui răspuns ---------- */
  M.exercise.check = function (ex, response) {
    if (ex.mode === 'choice') {
      const o = ex.options[response];
      if (!o) return { status: 'invalid' };
      if (o.ok) return { status: 'correct' };
      return { status: 'wrong', why: o.why, tag: o.tag };
    }
    const res = M.checkAnswer(ex.answer, response);
    if (res.status === 'wrong') {
      const v = res.value;
      let hit = null;
      (ex.mistakes || []).forEach(function (m) {
        const tol = ex.answer.kind === 'dec' ? 0.5 * Math.pow(10, -(ex.answer.dec === undefined ? 1 : ex.answer.dec)) : 1e-6 * Math.max(1, Math.abs(m.num));
        if (!hit && Math.abs(m.num - v) <= tol + 1e-9) hit = m;
      });
      if (hit) { res.why = hit.why; res.tag = hit.tag; }
      else { res.why = 'Nu este corect. Recitește enunțul și încearcă din nou.'; res.tag = 'other'; }
    }
    return res;
  };

  /* ---------- validare structurală (folosită în teste și pentru exerciții AI) ---------- */
  M.exercise.validate = function (ex) {
    const bad = [];
    if (!ex.text || typeof ex.text !== 'string') bad.push('fără enunț');
    if (!ex.choices && (!ex.answer || !isFinite(ex.answer.value))) bad.push('răspuns invalid');
    if (!ex.steps || !ex.steps.length) bad.push('fără rezolvare');
    if (!ex.hints || !ex.hints.length) bad.push('fără indicii');
    if (ex.answer && Math.abs(ex.answer.value) > 5000) bad.push('număr prea mare');
    if (ex.answer && ex.answer.kind === 'dec') {
      const d = ex.answer.dec === undefined ? 1 : ex.answer.dec;
      if (Math.abs(M.round(ex.answer.value, d) - ex.answer.value) < 1e-9 && ex.answer.requireDecimal) bad.push('„zecimală” fără zecimale');
    }
    if (ex.mode === 'choice') {
      const o = ex.options || [];
      if (o.length < 2) bad.push('prea puține variante');
      if (o.filter(function (x) { return x.ok; }).length !== 1) bad.push('nu există exact un răspuns corect');
      const labels = {};
      o.forEach(function (x) { if (labels[x.label]) bad.push('variante duplicate: ' + x.label); labels[x.label] = true; });
      if (ex.answer) o.forEach(function (x) { if (!x.ok && !x.keepEqual && x.num !== undefined && Math.abs(x.num - ex.answer.value) < 1e-9) bad.push('o variantă greșită egală cu răspunsul'); });
    }
    if (/NaN|undefined|Infinity|\[object/.test(ex.text + (ex.steps || []).join(' '))) bad.push('text defect');
    return bad;
  };

  /* Exemplu rezolvat, cu alte numere (butonul „Arată-mi cum”). */
  M.exercise.worked = function (ex) {
    const t = M.templates[ex.templateId];
    const lv = Math.max(1, ex.level - 1);
    for (let k = 1; k <= 12; k++) {
      const w = M.exercise.make(ex.templateId, (ex.seed + 7919 * k) >>> 0, lv, 'input');
      if (w.text !== ex.text) return w;
    }
    return M.exercise.make(ex.templateId, (ex.seed + 31) >>> 0, lv, 'input');
  };

  /* Cheie de unicitate pentru numărătoare */
  M.exercise.key = function (ex) { return ex.templateId + '|' + ex.level + '|' + ex.text; };

  /* ---------- capacitate: câte exerciții unice pot produce șabloanele ---------- */
  M.exercise.capacity = function (templateIds) {
    const per = {};
    let total = 0;
    (templateIds || Object.keys(M.templates)).forEach(function (id) {
      const t = M.templates[id];
      const seen = {};
      t.levels.forEach(function (lv) {
        M.templateSpace(t, lv).forEach(function (p) {
          const ex = M.exercise.fromParams(t, p, lv, 1);
          seen[lv + '|' + ex.text] = true;
        });
      });
      per[id] = Object.keys(seen).length;
      total += per[id];
    });
    return { total: total, per: per };
  };

  /* =================== SESIUNI =================== */
  M.Session = function (cfg) {
    this.cfg = Object.assign({ mode: 'practice', count: 10, adaptive: true, seedBase: Date.now() % 2147483647 }, cfg);
    this.rng = M.rng(this.cfg.seedBase);
    this.n = 0;
    this.seen = {};
    this.perSkill = {};
    this.correctFirst = 0;
    this.answered = 0;
    this.xp = 0;
    this.plan = null;
    if (this.cfg.mode === 'test') this.plan = this.rng.shuffle(this._testPlan());
  };

  M.Session.prototype._testPlan = function () {
    /* acoperă fiecare abilitate cel puțin o dată (dacă încape), apoi completează ponderat */
    const skills = this.cfg.skills.slice();
    const plan = [];
    const order = this.rng.shuffle(skills);
    for (let i = 0; i < this.cfg.count; i++) plan.push(order[i % order.length]);
    return plan;
  };

  M.Session.prototype.done = function () { return this.n >= this.cfg.count; };

  M.Session.prototype._level = function (skill) {
    if (this.cfg.forceLevel) return this.cfg.forceLevel;
    if (this.cfg.mode === 'test') return this.rng.pick([1, 2, 2, 3, 3]);
    if (!this.cfg.adaptive) return 1;
    return M.skillLevel(skill);
  };

  M.Session.prototype.next = function () {
    const c = this.cfg;
    if (c.fixed) { const fx = c.fixed[this.n]; this.n++; this.current = fx; return fx; }
    let skill;
    if (this.plan) skill = this.plan[this.n];
    else if (c.mode === 'quiz' && c.skills.length) skill = c.skills[this.n % c.skills.length];
    else skill = M.pickSkill(this.rng, c.skills, { uniform: c.mode === 'review' && false });
    const tpls = M.templatesForSkill(skill);
    if (!tpls.length) throw new Error('Nicio familie pentru abilitatea ' + skill);
    const lv = this._level(skill);
    let ex = null;
    for (let tries = 0; tries < 40 && !ex; tries++) {
      const t = this.rng.pick(tpls);
      const seed = (this.rng.int(1, 2147483000) + tries * 977) >>> 0;
      const cand = M.exercise.make(t.id, seed, lv);
      const k = M.exercise.key(cand);
      if (!this.seen[k] || tries > 30) { this.seen[k] = true; ex = cand; }
    }
    this.n++;
    this.current = ex;
    return ex;
  };

  /* reg: {ok:boolean, firstTry:boolean, tag} */
  M.Session.prototype.record = function (ex, reg) {
    const c = this.cfg;
    const t = this.perSkill[ex.skill] = this.perSkill[ex.skill] || { n: 0, c: 0 };
    t.n++;
    if (reg.ok && reg.firstTry) t.c++;
    this.answered++;
    if (reg.ok && reg.firstTry) this.correctFirst++;
    let gained = 0;
    if (reg.ok) gained = c.mode === 'test' ? 3 : reg.firstTry ? 4 + 2 * ex.level : 2;
    this.xp += gained;
    let res = { changed: null };
    if (!c.noRecord) {
      res = M.recordAnswer({ skill: ex.skill, ok: reg.ok && reg.firstTry, tag: reg.tag, mode: c.mode === 'quiz' ? 'practice' : c.mode, level: ex.level });
    }
    return { xp: gained, changed: res.changed };
  };

  M.Session.prototype.finish = function () {
    if (!this.cfg.noRecord) {
      M.finishSession({ mode: this.cfg.mode === 'quiz' ? 'practice' : this.cfg.mode, perSkill: this.perSkill });
      if (this.xp) M.store.addXp(this.xp);
      if (this.answered) M.store.touchStreak();
    }
    return { pct: this.answered ? Math.round(100 * this.correctFirst / this.answered) : 0, xp: this.xp, n: this.answered, correct: this.correctFirst, perSkill: this.perSkill };
  };

  /* ---------- sesiune pentru punctele slabe ---------- */
  M.weakSession = function (allSkills, count) {
    let pool = M.weakSkills(allSkills, 8).map(function (r) { return r.id; });
    if (pool.length < 3) {
      const tried = allSkills.filter(function (id) { return M.weakness(id) !== null; });
      tried.sort(function (a, b) { return M.weakness(b) - M.weakness(a); });
      pool = pool.concat(tried.filter(function (id) { return pool.indexOf(id) < 0; })).slice(0, 6);
    }
    if (!pool.length) pool = allSkills.slice(0, 6);
    return new M.Session({ mode: 'weak', skills: pool, count: count || 10 });
  };
})(window.M);
