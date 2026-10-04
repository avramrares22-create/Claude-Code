import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import * as maplibregl from 'maplibre-gl';
import {
  buildGpx,
  listOfflineAreas,
  MapEngine,
  parseGpxFile,
  planSize,
  PACKS,
  removeOfflineArea,
  storageUsage,
  areaTooLarge,
  type OfflineArea,
  type OfflinePlan,
  RouteFollower,
  announce,
  buildManeuvers,
  type GpxPoint,
  type TurnType,
  type ImageryMode,
  type Route,
  type RoutePreferences,
  type TrailKind,
  type TrailProps,
  type TravelMode,
} from './engine';
import {
  assessBearRisk,
  BEAR_SAFETY_TIPS,
  fetchSightings,
  loadBearGrid,
  RISK_LABEL,
  type BearRisk,
  type Sighting,
} from './engine/bears/bearRisk';
import { haversine } from './engine/geo/geodesy';
import { kvGet, kvSet } from './engine/util/kvStore';
import { icons } from './ui/icons';
import { location, WakeLock, type Fix } from './ui/location';
import { profileData, renderProfile } from './ui/profile';
import { searchLocal, searchPlaces, type Place } from './ui/search';
import { browse, routeGeometry, searchOffline, warmUp, type SearchResult } from './ui/searchClient';
import { CAT_LABEL, type Cat } from './engine/search/categories';
import { Sheet } from './ui/sheet';
import { toast } from './ui/toast';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ================================================================== engine + chrome

const engine = new MapEngine({ container: 'map' });
engine.map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');
engine.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
const sheet = new Sheet($('sheet'));
const wake = new WakeLock();

const setIcon = (id: string, svg: string) => {
  const el = $(id);
  const slot = el.querySelector('i') ?? el;
  slot.innerHTML = svg;
};
setIcon('tab-layers', icons.layers());
setIcon('tab-hidden', icons.eye(22));
setIcon('tab-scan', icons.scan());
setIcon('tab-route', icons.route());
setIcon('tab-more', icons.compass());
setIcon('fab-locate', icons.locate());
setIcon('fab-3d', icons.mountain());
document.querySelector('.search-icon')!.innerHTML = icons.search();
$('search-clear').innerHTML = icons.close();

// Compact attribution pops open on narrow screens; collapse it once (ⓘ still shows credits).
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

/** OSM names are user content: always escape before putting into HTML. */
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
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
const MODES: Array<[TravelMode, string, () => string]> = [
  ['foot', 'Hike', () => icons.hiker()],
  ['bike', 'Bike', () => icons.bike()],
  ['moto', 'Moto', () => icons.moto()],
];

function setTab(id: string | null) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === id));
}

let sheetOwner: 'layers' | 'scan' | 'route' | 'more' | 'info' | null = null;
function openSheet(owner: NonNullable<typeof sheetOwner>, html: string, state: 'peek' | 'full' = 'peek') {
  sheetOwner = owner;
  sheet.open(html, state, icons.close(16));
  document.body.classList.add('sheet-open');
  setTab(owner === 'info' ? null : `tab-${owner}`);
}
sheet.onClose(() => {
  document.body.classList.remove('sheet-open');
  if (sheetOwner === 'route') resetRouting();
  sheetOwner = null;
  setTab(hiddenOnly ? 'tab-hidden' : null);
});
const q = <T extends HTMLElement = HTMLElement>(sel: string) => sheet.content.querySelector<T>(sel);

// ================================================================== robustness

let lastErrorToast = 0;
function reportError(msg: string) {
  console.error(msg);
  if (Date.now() - lastErrorToast < 10_000) return;
  lastErrorToast = Date.now();
  toast(msg, { kind: 'error', ms: 4000 });
}
window.addEventListener('error', (e) => reportError(`Something went wrong: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason as Error | undefined;
  if (err?.name === 'AbortError') return;
  reportError(`Something went wrong: ${err?.message ?? e.reason}`);
});
engine.map.on('error', (e) => {
  // Individual tile failures are normal on mobile networks; MapLibre retries them.
  const msg = (e.error as Error | undefined)?.message ?? '';
  if (/AJAXError|Failed to fetch|tile|aborted|timed out/i.test(msg)) return;
  console.warn('map error', e.error);
});
engine.map.getCanvas().addEventListener('webglcontextlost', () =>
  toast('Graphics were reset by the system — redrawing…', { kind: 'warn', key: 'gl' }),
);

// Offline badge
function updateOnline() {
  const host = $('badges');
  host.innerHTML = navigator.onLine ? '' : `<span class="badge glass offline">${icons.wifiOff()} Offline — saved areas still work</span>`;
}
window.addEventListener('online', () => {
  updateOnline();
  toast('Back online', { kind: 'success', ms: 1500, key: 'net' });
});
window.addEventListener('offline', updateOnline);
updateOnline();

// Loading bar while the map fetches/renders tiles.
const progressEl = $('progress');
let busyScans = 0;
const setBusy = () => progressEl.classList.toggle('on', busyScans > 0 || !engine.map.areTilesLoaded());
engine.map.on('dataloading', setBusy);
engine.map.on('idle', setBusy);

// AI alignment runs by itself when zoomed in; keep the user informed, quietly.
let alignToast: (() => void) | null = null;
engine.on('align:start', () => {
  alignToast?.();
  alignToast = toast('Scanning this area with AI…', { ms: 0, key: 'align' });
});
engine.on('align:done', ({ aligned, detected }) => {
  alignToast?.();
  alignToast = null;
  if (aligned || detected) {
    const parts = [aligned ? `${aligned} trail${aligned > 1 ? 's' : ''} aligned` : '', detected ? `${detected} hidden found` : ''].filter(Boolean);
    toast(`AI: ${parts.join(' · ')}`, { kind: 'success', ms: 2500, key: 'align' });
  }
});
try {
  const off = localStorage.getItem('natura:align') === 'off';
  engine.autoAlign = !off;
  engine.trails.useAlignment = !off;
  engine.autoScan = localStorage.getItem('natura:autoscan') !== 'off';
} catch {
  // ignore
}

engine.on('imagery:error', ({ message }) => toast(`Satellite imagery unavailable: ${message}`, { kind: 'warn', ms: 5000 }));
engine.on('trails:loaded', ({ failedCells }) => {
  if (failedCells) toast(`Trail data for ${failedCells} area${failedCells > 1 ? 's' : ''} couldn't load — will retry`, { kind: 'warn', key: 'trails' });
});

// ================================================================== search

const searchInput = $<HTMLInputElement>('search');
const results = $('search-results');
const clearBtn = $('search-clear');
let searchAbort: AbortController | null = null;
let searchTimer: number | undefined;
let searchMarker: maplibregl.Marker | null = null;
const KIND_ICON: Record<Place['kind'], () => string> = { peak: icons.peak, water: icons.water, hut: icons.hut, town: icons.town, pin: icons.pin };

function closeResults() {
  results.hidden = true;
  results.innerHTML = '';
}

const POI_PLACE: Record<string, Place['kind']> = { peak: 'peak', saddle: 'peak', viewpoint: 'peak', waterfall: 'water', spring: 'water', hut: 'hut', shelter: 'hut', camp: 'hut' };

/** What can be searched without signal: loaded peaks/huts/trails and the saved offline packs. */
function* localPlaces(): Generator<Place> {
  for (const p of engine.trails.pois)
    if (p.name) yield { name: p.name, detail: [p.kind, p.ele ? `${Math.round(p.ele)} m` : ''].filter(Boolean).join(' · '), kind: POI_PLACE[p.kind] ?? 'pin', lngLat: [p.lng, p.lat], zoom: 15 };
  for (const t of engine.trails.trails)
    if (t.name) yield { name: t.name, detail: `${t.kind} trail`, kind: 'pin', lngLat: t.coords[Math.floor(t.coords.length / 2)], zoom: 15 };
  for (const pk of PACKS) yield { name: pk.name, detail: 'offline pack area', kind: 'town', lngLat: [(pk.bbox[0] + pk.bbox[2]) / 2, (pk.bbox[1] + pk.bbox[3]) / 2], zoom: pk.kind === 'country' ? 6 : 11 };
}

const RECENT_KEY = 'natura:recent-searches';
interface SearchItem {
  name: string;
  detail: string;
  icon: () => string;
  lngLat: [number, number];
  bbox?: [number, number, number, number] | null;
  cat?: Cat;
  osm?: string;
  zoom: number;
  source: 'local' | 'web';
}
const CAT_ICON = (c: Cat): (() => string) =>
  ['peak', 'saddle', 'ridge', 'viewpoint'].includes(c) ? icons.peak
  : ['lake', 'river', 'waterfall', 'spring', 'gorge'].includes(c) ? icons.water
  : ['hut', 'camp', 'lodging'].includes(c) ? icons.hut
  : ['city', 'town', 'village', 'district', 'street'].includes(c) ? icons.town
  : c === 'trail' || c === 'path' ? icons.route
  : icons.pin;
const CAT_ZOOM: Partial<Record<Cat, number>> = { city: 12, town: 13, village: 14, district: 14.5, street: 16.5, peak: 14.5, lake: 15, trail: 13 };
const CHIPS: Array<[string, Cat[]]> = [
  ['Lakes', ['lake']], ['Peaks', ['peak']], ['Huts', ['hut']], ['Waterfalls', ['waterfall']], ['Caves', ['cave', 'gorge']],
  ['Viewpoints', ['viewpoint']], ['Trails', ['trail']], ['Springs', ['spring']], ['Food', ['food']],
];

function searchFocus(): { focus: [number, number]; user: boolean } {
  const fix = location.last && Date.now() - location.last.time < 5 * 60_000 ? location.last : null;
  if (fix) return { focus: [fix.lng, fix.lat], user: true };
  const c = engine.map.getCenter();
  return { focus: [c.lng, c.lat], user: false };
}

const kmText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);

function fromLocal(r: SearchResult): SearchItem {
  const where = [r.locality, r.locality.includes(r.county) ? '' : r.county].filter(Boolean).join(', ');
  return {
    name: r.name, detail: [CAT_LABEL[r.cat], where, kmText(r.km)].filter(Boolean).join(' · '), icon: CAT_ICON(r.cat),
    lngLat: [r.lng, r.lat], bbox: r.bbox, cat: r.cat, osm: r.osm, zoom: CAT_ZOOM[r.cat] ?? 15.5, source: 'local',
  };
}

function recent(): SearchItem[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as SearchItem[]).map((r) => ({ ...r, icon: r.cat ? CAT_ICON(r.cat) : icons.pin }));
  } catch {
    return [];
  }
}
function remember(it: SearchItem) {
  try {
    const list = [it, ...recent().filter((r) => r.name !== it.name)].slice(0, 6).map(({ icon: _i, ...rest }) => rest);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

let shown: SearchItem[] = [];
function renderItems(items: SearchItem[], header = '', empty = '') {
  shown = items;
  results.hidden = false;
  results.innerHTML =
    header +
    (items.length
      ? items
          .map(
            (p, i) => `<li class="res" style="--i:${i}"><button class="res-main" data-i="${i}"><span class="ico">${p.icon()}</span>
              <span class="res-text"><div class="name">${esc(p.name)}</div><div class="detail">${esc(p.detail)}${p.source === 'web' ? ' <em>· web</em>' : ''}</div></span></button>
              <button class="res-go" data-go="${i}" aria-label="Directions to ${esc(p.name)}">${icons.route(18)}</button></li>`,
          )
          .join('')
      : empty ? `<li class="empty">${empty}</li>` : '');
  results.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => void selectItem(shown[Number(b.dataset.i)])));
  results.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const it = shown[Number(b.dataset.go)];
      remember(it);
      closeResults();
      searchInput.blur();
      void routeTo(it.lngLat);
    }),
  );
  results.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((b) =>
    b.addEventListener('click', async () => {
      const [label, cats] = CHIPS[Number(b.dataset.chip)];
      const { focus } = searchFocus();
      const r = await browse(cats, focus).catch(() => null);
      renderItems((r?.results ?? []).map(fromLocal), chipsHtml(Number(b.dataset.chip)), r ? `No ${label.toLowerCase()} nearby` : 'Search data is still loading…');
    }),
  );
}

const chipsHtml = (active = -1) =>
  `<li class="chips">${CHIPS.map(([l], i) => `<button class="chip ${i === active ? 'on' : ''}" data-chip="${i}">${l}</button>`).join('')}</li>`;

function showSuggestions() {
  const rec = recent();
  renderItems(rec, chipsHtml() + (rec.length ? '<li class="res-h">Recent</li>' : ''));
}

async function selectItem(p: SearchItem) {
  remember(p);
  searchInput.value = p.name;
  clearBtn.hidden = false;
  searchInput.blur();
  closeResults();
  searchMarker?.remove();
  searchMarker = new maplibregl.Marker({ color: '#ff8a1f' }).setLngLat(p.lngLat).addTo(engine.map);
  const sheetPad = { top: 90, bottom: window.innerHeight * 0.42, left: 40, right: 40 };
  if (p.bbox && p.bbox[2] - p.bbox[0] > 0.002 && p.cat !== 'river') engine.map.fitBounds(p.bbox, { padding: sheetPad, maxZoom: p.zoom, duration: 900 });
  else engine.map.flyTo({ center: p.lngLat, zoom: p.zoom, essential: true, padding: sheetPad, duration: 1100 });
  openSheet(
    'info',
    `<div class="place-head"><span class="place-ico">${p.icon()}</span><div><h2>${esc(p.name)}</h2><div class="sub">${esc(p.detail)}</div></div></div>
     <div class="btns"><button class="btn primary" id="pl-go">${icons.route(18)} Directions</button>${p.cat === 'trail' && p.osm?.startsWith('r') ? '<button class="btn" id="pl-trail">Show trail</button>' : ''}</div>`,
  );
  q('#pl-go')!.addEventListener('click', () => routeTo(p.lngLat));
  const showTrail = async () => {
    const segs = await routeGeometry(p.osm!, p.lngLat[0], p.lngLat[1]).catch(() => null);
    if (!segs) return toast('Trail outline not available offline yet', { kind: 'warn' });
    engine.setLine('imported', segs);
    const b = new maplibregl.LngLatBounds(segs[0][0], segs[0][0]);
    segs.flat().forEach((c) => b.extend(c));
    engine.map.fitBounds(b, { padding: sheetPad, duration: 800 });
  };
  q('#pl-trail')?.addEventListener('click', () => void showTrail());
  if (p.cat === 'trail' && p.osm?.startsWith('r')) void showTrail();
}

async function runSearch(qv: string, signal: AbortSignal) {
  const { focus, user } = searchFocus();
  const local = await searchOffline(qv, focus, user).catch(() => null);
  if (signal.aborted) return;
  let items = local ? local.results.slice(0, 10).map(fromLocal) : [];
  if (local) renderItems(items, '', '');
  // The web (Photon) adds addresses and businesses when we're not sure or found little.
  const weak = !local || items.length < 3 || (local.confidence ?? 0) < 0.4;
  if (navigator.onLine && weak && !local?.cue?.length) {
    const web = await searchPlaces(qv, signal, focus).catch(() => [] as Place[]);
    if (signal.aborted) return;
    for (const w of web) {
      const dup = items.some((it) => it.name.toLowerCase() === w.name.toLowerCase() && Math.abs(it.lngLat[0] - w.lngLat[0]) + Math.abs(it.lngLat[1] - w.lngLat[1]) < 0.02);
      if (!dup) items.push({ name: w.name, detail: w.detail, icon: KIND_ICON[w.kind], lngLat: w.lngLat, zoom: w.zoom, source: 'web' });
    }
  } else if (!local) {
    items = searchLocal(qv, localPlaces(), focus).map((p) => ({ name: p.name, detail: p.detail, icon: KIND_ICON[p.kind], lngLat: p.lngLat, zoom: p.zoom, source: 'local' as const }));
  }
  if (signal.aborted) return;
  const header = local?.anchor ? `<li class="res-h">Near ${esc(local.anchor)}</li>` : local?.nearMe ? '<li class="res-h">Near you</li>' : '';
  renderItems(items.slice(0, 12), header, navigator.onLine ? 'No places found in Romania' : 'No signal — nothing matching on this device');
}

searchInput.addEventListener('focus', () => {
  void warmUp().catch(() => undefined);
  if (!searchInput.value.trim()) showSuggestions();
});
searchInput.addEventListener('input', () => {
  const qv = searchInput.value;
  clearBtn.hidden = !qv.trim();
  clearTimeout(searchTimer);
  if (qv.trim().length < 2) return qv.trim() ? closeResults() : showSuggestions();
  searchTimer = window.setTimeout(() => {
    searchAbort?.abort();
    const ac = (searchAbort = new AbortController());
    runSearch(qv, ac.signal).catch((e) => {
      if ((e as Error).name !== 'AbortError') renderItems([], '', 'Search unavailable right now');
    });
  }, 120);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && shown[0]) void selectItem(shown[0]);
  if (e.key === 'Escape') {
    closeResults();
    searchInput.blur();
  }
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.hidden = true;
  closeResults();
  searchMarker?.remove();
  searchMarker = null;
});
engine.map.on('movestart', () => {
  if (document.activeElement === searchInput) searchInput.blur();
});

// ================================================================== location + 3D

let userMarker: maplibregl.Marker | null = null;
let following = false;
let unsubLocate: (() => void) | null = null;
const fabLocate = $('fab-locate');

function showUser(f: Fix) {
  if (!userMarker) {
    const el = document.createElement('div');
    el.className = 'user-pos';
    userMarker = new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(engine.map);
  } else userMarker.setLngLat([f.lng, f.lat]);
}

location.onError((msg) => toast(msg, { kind: 'warn', key: 'gps', ms: 5000 }));

fabLocate.addEventListener('click', () => {
  if (following) {
    following = false;
    fabLocate.classList.remove('active');
    if (!navActive && !recording) {
      unsubLocate?.();
      unsubLocate = null;
    }
    return;
  }
  following = true;
  fabLocate.classList.add('active');
  let first = true;
  unsubLocate ??= location.subscribe((f) => {
    showUser(f);
    if (following && !navActive) {
      engine.map.easeTo({ center: [f.lng, f.lat], zoom: first ? Math.max(engine.map.getZoom(), 14) : engine.map.getZoom(), duration: first ? 800 : 400 });
      first = false;
    }
  });
});
// Stop following when the user pans the map themselves.
engine.map.on('dragstart', () => {
  if (following && !navActive) {
    following = false;
    fabLocate.classList.remove('active');
  }
});

const fab3d = $('fab-3d');
let terrainOn = false;
fab3d.addEventListener('click', () => {
  terrainOn = !terrainOn;
  engine.setTerrain3D(terrainOn);
  fab3d.classList.toggle('active', terrainOn);
});

// ================================================================== layers

const ALL_KINDS: TrailKind[] = ['marked', 'path', 'track', 'road', 'hidden', 'detected'];
let visibleKinds = new Set<TrailKind>(ALL_KINDS);
let hiddenOnly = false;

function applyKinds() {
  engine.setVisibleKinds(hiddenOnly ? ['hidden', 'detected'] : [...visibleKinds]);
}

function layersSheet() {
  const mode = engine.getImageryMode();
  const kindChip = (k: TrailKind, color: string) =>
    `<button class="chip ${visibleKinds.has(k) ? 'on' : ''}" data-kind="${k}"><span class="dot" style="background:${color}"></span>${KIND_LABEL[k]}</button>`;
  openSheet(
    'layers',
    `<h2>Map layers</h2>
     <h3>Imagery</h3>
     <div class="seg" id="imagery-seg">
       ${(['truecolor', 'ndvi', 'off'] as const).map((m) => `<button data-m="${m}" class="${mode === m ? 'on' : ''}">${{ truecolor: 'Satellite', ndvi: 'Vegetation', off: 'None' }[m]}</button>`).join('')}
     </div>
     <div class="meta">Sentinel-2 (10 m, updated every few days)${engine.hiresProvider ? ` · from zoom 14: ${esc(engine.hiresProvider.label)}` : ''}</div>
     <h3>Trails</h3>
     <div class="chips">
       ${kindChip('marked', '#d7263d')}${kindChip('path', '#f3e6c4')}${kindChip('track', '#d9a55b')}
       ${kindChip('road', '#e8e8e8')}${kindChip('hidden', '#ff5fc8')}${kindChip('detected', '#35e0ff')}
     </div>
     <div class="row"><div><div class="label">Auto-scan for hidden trails</div><div class="hint">Every minute and whenever you settle on an area (GPS traces + satellite AI)</div></div>
       <label class="switch"><input id="sw-autoscan" type="checkbox" ${engine.autoScan ? 'checked' : ''}><span></span></label></div>
     <div class="row"><div><div class="label">AI trail alignment</div><div class="hint">When zoomed in, TrailNet moves trails onto the path visible in satellite imagery</div></div>
       <label class="switch"><input id="sw-align" type="checkbox" ${engine.autoAlign ? 'checked' : ''}><span></span></label></div>
     <h3>Terrain</h3>
     <div class="row"><div><div class="label">3D terrain</div><div class="hint">Tilt with two fingers</div></div>
       <label class="switch"><input id="sw-3d" type="checkbox" ${terrainOn ? 'checked' : ''}><span></span></label></div>`,
  );
  q('#imagery-seg')!.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      engine.setImageryMode(b.dataset.m as ImageryMode | 'off');
      layersSheet();
    }),
  );
  sheet.content.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.kind as TrailKind;
      if (visibleKinds.has(k)) visibleKinds.delete(k);
      else visibleKinds.add(k);
      b.classList.toggle('on', visibleKinds.has(k));
      hiddenOnly = false;
      $('tab-hidden').classList.remove('active');
      applyKinds();
    }),
  );
  q<HTMLInputElement>('#sw-3d')!.addEventListener('change', () => fab3d.click());
  q<HTMLInputElement>('#sw-autoscan')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    engine.autoScan = on;
    try {
      localStorage.setItem('natura:autoscan', on ? 'on' : 'off');
    } catch {
      // ignore
    }
    if (on) void engine.alignView();
  });
  q<HTMLInputElement>('#sw-align')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    engine.autoAlign = on;
    engine.trails.setUseAlignment(on);
    try {
      localStorage.setItem('natura:align', on ? 'on' : 'off');
    } catch {
      // ignore
    }
    if (on) void engine.alignView();
  });
}
$('tab-layers').addEventListener('click', () => (sheetOwner === 'layers' ? sheet.close() : layersSheet()));

$('tab-hidden').addEventListener('click', () => {
  hiddenOnly = !hiddenOnly;
  applyKinds();
  $('tab-hidden').classList.toggle('active', hiddenOnly);
  toast(hiddenOnly ? 'Showing only hidden & detected trails' : 'Showing all trails', { ms: 1500, key: 'filter' });
});

// ================================================================== trail / place info

engine.on('trail:click', (t) => {
  if (routing.active) return void onRoutingTap(t.lngLat);
  if (navActive) return;
  showTrailInfo(t);
});
engine.on('poi:click', (p) => {
  if (routing.active) return void onRoutingTap(p.lngLat);
  if (navActive) return;
  openSheet(
    'info',
    `<h2>${esc(p.label || p.kind)}</h2><div class="sub">${esc(p.kind.replace('_', ' '))}</div>
     <div class="btns"><button class="btn primary" id="go-here">${icons.route(18)} Directions</button></div>`,
  );
  q('#go-here')!.addEventListener('click', () => routeTo(p.lngLat));
});
engine.on('map:click', (e) => {
  if (routing.active) return void onRoutingTap(e.lngLat);
  if (sheetOwner === 'info' || sheetOwner === 'layers') sheet.close();
  closeResults();
});

function showTrailInfo(t: TrailProps & { lngLat: [number, number] }) {
  const cls = t.kind === 'hidden' ? 'hidden' : t.kind === 'detected' ? 'detected' : '';
  const access = (a: string) => (a === 'yes' ? 'good' : a === 'no' ? 'bad' : 'warn');
  const accessTxt = (a: string) => (a === 'yes' ? 'allowed' : a === 'no' ? 'not allowed' : 'unknown');
  const chips = [
    `<span class="chip ${cls}">${KIND_LABEL[t.kind]}</span>`,
    t.difficulty ? `<span class="chip">${SAC_LABEL[t.difficulty]}</span>` : '',
    t.mtb >= 0 ? `<span class="chip">MTB S${t.mtb}</span>` : '',
    t.surface && t.surface !== 'unknown' ? `<span class="chip">${esc(t.surface)}</span>` : '',
    t.grade ? `<span class="chip">Grade ${t.grade}</span>` : '',
    t.aligned ? `<span class="chip detected">AI-aligned · moved ${t.aligned} m</span>` : '',
  ].join('');
  const detected =
    t.kind === 'detected'
      ? `<div class="warnbox">Found from ${t.sources === 'gps;imagery' ? 'GPS traces <b>and</b> satellite imagery' : t.source === 'gps' ? 'public GPS traces' : 'satellite imagery (TrailNet)'} ·
         confidence ${pct(t.confidence)}${t.usage ? ` · used on ${esc(t.usage)}` : ''}. Not on any map yet — check it on the ground.</div>`
      : '';
  openSheet(
    'info',
    `<h2>${esc(t.name || KIND_LABEL[t.kind])}</h2>
     ${t.routes ? `<div class="sub">${esc(t.routes)}</div>` : ''}
     <div class="chips">${chips}</div>
     <h3>Access</h3>
     <div class="chips">
       <span class="chip ${access(t.foot)}">${icons.hiker(14)} ${accessTxt(t.foot)}</span>
       <span class="chip ${access(t.bike)}">${icons.bike(14)} ${accessTxt(t.bike)}</span>
       <span class="chip ${access(t.moto)}">${icons.moto(14)} ${accessTxt(t.moto)}</span>
     </div>
     ${detected}
     <div class="btns"><button class="btn primary" id="go-here">${icons.route(18)} Directions</button></div>`,
  );
  q('#go-here')!.addEventListener('click', () => routeTo(t.lngLat));
}

/** Waits briefly for a GPS fix (starting the watch if needed). */
function currentFix(timeoutMs = 8000): Promise<Fix | null> {
  if (location.last && Date.now() - location.last.time < 60_000) return Promise.resolve(location.last);
  return new Promise((resolve) => {
    let done = false;
    const unsub = location.subscribe((f) => {
      if (done) return;
      done = true;
      showUser(f);
      setTimeout(unsub, 0);
      resolve(f);
    });
    setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      resolve(null);
    }, timeoutMs);
  });
}

/** Directions from the user's position to a point (asks for a start if there is no GPS fix). */
async function routeTo(dest: [number, number]) {
  startRouting();
  routing.to = dest;
  addMarker(dest, '#d7263d');
  openSheet('route', `<h2>Directions</h2>${modeSeg()}<div class="sub">Finding your position…</div>`);
  bindModeSeg();
  const here = await currentFix();
  if (!routing.active || routing.to !== dest) return;
  if (here) {
    routing.from = [here.lng, here.lat];
    addMarker(routing.from, '#2e9e44');
    await computeRoute();
  } else {
    routePrompt('No GPS fix yet — tap your start point on the map.');
  }
}

// ================================================================== scan

$('tab-scan').addEventListener('click', async () => {
  if (busyScans) return;
  if (engine.map.getZoom() < 12) {
    toast('Zoom in closer (to a valley or ridge) to scan for hidden trails', { kind: 'warn' });
    return;
  }
  const steps = { map: 'Loading mapped trails', gps: 'Reading public GPS traces', imagery: 'Running TrailNet on satellite imagery' };
  openSheet(
    'scan',
    `<h2>Scanning for hidden trails</h2><div class="sub">Looking for paths people use that no map shows.</div>
     <ul class="steps">${Object.entries(steps).map(([k, v]) => `<li id="step-${k}">${v}</li>`).join('')}</ul>`,
  );
  const tab = $('tab-scan');
  tab.classList.add('busy');
  busyScans++;
  setBusy();
  try {
    const r = await engine.discoverHiddenTrails(undefined, (step, status) => {
      const li = q(`#step-${step}`);
      if (!li) return;
      li.className = status === 'start' ? 'on' : status === 'done' ? 'done' : '';
      if (status === 'failed') li.textContent = `${steps[step]} — unavailable`;
    });
    const part = (v: number | string, label: string) => (typeof v === 'number' ? `${v} from ${label}` : `${label} unavailable`);
    if (sheetOwner === 'scan') {
      sheet.content.insertAdjacentHTML(
        'beforeend',
        `<h3>Result</h3><div class="stats" style="grid-template-columns:repeat(2,1fr)">
           <div class="stat"><b>${r.found}</b><small>unmapped trails</small></div>
           <div class="stat"><b>${fmtKm(r.meters)}</b><small>total length</small></div></div>
         <div class="meta">${part(r.gps, 'GPS traces')} · ${part(r.imagery, 'satellite imagery')}${r.aligned ? ` · ${r.aligned} mapped trails AI-aligned to the imagery` : ''}. Detected trails are drawn in <span style="color:var(--detected)">cyan</span> — tap one for details.</div>`,
      );
    }
    toast(r.found ? `Found ${r.found} unmapped trails (${fmtKm(r.meters)})` : 'No unmapped trails here', { kind: r.found ? 'success' : 'info' });
  } catch (e) {
    toast((e as Error).message, { kind: 'error' });
  } finally {
    busyScans--;
    setBusy();
    tab.classList.remove('busy');
  }
});

// ================================================================== routing

const routing = {
  active: false,
  from: null as [number, number] | null,
  to: null as [number, number] | null,
  markers: [] as maplibregl.Marker[],
  prefs: { mode: 'foot', hidden: 0, offroad: 0, maxDifficulty: 4, maxMtbScale: 3, strictAccess: false } as RoutePreferences,
  route: null as Route | null,
  token: 0,
};
let scrubMarker: maplibregl.Marker | null = null;

try {
  const saved = JSON.parse(localStorage.getItem('natura:prefs') ?? 'null') as Partial<RoutePreferences> | null;
  if (saved) routing.prefs = { ...routing.prefs, ...saved };
} catch {
  // ignore
}
const savePrefs = () => {
  try {
    localStorage.setItem('natura:prefs', JSON.stringify(routing.prefs));
  } catch {
    // ignore
  }
};

function resetRouting() {
  routing.active = false;
  routing.from = routing.to = null;
  routing.route = null;
  routing.token++;
  routing.markers.forEach((m) => m.remove());
  routing.markers = [];
  scrubMarker?.remove();
  scrubMarker = null;
  engine.showRoute(null);
}

function startRouting() {
  resetRouting();
  routing.active = true;
}

const modeSeg = () =>
  `<div class="seg" id="mode-seg">${MODES.map(([m, label, ico]) => `<button data-mode="${m}" class="${routing.prefs.mode === m ? 'on' : ''}">${ico()} ${label}</button>`).join('')}</div>`;

function bindModeSeg() {
  q('#mode-seg')?.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      routing.prefs = { ...routing.prefs, mode: b.dataset.mode as TravelMode };
      savePrefs();
      if (routing.from && routing.to) void computeRoute();
      else routePrompt();
    }),
  );
}

function routePrompt(msg?: string) {
  openSheet('route', `<h2>Plan a route</h2>${modeSeg()}<div class="sub">${msg ?? (routing.from ? 'Now tap the destination.' : 'Tap your start point on the map — or use “Route here” on any trail or place.')}</div>
    ${!routing.from && location.last ? `<button class="btn block" id="from-me">${icons.locate()} Start from my location</button>` : ''}`);
  bindModeSeg();
  q('#from-me')?.addEventListener('click', () => {
    const f = location.last!;
    routing.from = [f.lng, f.lat];
    addMarker(routing.from, '#2e9e44');
    routePrompt();
  });
}

$('tab-route').addEventListener('click', () => {
  if (sheetOwner === 'route') return sheet.close();
  startRouting();
  if (engine.map.getZoom() < 11) toast('Zoom in to the area you want to explore', { ms: 2500 });
  routePrompt();
});

function addMarker(lngLat: [number, number], color: string) {
  routing.markers.push(new maplibregl.Marker({ color }).setLngLat(lngLat).addTo(engine.map));
}

async function onRoutingTap(lngLat: [number, number]) {
  if (!routing.active) return;
  if (!routing.from) {
    routing.from = lngLat;
    addMarker(lngLat, '#2e9e44');
    if (routing.to) return void computeRoute();
    return routePrompt();
  }
  if (!routing.to) {
    routing.to = lngLat;
    addMarker(lngLat, '#d7263d');
    await computeRoute();
  }
}

async function computeRoute() {
  if (!routing.from || !routing.to) return;
  const token = ++routing.token;
  busyScans++;
  setBusy();
  try {
    const route = await engine.planRoute(routing.from, routing.to, routing.prefs);
    if (token !== routing.token) return; // a newer request superseded this one
    routing.route = route;
    renderRouteSheet(route);
  } catch (e) {
    if (token === routing.token) toast(`Routing failed: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    busyScans--;
    setBusy();
  }
}

function prefLabel(v: number) {
  return v <= -1 ? 'avoid' : v < 0 ? 'less' : v === 0 ? 'neutral' : v < 1 ? 'more' : 'seek out';
}

function renderRouteSheet(route: Route | null) {
  const p = routing.prefs;
  const slider = (id: string, label: string, value: string, min: number, max: number, step: number, v: number) =>
    `<label class="slider"><div class="top"><span>${label}</span><b>${value}</b></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  const options = `<h3>Options</h3>
    ${slider('pref-hidden', 'Hidden trails', prefLabel(p.hidden), -1, 1, 0.5, p.hidden)}
    ${p.mode !== 'foot' ? slider('pref-offroad', 'Off-road', p.offroad >= 1 ? 'maximum' : p.offroad > 0 ? 'prefer dirt' : 'any surface', 0, 1, 0.5, p.offroad) : ''}
    ${p.mode === 'foot' ? slider('pref-diff', 'Max difficulty', SAC_LABEL[p.maxDifficulty], 1, 6, 1, p.maxDifficulty) : ''}
    ${p.mode === 'bike' ? slider('pref-mtb', 'Max MTB grade', `S${p.maxMtbScale}`, 0, 5, 1, p.maxMtbScale) : ''}
    ${p.mode !== 'foot' ? `<div class="row"><div><div class="label">Confirmed legal access only</div><div class="hint">Skip ways without explicit permission</div></div>
       <label class="switch"><input id="pref-strict" type="checkbox" ${p.strictAccess ? 'checked' : ''}><span></span></label></div>` : ''}`;
  if (!route) {
    openSheet(
      'route',
      `<h2>No route found</h2>${modeSeg()}<div class="sub">Both points must be within 500 m of trails that connect and are open to this mode. Try points closer to the lines on the map, or relax the options.</div>${options}`,
    );
  } else {
    const warn =
      route.unknownAccessShare > 0.05 && route.mode !== 'foot'
        ? `<div class="warnbox">⚠︎ ${pct(route.unknownAccessShare)} of this route has unconfirmed legal access for ${route.mode === 'moto' ? 'motor vehicles — Romanian forest roads usually need a permit' : 'bikes'}.</div>`
        : '';
    openSheet(
      'route',
      `<div class="route-head">
         <div class="rh-text"><h2>${fmtTime(route.duration)} <span class="rh-dist">(${fmtKm(route.distance)})</span></h2>
         <div class="sub">${route.mode === 'foot' ? 'Hike' : route.mode === 'bike' ? 'Ride' : 'Moto ride'} · ${pct(route.offroadShare)} off-road${route.hiddenShare ? ` · ${pct(route.hiddenShare)} hidden trails` : ''}</div></div>
         <button class="btn primary start-btn" id="nav-start">${icons.compass(18)} Start</button>
       </div>
       ${modeSeg()}
       <div class="stats">
         <div class="stat"><b>${fmtKm(route.distance)}</b><small>distance</small></div>
         <div class="stat"><b>${fmtTime(route.duration)}</b><small>${route.model === 'routenet' ? 'RouteNet' : 'estimate'}</small></div>
         <div class="stat"><b>↑${Math.round(route.ascent)}</b><small>m up</small></div>
         <div class="stat"><b>↓${Math.round(route.descent)}</b><small>m down</small></div>
       </div>
       <div id="profile"></div>
       ${warn}
       ${options}
       <div class="btns"><button class="btn" id="route-gpx">Save as GPX</button></div>`,
    );
    const pd = profileData(route.coords, route.elevations);
    const host = q('#profile');
    if (pd && host) {
      renderProfile(host, pd, (pt) => {
        if (!pt) {
          scrubMarker?.remove();
          scrubMarker = null;
          return;
        }
        if (!scrubMarker) {
          const el = document.createElement('div');
          el.className = 'scrub-dot';
          scrubMarker = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(engine.map);
        } else scrubMarker.setLngLat(pt);
      });
    }
    q('#nav-start')!.addEventListener('click', () => startNavigation(route));
    q('#route-gpx')!.addEventListener('click', () =>
      shareGpx(`Natura ${route.mode} route ${new Date().toLocaleDateString()}`, route.coords.map(([lng, lat], i) => ({ lng, lat, ele: route.elevations[i] }))),
    );
    // Fit the route above the sheet.
    const b = new maplibregl.LngLatBounds(route.coords[0], route.coords[0]);
    route.coords.forEach((c) => b.extend(c));
    engine.map.fitBounds(b, { padding: { top: 90, bottom: window.innerHeight * 0.5, left: 40, right: 40 }, maxZoom: 16, duration: 700 });
  }
  bindModeSeg();
  const bind = (id: string, apply: (el: HTMLInputElement) => Partial<RoutePreferences>) => {
    const el = q<HTMLInputElement>(`#${id}`);
    el?.addEventListener('change', () => {
      routing.prefs = { ...routing.prefs, ...apply(el) };
      savePrefs();
      void computeRoute();
    });
  };
  bind('pref-hidden', (el) => ({ hidden: Number(el.value) }));
  bind('pref-offroad', (el) => ({ offroad: Number(el.value) }));
  bind('pref-diff', (el) => ({ maxDifficulty: Number(el.value) }));
  bind('pref-mtb', (el) => ({ maxMtbScale: Number(el.value) }));
  bind('pref-strict', (el) => ({ strictAccess: el.checked }));
}

// ================================================================== navigation (turn-by-turn)

let navActive = false;
let navUnsub: (() => void) | null = null;
let navFollow = true;
let voiceOn = (() => {
  try {
    return localStorage.getItem('natura:voice') !== 'off';
  } catch {
    return true;
  }
})();
const hud = $('nav-hud');
const navBar = document.createElement('div');
navBar.className = 'nav-bar glass';
navBar.hidden = true;
document.body.append(navBar);
const recenterBtn = document.createElement('button');
recenterBtn.className = 'recenter glass';
recenterBtn.hidden = true;
recenterBtn.innerHTML = `${icons.compass(18)} Recenter`;
document.body.append(recenterBtn);
recenterBtn.addEventListener('click', () => {
  navFollow = true;
  recenterBtn.hidden = true;
});
engine.map.on('dragstart', () => {
  if (!navActive) return;
  navFollow = false;
  recenterBtn.hidden = false;
});

const ARROW: Record<TurnType, string> = {
  depart: 'M12 20V5M6 11l6-6 6 6',
  straight: 'M12 20V5M6 11l6-6 6 6',
  'slight-left': 'M15 20v-6a4 4 0 0 0-1.2-2.8L8 5.5M8 11V5.5h5.5',
  'slight-right': 'M9 20v-6a4 4 0 0 1 1.2-2.8L16 5.5M16 11V5.5h-5.5',
  left: 'M17 20v-7a4 4 0 0 0-4-4H5M10 4 5 9l5 5',
  right: 'M7 20v-7a4 4 0 0 1 4-4h8M14 4l5 5-5 5',
  'sharp-left': 'M16 20V8a3 3 0 0 0-5.1-2.1L5 12M5 6v6h6',
  'sharp-right': 'M8 20V8a3 3 0 0 1 5.1-2.1L19 12M19 6v6h-6',
  uturn: 'M8 20V9a5 5 0 0 1 10 0v4M14 9l4 4 4-4',
  arrive: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21ZM12 7v5',
};
const arrowSvg = (t: TurnType, size = 46) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${ARROW[t]}"/></svg>`;

function speak(text: string) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch {
    // speech unavailable
  }
}

const fmtClock = (secondsFromNow: number) => new Date(Date.now() + secondsFromNow * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

// ------------------------------------------------------------------ bear risk (corner widget while navigating)

const bearBox = document.createElement('div');
bearBox.className = 'bear-risk glass';
bearBox.hidden = true;
bearBox.setAttribute('role', 'button');
bearBox.setAttribute('aria-label', 'Bear risk details');
document.body.append(bearBox);

const bear = {
  risk: null as BearRisk | null,
  sightings: null as Sighting[] | null,
  fetchedAt: 0,
  fetchedFrom: null as [number, number] | null,
  computedAt: 0,
  computedFrom: null as [number, number] | null,
  expanded: false,
  lastWarn: 0,
  lastLevel: '' as string,
  fetching: false,
  triedAt: 0,
};
bearBox.addEventListener('click', () => {
  bear.expanded = !bear.expanded;
  renderBear();
});

const LIGHT_TEXT: Record<BearRisk['light'], string> = { day: 'daylight', twilight: 'dawn/dusk — peak bear activity', night: 'night — bears move more' };

function seasonText(f: number) {
  return f >= 1.2 ? 'autumn feeding season (most conflicts)' : f >= 0.9 ? 'active season' : f >= 0.5 ? 'bears waking / preparing dens' : 'denning season (some bears still active)';
}

function renderBear() {
  const r = bear.risk;
  if (!r) {
    bearBox.innerHTML = `<div class="br-head">🐻 Bear risk</div><div class="br-wait">Estimating…</div>`;
    return;
  }
  const cell = (label: string, x: BearRisk['r10']) =>
    `<div class="br-row"><small>${label}</small><b class="lvl-${x.level}">${x.index}</b><span class="lvl-${x.level}">${RISK_LABEL[x.level]}</span></div>`;
  const recent10 = r.r10.recent;
  const live = !r.liveData
    ? 'Live sightings unavailable (no signal) — using the census map only.'
    : recent10 >= 0.5
      ? `About ${Math.max(1, Math.round(recent10))} recent bear sighting${recent10 >= 1.5 ? 's' : ''} reported within 10 km (last 30 days).`
      : 'No bear sightings reported within 10 km in the last 30 days (most sightings are never reported).';
  bearBox.classList.toggle('expanded', bear.expanded);
  bearBox.innerHTML = `<div class="br-head">🐻 Bear risk</div>${cell('10 km', r.r10)}${cell('1 km', r.r1)}
    ${
      bear.expanded
        ? `<div class="br-more">
        <p>≈ <b>${Math.round(r.r10.bears)}</b> bears live within 10 km (2025 genetic census, spread over habitat).</p>
        <p>${esc(live)}</p>
        <p>Now: ${seasonText(r.season)} · ${LIGHT_TEXT[r.light]}${r.modeFactor > 1 ? ' · riding fast and quiet surprises bears more' : r.modeFactor < 1 ? ' · engine noise warns bears off' : ''}.</p>
        <ul>${BEAR_SAFETY_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p class="br-note">A 1–100 estimate of how likely you are to meet a bear, from public data. It can't see individual bears, and a low number never means "no bears". Tap to close.</p>
      </div>`
        : ''
    }`;
}

/** Downloads recent sightings; resolves true when a new list arrived. Retries at most every 2 minutes. */
async function refreshSightings(f: Fix): Promise<boolean> {
  if (bear.fetching || !navigator.onLine || Date.now() - bear.triedAt < 2 * 60_000) return false;
  bear.fetching = true;
  bear.triedAt = Date.now();
  try {
    bear.sightings = await fetchSightings(f.lng, f.lat);
    bear.fetchedAt = Date.now();
    bear.fetchedFrom = [f.lng, f.lat];
    bear.computedAt = 0; // recompute with the new data
    return true;
  } catch {
    return false; // keep any older list; the census map still works
  } finally {
    bear.fetching = false;
  }
}

async function updateBearRisk(f: Fix, mode: string) {
  const here: [number, number] = [f.lng, f.lat];
  const stale = Date.now() - bear.fetchedAt > 10 * 60_000 || !bear.fetchedFrom || haversine(...bear.fetchedFrom, ...here) > 8000;
  if (stale)
    void refreshSightings(f).then((fresh) => {
      if (fresh) void updateBearRisk(f, mode);
    });
  // Recompute every 30 s or after moving 150 m.
  if (bear.computedFrom && Date.now() - bear.computedAt < 30_000 && haversine(...bear.computedFrom, ...here) < 150) return;
  let grid;
  try {
    grid = await loadBearGrid();
  } catch {
    return;
  }
  bear.risk = assessBearRisk(grid, { lng: f.lng, lat: f.lat, mode, sightings: bear.sightings ?? undefined });
  bear.computedAt = Date.now();
  bear.computedFrom = here;
  renderBear();
  // Spoken warning when the risk right around you becomes very high (at most every 10 minutes).
  const lvl = bear.risk.r1.level;
  if (lvl === 'very-high' && bear.lastLevel !== 'very-high' && Date.now() - bear.lastWarn > 10 * 60_000) {
    bear.lastWarn = Date.now();
    speak('Bear risk is very high around you. Make noise and stay alert.');
  }
  bear.lastLevel = lvl;
}

function showBearRisk(on: boolean) {
  bearBox.hidden = !on;
  if (on) {
    bear.expanded = false;
    bear.computedAt = 0;
    bear.triedAt = 0;
    bear.lastLevel = '';
    renderBear();
  }
}

let turnMarker: maplibregl.Marker | null = null;

function startNavigation(route: Pick<Route, 'coords' | 'elevations' | 'duration'> & { segments?: Route['segments'] }) {
  stopNavigation(false);
  const navStarted = Date.now();
  let lastNext = -1;
  const { coords, elevations, duration } = route;
  const follower = new RouteFollower(coords, elevations, duration);
  const maneuvers = buildManeuvers(coords, route.segments ?? coords.slice(1).map(() => ({ wayId: 0, kind: 'path' })));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(...coords[i - 1], ...coords[i]));
  const spokenStage = new Map<number, number>(); // maneuver index → last announced stage (2 far, 1 near, 0 now)
  navActive = true;
  navFollow = true;
  engine.scanFocus = coords[0];
  document.body.classList.add('navigating');
  sheet.close();
  routing.active = false;
  engine.showRoute({ coords });
  void wake.acquire();
  hud.hidden = false;
  navBar.hidden = false;
  showBearRisk(true);
  hud.className = 'nav-hud glass';
  hud.innerHTML = `<div class="turn"><span class="turn-ico">${arrowSvg('depart')}</span><div><div class="turn-dist">Waiting for GPS…</div><div class="turn-text">${esc(maneuvers[0]?.text ?? '')}</div></div></div>`;
  speak(maneuvers[0] ? `${maneuvers[0].spoken}.` : 'Starting navigation');
  let lastBearing = engine.map.getBearing();
  let warned = false;
  const dest = coords[coords.length - 1];

  navUnsub = location.subscribe((f) => {
    showUser(f);
    engine.scanFocus = [f.lng, f.lat];
    void updateBearRisk(f, routing.prefs.mode);
    const s = follower.update(f.lng, f.lat, f.accuracy);
    // Segment index of the snapped position, for the grey "done" part.
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] < s.along) seg++;
    engine.setRouteProgress(coords, seg, s.snapped);

    const next = maneuvers.find((m) => m.along > s.along + 3) ?? maneuvers[maneuvers.length - 1];
    const after = maneuvers[maneuvers.indexOf(next) + 1];
    const toNext = Math.max(0, next.along - s.along);
    const k0 = maneuvers.indexOf(next);
    if (k0 !== lastNext) {
      lastNext = k0;
      // New instruction: animate the banner and move the turn marker on the map.
      hud.classList.remove('flip');
      void hud.offsetWidth;
      hud.classList.add('flip');
      turnMarker?.remove();
      turnMarker = null;
      if (next.type !== 'arrive' && next.type !== 'depart' && next.type !== 'straight') {
        const el = document.createElement('div');
        el.className = 'turn-marker';
        el.innerHTML = arrowSvg(next.type, 22);
        turnMarker = new maplibregl.Marker({ element: el }).setLngLat(coords[Math.min(next.index, coords.length - 1)]).addTo(engine.map);
      }
    }
    hud.classList.toggle('off-route', s.offRoute);
    hud.innerHTML = s.offRoute
      ? `<div class="turn"><span class="turn-ico">${arrowSvg('uturn')}</span><div><div class="turn-dist">Off route</div><div class="turn-text">${Math.round(s.offset)} m from the trail</div></div>
         <button class="btn primary" id="nav-reroute">Reroute</button></div>`
      : `<div class="turn"><span class="turn-ico">${arrowSvg(next.type)}</span><div><div class="turn-dist">${fmtDist(toNext)}</div><div class="turn-text">${esc(next.text)}</div></div></div>
         ${after && after.along - next.along < 400 ? `<div class="then">Then ${arrowSvg(after.type, 18)} ${esc(after.text.replace(/ onto| on/, ''))}</div>` : ''}`;
    hud.querySelector('#nav-reroute')?.addEventListener('click', () => void reroute(f, dest));

    navBar.innerHTML = `<div class="nb-main"><b>${fmtTime(s.remainingTime)}</b><span>${fmtDist(s.remaining)} · arrive ${fmtClock(s.remainingTime)}${s.climbLeft > 20 ? ` · ↑${Math.round(s.climbLeft)} m` : ''}</span></div>
      <button class="nb-btn" id="nav-voice" aria-label="Voice">${voiceOn ? '🔊' : '🔇'}</button>
      <button class="btn" id="nav-stop">End</button>`;
    navBar.querySelector('#nav-stop')!.addEventListener('click', () => stopNavigation(true));
    navBar.querySelector('#nav-voice')!.addEventListener('click', () => {
      voiceOn = !voiceOn;
      try {
        localStorage.setItem('natura:voice', voiceOn ? 'on' : 'off');
      } catch {
        // ignore
      }
      if (!voiceOn) speechSynthesis?.cancel();
    });

    // Voice: far (~250 m), near (~60 m), now (<20 m) — each once per maneuver.
    const k = maneuvers.indexOf(next);
    const stage = toNext < 20 ? 0 : toNext < 70 ? 1 : toNext < 300 ? 2 : 3;
    const prev = spokenStage.get(k) ?? 4;
    if (!s.offRoute && stage < prev && stage < 3 && next.type !== 'depart') {
      spokenStage.set(k, stage);
      speak(announce(next, toNext));
    }

    // Camera: heading-up, tilted, user low on screen — like car navigation.
    if (navFollow) {
      const ahead = (() => {
        const target = s.along + 40;
        let i = seg;
        while (i < cum.length - 1 && cum[i] < target) i++;
        return coords[Math.min(coords.length - 1, i)];
      })();
      const kx = Math.cos((f.lat * Math.PI) / 180);
      let b = (Math.atan2((ahead[0] - s.snapped[0]) * kx, ahead[1] - s.snapped[1]) * 180) / Math.PI;
      // Smooth the heading to avoid jitter from GPS noise.
      const diff = ((b - lastBearing + 540) % 360) - 180;
      b = lastBearing + diff * 0.5;
      lastBearing = b;
      engine.map.easeTo({
        center: [f.lng, f.lat],
        bearing: b,
        pitch: 55,
        zoom: Math.max(16, Math.min(17.5, engine.map.getZoom())),
        padding: { top: window.innerHeight * 0.35, bottom: 120, left: 0, right: 0 },
        duration: 900,
        easing: (t) => t,
      });
    }

    if (s.offRoute && !warned) {
      warned = true;
      speak('You are off route. Tap reroute to find a way back.');
    }
    if (!s.offRoute) warned = false;
    if (s.arrived) {
      speak('You have arrived at your destination.');
      const took = (Date.now() - navStarted) / 1000;
      stopNavigation(true);
      openSheet(
        'info',
        `<div class="arrive"><div class="arrive-ico">${arrowSvg('arrive', 34)}</div><h2>You have arrived</h2>
         <div class="stats" style="grid-template-columns:repeat(3,1fr)">
           <div class="stat"><b>${fmtKm(cum[cum.length - 1])}</b><small>distance</small></div>
           <div class="stat"><b>${fmtTime(took)}</b><small>time</small></div>
           <div class="stat"><b>↑${Math.round(route.elevations.reduce((a, e, i) => (i && e != null && route.elevations[i - 1] != null && e > route.elevations[i - 1]! ? a + e - route.elevations[i - 1]! : a), 0))}</b><small>m climbed</small></div>
         </div>
         <button class="btn primary block" id="arrive-done">Done</button></div>`,
      );
      q('#arrive-done')?.addEventListener('click', () => sheet.close());
    }
  });
}

async function reroute(f: Fix, dest: [number, number]) {
  toast('Finding a new route…', { key: 'reroute', ms: 1500 });
  const route = await engine.planRoute([f.lng, f.lat], dest, routing.prefs).catch(() => null);
  if (!route) return toast('No route back to the trail network from here', { kind: 'error' });
  speak('Route updated.');
  startNavigation(route);
}

function stopNavigation(clear: boolean) {
  navUnsub?.();
  navUnsub = null;
  if (!navActive) return;
  navActive = false;
  engine.scanFocus = null;
  hud.hidden = true;
  navBar.hidden = true;
  recenterBtn.hidden = true;
  showBearRisk(false);
  turnMarker?.remove();
  turnMarker = null;
  document.body.classList.remove('navigating');
  engine.map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
  if (!recording) void wake.release();
  if (clear) resetRouting();
}

// ================================================================== recording

interface SavedTrack {
  id: string;
  name: string;
  start: number;
  distance: number;
  duration: number;
  points: GpxPoint[];
}
const TRACKS_KEY = 'tracks:v1';
const CURRENT_KEY = 'tracks:current';
let recording = false;
let rec: GpxPoint[] = [];
let recDist = 0;
let recUnsub: (() => void) | null = null;
let recTicker: number | undefined;

function startRecording(resume: GpxPoint[] = []) {
  recording = true;
  rec = resume;
  recDist = 0;
  for (let i = 1; i < rec.length; i++) recDist += haversine(rec[i - 1].lng, rec[i - 1].lat, rec[i].lng, rec[i].lat);
  void wake.acquire();
  recUnsub = location.subscribe((f) => {
    showUser(f);
    if (f.accuracy > 50) return; // ignore poor fixes
    const last = rec[rec.length - 1];
    const d = last ? haversine(last.lng, last.lat, f.lng, f.lat) : 0;
    if (last && d < 5) return;
    recDist += d;
    rec.push({ lng: f.lng, lat: f.lat, ele: f.altitude ?? undefined, time: f.time });
    engine.setLine('track', rec.map((p) => [p.lng, p.lat] as [number, number]));
    // Crash-safe: persist the in-progress track every few points.
    if (rec.length % 10 === 0) void kvSet(CURRENT_KEY, rec);
  });
  recTicker = window.setInterval(() => sheetOwner === 'more' && moreSheet(), 5000);
  toast('Recording started — keep the app open', { kind: 'success' });
}

async function stopRecording() {
  recUnsub?.();
  recUnsub = null;
  clearInterval(recTicker);
  recording = false;
  if (!navActive) void wake.release();
  if (rec.length > 1) {
    const start = rec[0].time ?? Date.now();
    const t: SavedTrack = {
      id: String(start),
      name: `Track ${new Date(start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`,
      start,
      distance: recDist,
      duration: ((rec[rec.length - 1].time ?? start) - start) / 1000,
      points: rec,
    };
    const all = (await kvGet<SavedTrack[]>(TRACKS_KEY, Infinity)) ?? [];
    await kvSet(TRACKS_KEY, [t, ...all]);
    toast(`Saved ${fmtKm(recDist)}`, { kind: 'success' });
  }
  await kvSet(CURRENT_KEY, null);
  rec = [];
  engine.setLine('track', null);
}

// Offer to resume a recording interrupted by a crash or iOS killing the app.
void kvGet<GpxPoint[] | null>(CURRENT_KEY, Infinity).then((pts) => {
  if (pts && pts.length > 1) {
    toast('An unsaved recording was found', { ms: 0, action: { label: 'Resume', run: () => startRecording(pts) } });
  }
});

async function shareGpx(name: string, points: GpxPoint[]) {
  const file = new File([buildGpx(name, points)], `${name.replace(/[^\w\-]+/g, '_')}.gpx`, { type: 'application/gpx+xml' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ================================================================== GPX import

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.gpx,application/gpx+xml,application/xml,text/xml';
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (!f) return;
  try {
    const g = parseGpxFile(await f.text());
    if (!g.lines.length) throw new Error('This GPX has no tracks or routes');
    const lines = g.lines.map((l) => l.map((p) => [p.lng, p.lat] as [number, number]));
    engine.setLine('imported', lines);
    const all = lines.flat();
    const b = new maplibregl.LngLatBounds(all[0], all[0]);
    all.forEach((c) => b.extend(c));
    engine.map.fitBounds(b, { padding: { top: 90, bottom: window.innerHeight * 0.45, left: 40, right: 40 }, duration: 700 });
    const longest = g.lines.reduce((a, l) => (l.length > a.length ? l : a));
    let dist = 0;
    for (let i = 1; i < longest.length; i++) dist += haversine(longest[i - 1].lng, longest[i - 1].lat, longest[i].lng, longest[i].lat);
    openSheet(
      'info',
      `<h2>${esc(g.name ?? f.name)}</h2><div class="sub">${fmtKm(dist)} · ${g.lines.length} line${g.lines.length > 1 ? 's' : ''}${g.waypoints.length ? ` · ${g.waypoints.length} waypoints` : ''}</div>
       <div class="btns"><button class="btn primary" id="imp-nav">${icons.compass(18)} Navigate this track</button><button class="btn" id="imp-clear">Remove</button></div>`,
    );
    q('#imp-nav')!.addEventListener('click', async () => {
      const coords = longest.map((p) => [p.lng, p.lat] as [number, number]);
      // Use the file's elevations, filling gaps from the DEM.
      const lo = (k: 0 | 1, fn: (...v: number[]) => number) => fn(...coords.map((c) => c[k]));
      await engine.elevation.prepare([lo(0, Math.min), lo(1, Math.min), lo(0, Math.max), lo(1, Math.max)]).catch(() => {});
      const elev = longest.map((p) => p.ele ?? engine.elevation.get(p.lng, p.lat) ?? NaN);
      startNavigation({ coords, elevations: elev, duration: (dist / 1.1) * (routing.prefs.mode === 'foot' ? 1 : 0.3) });
    });
    q('#imp-clear')!.addEventListener('click', () => {
      engine.setLine('imported', null);
      sheet.close();
    });
  } catch (e) {
    toast(`Couldn't open GPX: ${(e as Error).message}`, { kind: 'error' });
  }
});

// ================================================================== more: record, tracks, offline, import

async function moreSheet() {
  const tracks = (await kvGet<SavedTrack[]>(TRACKS_KEY, Infinity)) ?? [];
  const areas = await listOfflineAreas();
  const recStats = recording
    ? `<div class="stats" style="grid-template-columns:repeat(2,1fr)"><div class="stat"><b>${fmtKm(recDist)}</b><small>recorded</small></div>
       <div class="stat"><b>${rec[0]?.time ? fmtTime((Date.now() - rec[0].time) / 1000) : '0 min'}</b><small>elapsed</small></div></div>`
    : '';
  const wasFull = sheet.current === 'full';
  openSheet(
    'more',
    `<h2>More</h2>
     <h3>Record</h3>
     ${recStats}
     <button class="btn block ${recording ? '' : 'primary'}" id="rec-toggle">${recording ? 'Stop & save recording' : '● Record a track'}</button>
     <button class="btn block" id="gpx-import">Import GPX…</button>
     ${tracks.length ? `<h3>My tracks</h3>${tracks.slice(0, 20).map((t) => `<div class="row"><div><div class="label">${esc(t.name)}</div><div class="hint">${fmtKm(t.distance)} · ${fmtTime(t.duration)}</div></div>
        <div class="btns" style="margin:0"><button class="btn" data-show="${t.id}">Show</button><button class="btn" data-export="${t.id}">GPX</button></div></div>`).join('')}` : ''}
     <h3>Offline maps</h3>
     <div class="sub">Save satellite, terrain, trails and labels to use with no or weak signal. Navigation and routing keep working.</div>
     <div id="off-section">${await offlineSectionHtml(areas)}</div>
     <h3>About</h3>
     <div class="meta">Natura · Sentinel-2 © Copernicus · Trails © OpenStreetMap contributors · TrailNet & RouteNet run on your phone.</div>`,
    wasFull ? 'full' : 'peek',
  );
  q('#rec-toggle')!.addEventListener('click', async () => {
    if (recording) await stopRecording();
    else startRecording();
    void moreSheet();
  });
  q('#gpx-import')!.addEventListener('click', () => fileInput.click());
  sheet.content.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = tracks.find((x) => x.id === b.dataset.show)!;
      const coords = t.points.map((p) => [p.lng, p.lat] as [number, number]);
      engine.setLine('imported', coords);
      const bb = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bb.extend(c));
      engine.map.fitBounds(bb, { padding: 60, duration: 700 });
      sheet.set('peek');
    }),
  );
  sheet.content.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = tracks.find((x) => x.id === b.dataset.export)!;
      void shareGpx(t.name, t.points);
    }),
  );
  bindOfflineSection(areas);
}
$('tab-more').addEventListener('click', () => (sheetOwner === 'more' ? sheet.close() : void moreSheet()));

// ------------------------------------------------------------------ offline maps

interface OfflineJob {
  id: string;
  name: string;
  step: string;
  done: number;
  total: number;
  ac: AbortController;
}
/** One download at a time; it keeps going while the sheet is closed. */
let offlineJob: OfflineJob | null = null;
const packPlans = new Map<string, Promise<OfflinePlan>>();
const planFor = (id: string) => {
  let p = packPlans.get(id);
  if (!p) packPlans.set(id, (p = engine.planPack(id)));
  return p;
};

const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`);
/** Rough on-device render time: ~0.8 s per tile across the worker pool. */
const fmtRender = (tiles: number) => (tiles > 60 ? ` · ~${fmtTime(tiles * 0.8)} to render` : '');

function jobHtml(j: OfflineJob) {
  return `<div class="off-job"><div class="label">Downloading ${esc(j.name)}</div>
    <div class="bar"><span id="off-bar" style="width:${j.total ? (100 * j.done) / j.total : 0}%"></span></div>
    <div class="row" style="padding:6px 0;border:0"><div class="hint" id="off-step">${esc(j.step)} · ${j.done}/${j.total}</div>
    <button class="btn" id="off-cancel">Pause</button></div></div>`;
}

async function offlineSectionHtml(areas: OfflineArea[]): Promise<string> {
  const usage = await storageUsage();
  const saved = new Map(areas.map((a) => [a.id, a]));
  const plans = await Promise.all(PACKS.map((p) => planFor(p.id).catch(() => null)));
  const packRow = (i: number) => {
    const pk = PACKS[i];
    const plan = plans[i];
    const a = saved.get(pk.id);
    const busy = offlineJob?.id === pk.id;
    const status = a ? (a.complete ? '✓ Saved' : 'Incomplete') : plan ? `${fmtMB(plan.estimateMB)}${fmtRender(plan.rendered)}` : '';
    const action = busy ? '' : a?.complete ? `<button class="btn" data-go="${pk.id}">Show</button><button class="btn" data-del="${pk.id}">Remove</button>` : a ? `<button class="btn primary" data-dl="${pk.id}">Resume</button><button class="btn" data-del="${pk.id}">Remove</button>` : `<button class="btn" data-dl="${pk.id}">Download</button>`;
    return `<div class="row"><div><div class="label">${esc(pk.name)}</div><div class="hint">${pk.kind === 'country' ? 'Country overview · zoom 6–12' : pk.kind === 'city' ? 'City · full detail' : 'Mountains & trails · full detail'} · ${status}</div></div>
      <div class="btns" style="margin:0">${action}</div></div>`;
  };
  const custom = areas.filter((a) => !PACKS.some((p) => p.id === a.id));
  return `${usage ? `<div class="meta">Using ${fmtMB(usage.used / 1048576)}${usage.quota ? ` of ${fmtMB(usage.quota / 1048576)} available` : ''}</div>` : ''}
    ${offlineJob ? jobHtml(offlineJob) : ''}
    <button class="btn block" id="off-plan" ${offlineJob ? 'disabled' : ''}>Save the area on screen</button>
    ${custom.map((a) => `<div class="row"><div><div class="label">${esc(a.name)}</div><div class="hint">${new Date(a.savedAt).toLocaleDateString()} · ${a.sizeMB ? fmtMB(a.sizeMB) : `${a.tiles} tiles`}${a.complete ? '' : ' · incomplete'}</div></div>
      <div class="btns" style="margin:0"><button class="btn" data-go="${a.id}">Show</button><button class="btn" data-del="${a.id}">Remove</button></div></div>`).join('')}
    <h3>Ready-made packs</h3>
    ${PACKS.map((_, i) => packRow(i)).join('')}`;
}

function bindOfflineSection(areas: OfflineArea[]) {
  const root = q('#off-section');
  if (!root) return;
  q('#off-plan')?.addEventListener('click', () => void offlinePlanSheet());
  q('#off-cancel')?.addEventListener('click', () => offlineJob?.ac.abort());
  root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      const bbox = (areas.find((x) => x.id === b.dataset.go) ?? PACKS.find((x) => x.id === b.dataset.go))!.bbox;
      engine.map.fitBounds(bbox as [number, number, number, number], { duration: 700 });
      sheet.set('peek');
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const a = areas.find((x) => x.id === b.dataset.del);
      if (!confirm(`Remove “${a?.name ?? 'this area'}” from this device?`)) return;
      b.disabled = true;
      await removeOfflineArea(b.dataset.del!);
      void refreshOffline();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-dl]').forEach((b) =>
    b.addEventListener('click', async () => {
      const plan = await planFor(b.dataset.dl!);
      void startOfflineDownload(plan);
    }),
  );
}

/** Re-renders the offline section if the More sheet is showing. */
async function refreshOffline() {
  if (sheetOwner !== 'more' || !q('#off-section')) return;
  const areas = await listOfflineAreas();
  const root = q('#off-section');
  if (!root) return;
  root.innerHTML = await offlineSectionHtml(areas);
  bindOfflineSection(areas);
}

async function startOfflineDownload(plan: OfflinePlan) {
  if (offlineJob) return toast('Another download is running — pause it first', { kind: 'warn' });
  if (!navigator.onLine) return toast('Connect to the internet to download maps', { kind: 'warn' });
  const job: OfflineJob = { id: plan.pack.id, name: plan.pack.name, step: 'Starting', done: 0, total: planSize(plan) + 4, ac: new AbortController() };
  offlineJob = job;
  void refreshOffline();
  let last = 0;
  try {
    const r = await engine.downloadOffline(
      plan,
      (step, done, total) => {
        Object.assign(job, { step, done, total });
        const now = performance.now();
        if (now - last < 250 && done < total) return;
        last = now;
        const bar = q('#off-bar');
        if (bar) bar.style.width = `${(100 * done) / total}%`;
        const st = q('#off-step');
        if (st) st.textContent = `${step} · ${done}/${total}`;
      },
      job.ac.signal,
    );
    toast(
      r.failed
        ? `Saved “${job.name}” — ${r.failed} tiles failed. Tap Resume later to complete it.`
        : `“${job.name}” is ready to use offline`,
      { kind: r.failed ? 'warn' : 'success', ms: 5000 },
    );
  } catch (err) {
    if (job.ac.signal.aborted) toast(`Paused “${job.name}” — tap Resume to continue`, { ms: 3500 });
    else toast(`Download failed: ${(err as Error).message}`, { kind: 'error' });
  } finally {
    offlineJob = null;
    void refreshOffline();
  }
}

/** Saves the view as a custom offline area. */
async function offlinePlanSheet() {
  if (engine.map.getZoom() < 10.5) return toast('Zoom in to the area you want to save (a valley, ridge or town)', { kind: 'warn' });
  const plan = await engine.planOffline();
  const c = engine.map.getCenter();
  const name = searchInput.value.trim() || `Area near ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`;
  plan.pack = { ...plan.pack, name };
  const tooBig = areaTooLarge(plan);
  openSheet(
    'more',
    `<h2>Save this area</h2>
     <div class="sub">${esc(name)} · about ${fmtMB(plan.estimateMB)}${fmtRender(plan.rendered)}${engine.hiresProvider?.id === 'esri' ? ' · Esri aerial photos can’t be stored offline (their terms); Sentinel-2 imagery is saved instead' : ''}</div>
     ${tooBig ? '<div class="warnbox">This area is too large. Zoom in a little, or download a ready-made pack.</div>' : ''}
     <div class="btns"><button class="btn primary" id="off-go" ${tooBig ? 'disabled' : ''}>Download</button><button class="btn" id="off-back">Back</button></div>`,
  );
  q('#off-back')!.addEventListener('click', () => void moreSheet());
  q('#off-go')!.addEventListener('click', () => {
    void startOfflineDownload(plan);
    void moreSheet();
  });
}

// ================================================================== PWA

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      // The new worker takes over immediately; offer a reload to pick up the new UI.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) toast('Natura was updated', { ms: 0, action: { label: 'Reload', run: () => window.location.reload() } });
      });
    } catch (e) {
      console.warn('service worker registration failed', e);
    }
  });
  // Keep cached tiles and recordings from being evicted.
  void navigator.storage?.persist?.();
}

// Handy for debugging from the console.
(window as unknown as { engine: MapEngine }).engine = engine;

// ================================================================== long-press: point info

/** Long-press (touch) or right-click shows the spot's coordinates/elevation and routing actions. */
function pointSheet(lngLat: [number, number]) {
  if (navActive) return;
  const ele = engine.elevation.get(...lngLat);
  const coord = `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`;
  openSheet(
    'info',
    `<h2>Dropped pin</h2><div class="sub">${coord}${ele !== null ? ` · ${Math.round(ele)} m` : ''}</div>
     <div class="btns"><button class="btn primary" id="pt-to">${icons.route(18)} Directions</button><button class="btn" id="pt-from">Start here</button></div>
     <button class="btn block" id="pt-copy">Copy coordinates</button>`,
  );
  if (ele === null) {
    void engine.elevation
      .prepare([lngLat[0] - 0.001, lngLat[1] - 0.001, lngLat[0] + 0.001, lngLat[1] + 0.001])
      .then(() => {
        const e = engine.elevation.get(...lngLat);
        const sub = q('.sub');
        if (e !== null && sub && sheetOwner === 'info') sub.textContent = `${coord} · ${Math.round(e)} m`;
      })
      .catch(() => {});
  }
  q('#pt-to')!.addEventListener('click', () => routeTo(lngLat));
  q('#pt-from')!.addEventListener('click', () => {
    startRouting();
    routing.from = lngLat;
    addMarker(lngLat, '#2e9e44');
    routePrompt();
  });
  q('#pt-copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(coord);
      toast('Coordinates copied', { kind: 'success', ms: 1500 });
    } catch {
      toast(coord, { ms: 5000 });
    }
  });
}

{
  const canvas = engine.map.getCanvasContainer();
  let timer: number | undefined;
  let start: { x: number; y: number } | null = null;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return cancel();
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
    timer = window.setTimeout(() => {
      if (!start) return;
      const r = canvas.getBoundingClientRect();
      const ll = engine.map.unproject([start.x - r.left, start.y - r.top]);
      pointSheet([ll.lng, ll.lat]);
      start = null;
    }, 550);
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
  }, { passive: true });
  canvas.addEventListener('touchend', cancel, { passive: true });
  engine.map.on('contextmenu', (e) => pointSheet([e.lngLat.lng, e.lngLat.lat]));
}

// ================================================================== first launch

try {
  if (!localStorage.getItem('natura:welcomed')) {
    localStorage.setItem('natura:welcomed', '1');
    setTimeout(() => {
      openSheet(
        'info',
        `<h2>Welcome to Natura</h2>
         <div class="sub">An off-road & nature map of Romania.</div>
         <ul class="steps" style="margin-top:12px">
           <li class="done"><span><b>Scan</b> finds trails no map shows — from satellite imagery and real GPS trips.</span></li>
           <li class="done"><span><b>Route</b> plans hikes, bike and moto rides with times learned from real trips.</span></li>
           <li class="done"><span><b>Long-press</b> the map for coordinates, elevation and “route here”.</span></li>
           <li class="done"><span><b>More</b> → save areas for offline use, record and import GPX tracks.</span></li>
         </ul>
         <button class="btn primary block" id="welcome-ok">Let’s explore</button>`,
      );
      q('#welcome-ok')?.addEventListener('click', () => sheet.close());
    }, 1200);
  }
} catch {
  // storage unavailable: skip onboarding
}
