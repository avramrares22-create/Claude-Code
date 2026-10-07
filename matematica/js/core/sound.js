/* Sunete mici, generate cu Web Audio (fără fișiere audio). Dezactivate implicit; setarea se ține minte. */
(function (M) {
  'use strict';
  let ctx = null;

  function enabled() { return !!M.store.get().settings.sound; }

  function tone(freq, start, dur, vol, type) {
    if (!enabled()) return;
    try {
      if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio indisponibil */ }
  }

  M.sound = {
    ok: function () { tone(660, 0, 0.12, 0.05); tone(880, 0.09, 0.16, 0.05); },
    bad: function () { tone(220, 0, 0.18, 0.04, 'triangle'); },
    tap: function () { tone(520, 0, 0.05, 0.025); },
    done: function () { tone(523, 0, 0.14, 0.05); tone(659, 0.1, 0.14, 0.05); tone(784, 0.2, 0.22, 0.05); },
  };
})(window.M);
