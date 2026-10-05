/** Inline SVG icons (24×24, stroke = currentColor) so they stay crisp and themeable. */
const svg = (body: string, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  layers: (s = 22) => svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>', s),
  mountain: (s = 22) => svg('<path d="m3 20 7-12 4 6 2-3 5 9H3Z"/><path d="m8.5 11.5 1.5 1 1.5-1"/>', s),
  compass: (s = 22) => svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>', s),
  scan: (s = 22) => svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 15c2-4 4-6 10-7"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="8" r="1.5"/>', s),
  route: (s = 22) => svg('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>', s),
  locate: (s = 22) => svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>', s),
  search: (s = 18) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  close: (s = 18) => svg('<path d="M18 6 6 18M6 6l12 12"/>', s),
  hiker: (s = 18) => svg('<circle cx="13" cy="4" r="2"/><path d="m9 22 2-7 3 3v6M7 12l2-4 4 1 3 3 3 1M11 15l-1-5"/>', s),
  bike: (s = 18) => svg('<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M15 6h2l3 11M5.5 17 9 9h6l-3.5 8M9 9 8 6H6"/>', s),
  car: (s = 18) => svg('<path d="M5 17h14M5 17v-5l2-5h10l2 5v5M5 17v2M19 17v2M4 12h16"/><circle cx="8" cy="14.5" r="1"/><circle cx="16" cy="14.5" r="1"/>', s),
  moto: (s = 18) => svg('<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M8 17h5l3-6h-4l-2-3H7M16 11l3 6M14 6h3l2 5"/>', s),
  pin: (s = 18) => svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', s),
  peak: (s = 18) => svg('<path d="m3 20 9-15 9 15H3Z"/><path d="m9 11 3 2 3-2"/>', s),
  water: (s = 18) => svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>', s),
  hut: (s = 18) => svg('<path d="m3 11 9-7 9 7v9H3v-9Z"/><path d="M10 20v-5h4v5"/>', s),
  town: (s = 18) => svg('<path d="M3 21h18M5 21V9l5-3v15M10 21V11l9-4v14"/>', s),
  eye: (s = 18) => svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', s),
  wifiOff: (s = 16) => svg('<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11.4 5"/><circle cx="12" cy="20" r="1"/>', s),
};
