/* Ajutoare DOM minimale: elemente HTML/SVG, icoane, anunțuri pentru cititoare de ecran. */
(function (M) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function apply(el, attrs) {
    if (!attrs) return el;
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style.setProperty(s, v[s]); });
      else if (k === 'value' && 'value' in el) el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else if (c.nodeType) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    });
    return el;
  }

  M.h = function (tag, attrs) {
    const el = document.createElement(tag);
    apply(el, attrs);
    return append(el, Array.prototype.slice.call(arguments, 2));
  };
  M.s = function (tag, attrs) {
    const el = document.createElementNS(NS, tag);
    apply(el, attrs);
    return append(el, Array.prototype.slice.call(arguments, 2));
  };
  M.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  M.rich$ = function (text, tag, cls) { return M.h(tag || 'p', { class: cls, html: M.rich(text) }); };

  /* ---------- anunțuri (aria-live) ---------- */
  M.announce = function (msg) {
    let r = document.getElementById('live');
    if (!r) return;
    r.textContent = '';
    setTimeout(function () { r.textContent = msg; }, 30);
  };

  /* ---------- preferințe de mișcare ---------- */
  M.reducedMotion = function () {
    const s = M.store.get().settings.motion;
    if (s === 'reduce') return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  /* ---------- icoane (24×24, trasee simple) ---------- */
  const P = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    cross: 'M6 6l12 12M18 6L6 18',
    close: 'M6 6l12 12M18 6L6 18',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    back: 'M19 12H5M11 6l-6 6 6 6',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
    flame: 'M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 2 1.6 2.4C10.2 8 11 5 12 3z',
    home: 'M4 11l8-7 8 7M6 10v9h12v-9',
    map: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14',
    chart: 'M5 20V10M12 20V4M19 20v-7',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
    sound: 'M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 0 1 0 7',
    mute: 'M4 10v4h4l5 4V6L8 10zM17 9l4 6M21 9l-4 6',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9z',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
    refresh: 'M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4',
    book: 'M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9',
    play: 'M8 5l11 7-11 7z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  };
  M.icon = function (name, size, cls) {
    const svg = M.s('svg', { viewBox: '0 0 24 24', width: size || 20, height: size || 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon ' + (cls || ''), focusable: 'false' });
    svg.appendChild(M.s('path', { d: P[name] || P.info }));
    return svg;
  };
})(window.M);
