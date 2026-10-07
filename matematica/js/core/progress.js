/* Nivele de stăpânire, dificultate adaptivă, puncte slabe. */
(function (M) {
  'use strict';

  M.LEVELS = [
    { id: 0, name: 'Neînceput', short: 'Neînceput' },
    { id: 1, name: 'Încercat', short: 'Încercat' },
    { id: 2, name: 'Familiar', short: 'Familiar' },
    { id: 3, name: 'Competent', short: 'Competent' },
    { id: 4, name: 'Stăpânit', short: 'Stăpânit' },
  ];
  M.LEVEL_RULES = [
    'Neînceput: nu ai încercat încă niciun exercițiu.',
    'Încercat: ai rezolvat cel puțin un exercițiu.',
    'Familiar: ai cel puțin 70% la un set de 5 exerciții.',
    'Competent: ai cel puțin 80% la două seturi la rând.',
    'Stăpânit: după ce ai ajuns Familiar, ai cel puțin 90% la un test de unitate, sau 90% la o recapitulare după câteva zile.',
  ];

  function dayNum(str) { const p = str.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }

  /* ---------- nivel de stăpânire pe abilitate ---------- */
  M.masteryLevel = function (skillId) {
    const rec = M.store.get().skills[skillId];
    if (!rec || rec.att === 0) return 0;
    let lvl = 1;
    const sets = rec.sets || [];
    const n = sets.length;
    if (n && sets[n - 1] >= 70) lvl = 2;
    if (n >= 2 && sets[n - 1] >= 80 && sets[n - 2] >= 80) lvl = 3;
    const t = rec.tests && rec.tests[rec.tests.length - 1];
    if (t && t.n >= 1 && t.pct >= 90 && lvl >= 2 && rec.att >= 3) return 4;
    if (lvl >= 3 && rec.compDay && rec.reviews && rec.reviews.some(function (r) { return r.pct >= 90 && dayNum(r.day) - dayNum(rec.compDay) >= 2; })) return 4;
    return lvl;
  };

  M.skillMeta = function (id) { return (M.skills && M.skills[id]) || { id: id, title: id }; };

  function avgLevel(ids) {
    if (!ids.length) return 0;
    let s = 0;
    ids.forEach(function (id) { s += M.masteryLevel(id); });
    return s / ids.length / 4;       // 0..1
  }
  M.lessonSkills = function (lesson) { return lesson.skills || []; };
  M.unitSkills = function (unit) {
    const out = [];
    (unit.lessons || []).forEach(function (l) { (l.skills || []).forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); }); });
    return out;
  };
  M.lessonProgress = function (lesson) { return avgLevel(lesson.skills || []); };
  M.unitProgress = function (unit) { return avgLevel(M.unitSkills(unit)); };

  /* ---------- slăbiciuni ---------- */
  /* 0..1 — cât de „slabă” este abilitatea; null dacă nu a fost încercată. */
  M.weakness = function (skillId, nowMs) {
    const rec = M.store.get().skills[skillId];
    if (!rec || rec.att === 0) return null;
    const rc = rec.recent || [];
    let wsum = 0, ws = 0;
    for (let i = rc.length - 1, k = 0; i >= 0; i--, k++) { const w = Math.pow(0.85, k); wsum += w; ws += w * rc[i]; }
    const err = wsum ? 1 - ws / wsum : 0.5;
    const conf = Math.min(1, rec.att / 6);
    const days = rec.ts ? ((nowMs || Date.now()) - rec.ts) / 86400000 : 0;
    const stale = Math.min(1, days / 14);
    return Math.min(1, err * conf + 0.15 * stale * (err > 0 ? 1 : 0.6));
  };

  M.weakSkills = function (skillIds, limit) {
    const rows = [];
    skillIds.forEach(function (id) {
      const w = M.weakness(id);
      if (w !== null) rows.push({ id: id, w: w, lvl: M.masteryLevel(id) });
    });
    rows.sort(function (a, b) { return b.w - a.w; });
    return rows.filter(function (r) { return r.w >= 0.2; }).slice(0, limit || 8);
  };

  /* greșeli frecvente (după etichetă) */
  M.mistakeStats = function () {
    const tally = {};
    const s = M.store.get();
    Object.keys(s.skills).forEach(function (id) {
      const m = s.skills[id].mistakes || {};
      Object.keys(m).forEach(function (tag) {
        tally[tag] = tally[tag] || { tag: tag, n: 0, skills: {} };
        tally[tag].n += m[tag];
        tally[tag].skills[id] = (tally[tag].skills[id] || 0) + m[tag];
      });
    });
    return Object.keys(tally).map(function (k) { return tally[k]; }).sort(function (a, b) { return b.n - a.n; });
  };

  /* ---------- înregistrarea răspunsurilor ---------- */
  function flushBlock(rec, minN) {
    if (rec.block.n >= minN) {
      const pct = Math.round(100 * rec.block.c / rec.block.n);
      rec.sets.push(pct);
      if (rec.sets.length > 8) rec.sets.shift();
      rec.block = { n: 0, c: 0 };
      if (!rec.compDay) {
        const n = rec.sets.length;
        if (n >= 2 && rec.sets[n - 1] >= 80 && rec.sets[n - 2] >= 80) rec.compDay = M.todayStr();
      }
    }
  }

  /* opts: {skill, ok, tag, mode, level}; întoarce {changed:'up'|'down'|null, lvl} */
  M.recordAnswer = function (opts) {
    let out = { changed: null, lvl: 1 };
    M.store.update(function (s) {
      const rec = M.store.skill(opts.skill);
      rec.att++;
      if (opts.ok) rec.cor++;
      rec.recent.push(opts.ok ? 1 : 0);
      if (rec.recent.length > 20) rec.recent.shift();
      rec.ts = Date.now();
      if (!opts.ok && opts.tag) rec.mistakes[opts.tag] = (rec.mistakes[opts.tag] || 0) + 1;

      if (opts.mode !== 'test') {
        rec.block.n++;
        rec.block.c += opts.ok ? 1 : 0;
        if (rec.block.n >= 5) flushBlock(rec, 5);
        if (opts.ok) {
          rec.up++; rec.down = 0;
          if (rec.up >= 3) { rec.up = 0; if (rec.lvl < 3) { rec.lvl++; out.changed = 'up'; } }
        } else {
          rec.down++; rec.up = 0;
          if (rec.down >= 2) { rec.down = 0; if (rec.lvl > 1) { rec.lvl--; out.changed = 'down'; } else out.changed = 'down-min'; }
        }
      }
      out.lvl = rec.lvl;
      s.history.push({ ts: Date.now(), s: opts.skill, ok: opts.ok ? 1 : 0, tag: opts.tag || null, m: opts.mode || 'practice', l: opts.level || rec.lvl });
      if (s.history.length > 600) s.history.splice(0, s.history.length - 600);
    });
    return out;
  };

  /* La sfârșitul unei sesiuni: golește blocurile ≥3, salvează rezultatele de test / recapitulare. */
  M.finishSession = function (info) {
    /* info: {mode, perSkill:{id:{n,c}}} */
    M.store.update(function () {
      Object.keys(info.perSkill || {}).forEach(function (id) {
        const rec = M.store.skill(id);
        const r = info.perSkill[id];
        if (info.mode === 'test') {
          rec.tests.push({ pct: Math.round(100 * r.c / r.n), n: r.n, ts: Date.now() });
          if (rec.tests.length > 3) rec.tests.shift();
        } else {
          if (info.mode === 'review' && r.n >= 2) {
            rec.reviews.push({ day: M.todayStr(), pct: Math.round(100 * r.c / r.n) });
            if (rec.reviews.length > 6) rec.reviews.shift();
          }
          flushBlock(rec, 3);
        }
      });
    });
  };

  /* Nivelul de dificultate pentru o abilitate (1..3) */
  M.skillLevel = function (skillId) {
    const rec = M.store.get().skills[skillId];
    return rec ? rec.lvl || 1 : 1;
  };

  /* Alege abilități pentru o sesiune, ponderat după slăbiciune și vechime. */
  M.pickSkill = function (rng, skillIds, opts) {
    opts = opts || {};
    return rng.weighted(skillIds, function (id) {
      const w = M.weakness(id);
      if (opts.uniform) return 1;
      if (w === null) return opts.newBoost === undefined ? 0.7 : opts.newBoost;      // neîncercate
      return 0.35 + 2.4 * w;
    });
  };
})(window.M);
