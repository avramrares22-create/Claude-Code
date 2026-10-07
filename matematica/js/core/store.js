/* Salvare locală (localStorage) cu versiune, export / import / resetare. */
(function (M) {
  'use strict';
  const KEY = 'matematica.v1';
  const VERSION = 1;
  let mem = null;      // copie în memorie
  let memoryOnly = false;
  const listeners = [];

  function defaults() {
    return {
      v: VERSION,
      created: M.todayStr(),
      settings: { theme: 'auto', sound: false, motion: 'auto', celebrate: false, dailyGoal: 50 },
      xp: { total: 0, byDay: {} },
      streak: { count: 0, last: null },
      skills: {},
      lessons: {},
      tests: {},
      history: [],
      studio: { saved: [] },
    };
  }

  function migrate(s) {
    const d = defaults();
    if (!s || typeof s !== 'object') return d;
    const out = Object.assign({}, d, s);
    out.settings = Object.assign({}, d.settings, s.settings || {});
    out.xp = Object.assign({}, d.xp, s.xp || {});
    out.streak = Object.assign({}, d.streak, s.streak || {});
    out.studio = Object.assign({}, d.studio, s.studio || {});
    out.skills = s.skills || {};
    out.lessons = s.lessons || {};
    out.tests = s.tests || {};
    out.history = Array.isArray(s.history) ? s.history.slice(-600) : [];
    out.v = VERSION;
    return out;
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : defaults();
    } catch (e) {
      memoryOnly = true;
      return mem || defaults();
    }
  }
  function write() {
    if (memoryOnly) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { memoryOnly = true; }
  }

  const store = {
    get: function () { if (!mem) mem = read(); return mem; },
    isMemoryOnly: function () { return memoryOnly; },
    update: function (fn) {
      const s = store.get();
      fn(s);
      write();
      listeners.forEach(function (l) { try { l(s); } catch (e) { /* ignorăm */ } });
    },
    subscribe: function (fn) { listeners.push(fn); },
    reset: function () { mem = defaults(); write(); listeners.forEach(function (l) { l(mem); }); },
    exportJSON: function () { return JSON.stringify({ app: 'matematica', exported: new Date().toISOString(), data: store.get() }, null, 1); },
    importJSON: function (text) {
      try {
        const obj = JSON.parse(text);
        const data = obj && obj.app === 'matematica' ? obj.data : null;
        if (!data || typeof data !== 'object' || !data.skills) return { ok: false, error: 'Fișierul nu pare să fie un export valid.' };
        mem = migrate(data);
        write();
        listeners.forEach(function (l) { l(mem); });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Fișierul nu poate fi citit.' };
      }
    },

    /* ---------- ajutoare ---------- */
    skill: function (id) {
      const s = store.get();
      if (!s.skills[id]) s.skills[id] = { att: 0, cor: 0, recent: [], ts: 0, block: { n: 0, c: 0 }, sets: [], tests: [], reviews: [], mistakes: {}, lvl: 1, up: 0, down: 0, compDay: null };
      return s.skills[id];
    },
    addXp: function (n) {
      store.update(function (s) {
        const t = M.todayStr();
        s.xp.total += n;
        s.xp.byDay[t] = (s.xp.byDay[t] || 0) + n;
        const keys = Object.keys(s.xp.byDay).sort();
        if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (k) { delete s.xp.byDay[k]; });
      });
    },
    touchStreak: function () {
      store.update(function (s) {
        const t = M.todayStr();
        if (s.streak.last === t) return;
        const y = new Date(); y.setDate(y.getDate() - 1);
        s.streak.count = s.streak.last === M.todayStr(y) ? s.streak.count + 1 : 1;
        s.streak.last = t;
      });
    },
    streakNow: function () {
      const st = store.get().streak;
      if (!st.last) return 0;
      const y = new Date(); y.setDate(y.getDate() - 1);
      return st.last === M.todayStr() || st.last === M.todayStr(y) ? st.count : 0;
    },
    xpToday: function () { return store.get().xp.byDay[M.todayStr()] || 0; },
  };
  M.store = store;
})(window.M);
