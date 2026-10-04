import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import * as maplibregl from 'maplibre-gl';
import { MapEngine, type ImageryMode, type Route, type RoutePreferences, type TrailKind, type TravelMode } from './engine';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status');
const card = $('card');

const engine = new MapEngine({ container: 'map' });
engine.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
engine.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
const geolocate = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserLocation: true,
});
engine.map.addControl(geolocate, 'top-right');

// Compact attribution pops open on narrow screens once the first source credits
// arrive, covering the map. Collapse it that first time; ⓘ still shows the
// Copernicus / OSM / imagery credits on demand.
const attrib = document.querySelector('.maplibregl-ctrl-attrib');
if (attrib) {
  const obs = new MutationObserver(() => {
    if (attrib.classList.contains('maplibregl-compact-show')) {
      attrib.classList.remove('maplibregl-compact-show');
      obs.disconnect();
    }
  });
  obs.observe(attrib, { attributes: true, attributeFilter: ['class'] });
}

// ------------------------------------------------------------------ helpers

/** OSM names are user content: always escape before putting into HTML. */
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

let statusTimer: number | undefined;
function status(msg: string, ms = 0) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  clearTimeout(statusTimer);
  if (ms) statusTimer = window.setTimeout(() => (statusEl.hidden = true), ms);
}

function showCard(html: string) {
  card.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`;
  card.hidden = false;
  card.querySelector('.close')!.addEventListener('click', () => {
    card.hidden = true;
    if (routing.active) resetRouting();
  });
}

const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SAC_LABEL = ['unknown', 'T1 hiking', 'T2 mountain', 'T3 demanding', 'T4 alpine', 'T5 hard alpine', 'T6 extreme'];
const KIND_LABEL: Record<TrailKind, string> = {
  marked: 'Marked trail',
  path: 'Path',
  track: 'Forest track',
  road: 'Rural road',
  hidden: 'Hidden trail',
  detected: 'Detected trail',
};
const MODE_LABEL: Record<TravelMode, string> = { foot: '🥾 Hike', bike: '🚵 Bike', moto: '🏍️ Moto/4x4' };
const ACCESS_ICON = { yes: '✓', no: '✕', unknown: '?' } as const;

// ------------------------------------------------------------------ engine events

engine.on('imagery:index', ({ grids }) => status(`Sentinel-2 mosaic ready · ${grids} tiles`, 2500));
engine.on('imagery:error', ({ message }) => status(`Imagery unavailable: ${message}`, 6000));
engine.on('imagery:hires', ({ provider }) => provider && status(`High-res imagery: ${provider}`, 2000));
engine.on('trails:loading', () => status('Loading trails…'));
engine.on('trails:loaded', ({ trails, pois, failedCells }) =>
  status(failedCells ? `Some trail data failed to load (${failedCells} areas)` : `${trails} trails · ${pois} places`, 2500),
);

engine.on('trail:click', (t) => {
  if (routing.active) return;
  const cls = t.kind === 'hidden' ? 'hidden' : t.kind === 'detected' ? 'detected' : '';
  const tags = [
    `<span class="tag ${cls}">${KIND_LABEL[t.kind]}</span>`,
    t.difficulty ? `<span class="tag">${SAC_LABEL[t.difficulty]}</span>` : '',
    t.mtb >= 0 ? `<span class="tag">MTB S${t.mtb}</span>` : '',
    t.surface && t.surface !== 'unknown' ? `<span class="tag">${esc(t.surface)}</span>` : '',
    t.grade ? `<span class="tag">grade ${t.grade}</span>` : '',
  ].join('');
  const access = `<div class="meta" style="margin-top:6px">Access: 🥾 ${ACCESS_ICON[t.foot]} · 🚵 ${ACCESS_ICON[t.bike]} · 🏍️ ${ACCESS_ICON[t.moto]}</div>`;
  const detected =
    t.kind === 'detected'
      ? `<div class="meta">Found from ${t.sources === 'gps;imagery' ? 'GPS traces + satellite imagery' : t.source === 'gps' ? 'public GPS traces' : 'satellite imagery (TrailNet)'}
         · confidence ${pct(t.confidence)}${t.usage ? ` · used by ${esc(t.usage)}` : ''}. Not on any map yet — verify on the ground.</div>`
      : '';
  showCard(`<h3>${esc(t.name || KIND_LABEL[t.kind])}</h3><div>${tags}</div>${t.routes ? `<div class="meta" style="margin-top:6px">${esc(t.routes)}</div>` : ''}${access}${detected}`);
});

engine.on('poi:click', (p) => {
  if (routing.active) return;
  showCard(`<h3>${esc(p.label || p.kind)}</h3><div class="meta">${esc(p.kind)}</div>`);
});

// ------------------------------------------------------------------ toolbar

const modes: Array<ImageryMode | 'off'> = ['truecolor', 'ndvi', 'off'];
const modeLabel = { truecolor: 'Satellite', ndvi: 'Vegetation', off: 'No imagery' } as const;
const btnLayer = $('btn-layer');
btnLayer.addEventListener('click', () => {
  const next = modes[(modes.indexOf(engine.getImageryMode()) + 1) % modes.length];
  engine.setImageryMode(next);
  btnLayer.querySelector('span')!.textContent = modeLabel[next];
  status(modeLabel[next], 1200);
});

const btn3d = $('btn-3d');
let terrainOn = false;
btn3d.addEventListener('click', () => {
  terrainOn = !terrainOn;
  engine.setTerrain3D(terrainOn);
  btn3d.classList.toggle('active', terrainOn);
});

const btnHidden = $('btn-hidden');
let hiddenOnly = false;
btnHidden.addEventListener('click', () => {
  hiddenOnly = !hiddenOnly;
  engine.setVisibleKinds(hiddenOnly ? ['hidden', 'detected'] : ['marked', 'path', 'track', 'road', 'hidden', 'detected']);
  btnHidden.classList.toggle('active', hiddenOnly);
  status(hiddenOnly ? 'Showing only hidden & detected trails' : 'Showing all trails', 1500);
});

const btnScan = $('btn-scan');
let scanning = false;
btnScan.addEventListener('click', async () => {
  if (scanning) return;
  scanning = true;
  btnScan.classList.add('active');
  status('Scanning GPS traces and satellite imagery for unmapped trails…');
  try {
    const r = await engine.discoverHiddenTrails();
    const parts = [
      typeof r.gps === 'number' ? `${r.gps} from GPS` : 'GPS unavailable',
      typeof r.imagery === 'number' ? `${r.imagery} from imagery` : 'imagery scan unavailable',
    ];
    status(r.found ? `Found ${r.found} unmapped trails (${fmtKm(r.meters)}) · ${parts.join(', ')}` : `No unmapped trails found here · ${parts.join(', ')}`, 6000);
  } catch (e) {
    status((e as Error).message, 4000);
  } finally {
    scanning = false;
    btnScan.classList.remove('active');
  }
});

$('btn-locate').addEventListener('click', () => geolocate.trigger());

// ------------------------------------------------------------------ routing

const routing = {
  active: false,
  from: null as [number, number] | null,
  to: null as [number, number] | null,
  markers: [] as maplibregl.Marker[],
  prefs: { mode: 'foot', hidden: 0, offroad: 0, maxDifficulty: 4, maxMtbScale: 3, strictAccess: false } as RoutePreferences,
};
const btnRoute = $('btn-route');

function resetRouting() {
  routing.active = false;
  routing.from = routing.to = null;
  routing.markers.forEach((m) => m.remove());
  routing.markers = [];
  engine.showRoute(null);
  btnRoute.classList.remove('active');
}

const modeSwitch = () =>
  `<div class="seg">${(Object.keys(MODE_LABEL) as TravelMode[])
    .map((m) => `<button data-mode="${m}" class="${routing.prefs.mode === m ? 'on' : ''}">${MODE_LABEL[m]}</button>`)
    .join('')}</div>`;

function bindModeSwitch() {
  card.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) =>
    b.addEventListener('click', () => {
      routing.prefs = { ...routing.prefs, mode: b.dataset.mode as TravelMode };
      if (routing.from && routing.to) void computeRoute();
      else showPrompt();
    }),
  );
}

function showPrompt() {
  showCard(`<h3>Plan a route</h3>${modeSwitch()}<div class="meta">${routing.from ? 'Now tap the destination.' : 'Tap the start point on the map.'}</div>`);
  bindModeSwitch();
}

btnRoute.addEventListener('click', () => {
  if (routing.active) {
    resetRouting();
    card.hidden = true;
    return;
  }
  resetRouting();
  routing.active = true;
  btnRoute.classList.add('active');
  if (engine.map.getZoom() < 12) status('Zoom in to a trail area, then tap a start point', 3000);
  showPrompt();
});

function addMarker(lngLat: [number, number], color: string) {
  routing.markers.push(new maplibregl.Marker({ color }).setLngLat(lngLat).addTo(engine.map));
}

const onRoutingTap = async (lngLat: [number, number]) => {
  if (!routing.active) return;
  if (!routing.from) {
    routing.from = lngLat;
    addMarker(lngLat, '#2e9e44');
    showPrompt();
    return;
  }
  if (!routing.to) {
    routing.to = lngLat;
    addMarker(lngLat, '#d7263d');
  }
  await computeRoute();
};
engine.on('map:click', (e) => void onRoutingTap(e.lngLat));
engine.on('trail:click', (e) => void onRoutingTap(e.lngLat));
engine.on('poi:click', (e) => void onRoutingTap(e.lngLat));

async function computeRoute() {
  if (!routing.from || !routing.to) return;
  status('Finding the best route…');
  const route = await engine.planRoute(routing.from, routing.to, routing.prefs);
  statusEl.hidden = true;
  renderRouteCard(route);
}

function prefLabel(v: number) {
  return v <= -1 ? 'avoid' : v < 0 ? 'less' : v === 0 ? 'neutral' : v < 1 ? 'more' : 'seek out';
}

function renderRouteCard(route: Route | null) {
  const p = routing.prefs;
  const controls = `
    <label>Hidden trails: <b>${prefLabel(p.hidden)}</b>
      <input id="pref-hidden" type="range" min="-1" max="1" step="0.5" value="${p.hidden}"></label>
    ${p.mode !== 'foot' ? `<label>Off-road: <b>${p.offroad >= 1 ? 'max' : p.offroad > 0 ? 'prefer dirt' : 'any surface'}</b>
      <input id="pref-offroad" type="range" min="0" max="1" step="0.5" value="${p.offroad}"></label>` : ''}
    ${p.mode === 'foot' ? `<label>Max difficulty: <b>${SAC_LABEL[p.maxDifficulty]}</b>
      <input id="pref-diff" type="range" min="1" max="6" step="1" value="${p.maxDifficulty}"></label>` : ''}
    ${p.mode === 'bike' ? `<label>Max MTB grade: <b>S${p.maxMtbScale}</b>
      <input id="pref-mtb" type="range" min="0" max="5" step="1" value="${p.maxMtbScale}"></label>` : ''}
    ${p.mode !== 'foot' ? `<label class="check"><input id="pref-strict" type="checkbox" ${p.strictAccess ? 'checked' : ''}> Only ways with confirmed legal access</label>` : ''}`;
  if (!route) {
    showCard(`<h3>No route found</h3>${modeSwitch()}<div class="meta">Both points must be within 500 m of loaded ways that connect and are open to this mode.
      Try points closer to the trails on the map, or relax the limits below.</div>${controls}`);
  } else {
    const warn =
      route.unknownAccessShare > 0.05 && route.mode !== 'foot'
        ? `<div class="warn">⚠️ ${pct(route.unknownAccessShare)} of this route has unconfirmed legal access for ${route.mode === 'moto' ? 'motor vehicles (Romanian forest roads usually need a permit)' : 'bikes'}.</div>`
        : '';
    showCard(`<h3>Your ${route.mode === 'foot' ? 'hike' : 'ride'}</h3>${modeSwitch()}
      <div class="stats">
        <div><b>${fmtKm(route.distance)}</b><small>distance</small></div>
        <div><b>${fmtTime(route.duration)}</b><small>${route.mode === 'foot' ? 'walking' : 'riding'}</small></div>
        <div><b>↑${Math.round(route.ascent)}</b><small>m up</small></div>
        <div><b>↓${Math.round(route.descent)}</b><small>m down</small></div>
      </div>
      <div class="meta">${pct(route.offroadShare)} off-road · ${pct(route.hiddenShare)} on hidden/detected trails · times by ${route.model === 'routenet' ? 'RouteNet (learned from real GPS trips)' : 'expert model'}</div>
      ${warn}${controls}`);
  }
  bindModeSwitch();
  const bind = (id: string, apply: (el: HTMLInputElement) => Partial<RoutePreferences>) => {
    const el = card.querySelector<HTMLInputElement>(`#${id}`);
    el?.addEventListener('change', () => {
      routing.prefs = { ...routing.prefs, ...apply(el) };
      void computeRoute();
    });
  };
  bind('pref-hidden', (el) => ({ hidden: Number(el.value) }));
  bind('pref-offroad', (el) => ({ offroad: Number(el.value) }));
  bind('pref-diff', (el) => ({ maxDifficulty: Number(el.value) }));
  bind('pref-mtb', (el) => ({ maxMtbScale: Number(el.value) }));
  bind('pref-strict', (el) => ({ strictAccess: el.checked }));
}

// ------------------------------------------------------------------ PWA

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
}

// Handy for debugging from the console.
(window as unknown as { engine: MapEngine }).engine = engine;
