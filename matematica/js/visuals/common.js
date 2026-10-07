/* Elemente comune pentru vizualizările interactive. */
(function (M) {
  'use strict';
  const h = M.h, s = M.s;
  const V = (M.vz = { _n: 0 });

  V.card = function (host) { const c = h('div', { class: 'viz' }); host.appendChild(c); return c; };

  /* slider accesibil (săgeți = pas); onInput primește valoarea numerică */
  V.slider = function (o) {
    const id = 'sl' + (++V._n);
    const fmt = o.fmt || function (v) { return M.fmt(v, o.dec === undefined ? 0 : o.dec); };
    const out = h('output', { for: id }, fmt(o.value));
    const input = h('input', { type: 'range', id: id, min: o.min, max: o.max, step: o.step || 1, value: o.value, 'aria-label': o.aria || o.label, 'aria-valuetext': fmt(o.value) });
    input.addEventListener('input', function () {
      const v = parseFloat(input.value);
      out.textContent = fmt(v);
      input.setAttribute('aria-valuetext', fmt(v));
      if (o.onInput) o.onInput(v);
    });
    const el = h('div', { class: 'slider ' + (o.cls || '') }, h('label', { for: id }, o.label), input, out);
    return {
      el: el, input: input,
      get: function () { return parseFloat(input.value); },
      set: function (v) { input.value = v; out.textContent = fmt(parseFloat(input.value)); input.setAttribute('aria-valuetext', fmt(parseFloat(input.value))); },
      range: function (min, max) { input.min = min; input.max = max; },
      disable: function (b) { input.disabled = !!b; },
    };
  };

  V.pill = function (cls, html) { return h('span', { class: 'pillbox ' + cls, html: html }); };
  V.note = function () { return h('p', { class: 'viz-note', 'aria-live': 'polite' }); };
  V.setNote = function (el, text, good) { el.textContent = text; el.classList.toggle('good', !!good); };

  /* coordonate pointer → coordonate SVG */
  V.toSvg = function (svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  };

  /* ține evidența valorilor distincte încercate */
  V.counter = function () {
    const seen = {};
    return { add: function (k) { seen[k] = true; return Object.keys(seen).length; }, n: function () { return Object.keys(seen).length; }, has: function (k) { return !!seen[k]; } };
  };

  /* înlocuiește conținutul unui element cu un nou SVG */
  V.swap = function (host, node) { M.clear(host); host.appendChild(node); };

  M.tx = function (t) { return M.tex(t); };
})(window.M);
