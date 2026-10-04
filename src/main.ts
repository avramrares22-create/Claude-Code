import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import * as maplibregl from 'maplibre-gl';
import { MapEngine, type ImageryMode, type Route, type RoutePreferences } from './engine';

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
// Copernicus / OSM credits on demand.
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
const SAC_LABEL = ['unknown', 'T1 hiking', 'T2 mountain', 'T3 demanding', 'T4 alpine', 'T5 hard alpine', 'T6 extreme'];
const KIND_LABEL = { marked: 'Marked trail', path: 'Path', track: 'Forest track', hidden: 'Hidden trail' } as const;

// ------------------------------------------------------------------ engine events

engine.on('imagery:index', ({ grids }) => status(`Sentinel-2 mosaic ready · ${grids} tiles`, 2500));
engine.on('imagery:error', ({ message }) => status(`Imagery unavailable: ${message}`, 6000));
engine.on('trails:loading', () => status('Loading trails…'));
engine.on('trails:loaded', ({ trails, pois, failedCells }) =>
  status(failedCells ? `Some trail data failed to load (${failedCells} areas)` : `${trails} trails · ${pois} places`, 2500),
);

engine.on('trail:click', (t) => {
  if (routing.active) return;
  const tags = `<span class="tag ${t.kind === 'hidden' ? 'hidden' : ''}">${KIND_LABEL[t.kind]}</span>` +
    (t.difficulty ? `<span class="tag">${SAC_LABEL[t.difficulty]}</span>` : '');
  showCard(`<h3>${esc(t.name || KIND_LABEL[t.kind])}</h3><div>${tags}</div>` +
    (t.routes ? `<div class="meta" style="margin-top:6px">${esc(t.routes)}</div>` : ''));
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
  engine.setVisibleKinds(hiddenOnly ? ['hidden'] : ['marked', 'path', 'track', 'hidden']);
  btnHidden.classList.toggle('active', hiddenOnly);
  status(hiddenOnly ? 'Showing only hidden trails' : 'Showing all trails', 1500);
});

$('btn-locate').addEventListener('click', () => geolocate.trigger());

// ------------------------------------------------------------------ routing

const routing = {
  active: false,
  from: null as [number, number] | null,
  to: null as [number, number] | null,
  markers: [] as maplibregl.Marker[],
  prefs: { hidden: 0, maxDifficulty: 4 } as RoutePreferences,
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
  showCard('<h3>Plan a hike</h3><div class="meta">Tap the start point on the map.</div>');
});

function addMarker(lngLat: [number, number], color: string) {
  routing.markers.push(new maplibregl.Marker({ color }).setLngLat(lngLat).addTo(engine.map));
}

const onRoutingTap = async (lngLat: [number, number]) => {
  if (!routing.active) return;
  if (!routing.from) {
    routing.from = lngLat;
    addMarker(lngLat, '#2e9e44');
    showCard('<h3>Plan a hike</h3><div class="meta">Now tap the destination.</div>');
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
  status('Finding the best trail…');
  const route = await engine.planRoute(routing.from, routing.to, routing.prefs);
  statusEl.hidden = true;
  renderRouteCard(route);
}

function renderRouteCard(route: Route | null) {
  const slider = `<label>Hidden trails: <b id="pref-label">${prefLabel(routing.prefs.hidden)}</b>
    <input id="pref-hidden" type="range" min="-1" max="1" step="0.5" value="${routing.prefs.hidden}"></label>
    <label>Max difficulty: <b id="diff-label">${SAC_LABEL[routing.prefs.maxDifficulty]}</b>
    <input id="pref-diff" type="range" min="1" max="6" step="1" value="${routing.prefs.maxDifficulty}"></label>`;
  if (!route) {
    showCard(`<h3>No trail connection</h3><div class="meta">Both points must be within 500 m of loaded trails that connect.
      Try points closer to the trails shown on the map.</div>${slider}`);
  } else {
    showCard(`<h3>Your hike</h3>
      <div class="stats">
        <div><b>${fmtKm(route.distance)}</b><small>distance</small></div>
        <div><b>${fmtTime(route.duration)}</b><small>walking</small></div>
        <div><b>↑${Math.round(route.ascent)}</b><small>m up</small></div>
        <div><b>↓${Math.round(route.descent)}</b><small>m down</small></div>
      </div>
      <div class="meta">${Math.round(route.hiddenShare * 100)}% on hidden trails</div>${slider}`);
  }
  const ph = card.querySelector<HTMLInputElement>('#pref-hidden')!;
  const pd = card.querySelector<HTMLInputElement>('#pref-diff')!;
  ph.addEventListener('change', () => {
    routing.prefs = { ...routing.prefs, hidden: Number(ph.value) };
    void computeRoute();
  });
  pd.addEventListener('change', () => {
    routing.prefs = { ...routing.prefs, maxDifficulty: Number(pd.value) };
    void computeRoute();
  });
}

function prefLabel(v: number) {
  return v <= -1 ? 'avoid' : v < 0 ? 'less' : v === 0 ? 'neutral' : v < 1 ? 'more' : 'seek out';
}

// ------------------------------------------------------------------ PWA

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

// Handy for debugging from the console.
(window as unknown as { engine: MapEngine }).engine = engine;
