/*
 * Service worker: makes the app installable and fast on repeat launches.
 *  - App shell (same-origin GET): stale-while-revalidate.
 *  - Terrain tiles, fonts, reference vector tiles: cache-first (they rarely change).
 *  - Sentinel COG range reads, STAC and Overpass: network only (huge / dynamic);
 *    rendered imagery tiles are cached by the imagery workers instead.
 */
const SHELL = 'nature-shell-v1';
const ASSETS = 'nature-assets-v1';
const OFFLINE = 'nature-offline-v1'; // offline packs, written by the app, never trimmed
const KEEP = [SHELL, ASSETS, OFFLINE, 'nature-engine-tiles-v1'];
const ASSET_LIMIT = 4000;

// Works under any base path (e.g. /Claude-Code/ on GitHub Pages).
const ROOT = new URL(self.registration.scope).pathname;

// App shell files (scripts, styles, workers, icons), filled in at build time.
const PRECACHE = [];
const shellUrls = () => [ROOT, ...PRECACHE.map((f) => ROOT + f)];

self.addEventListener('install', (event) => {
  // Fresh copies (not the HTTP cache), so the shell is consistent with this build.
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(shellUrls().map((u) => fetch(u, { cache: 'reload' }).then((r) => (r.ok ? c.put(u, r) : undefined)))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nature-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(pruneShell)
      .then(() => self.clients.claim()),
  );
});

/** Drops hashed build files from older deploys. */
async function pruneShell() {
  if (!PRECACHE.length) return;
  const keep = new Set(shellUrls().map((u) => new URL(u, self.location.origin).href));
  const cache = await caches.open(SHELL);
  for (const req of await cache.keys()) {
    if (new URL(req.url).pathname.startsWith(ROOT + 'assets/') && !keep.has(req.url)) await cache.delete(req);
  }
}

// Esri imagery is deliberately not cached: its terms restrict offline storage.
const CACHE_FIRST = [
  /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\//,
  /^https:\/\/tiles\.openfreemap\.org\//,
  /^https:\/\/geoportal\.ancpi\.ro\/maps\/rest\/services\/Ortofoto\//,
];

// Pre-built data (trail cells, mosaic) changes daily/weekly: serve cached, refresh behind.
const isData = (url) => url.pathname.startsWith(ROOT + 'data/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  event.respondWith(fromOfflinePack(req).then((hit) => hit || route(req, url)));
});

/**
 * Offline packs win: the user explicitly saved these for use without signal.
 * Our own data files (trail cells, mosaic, metadata) are refreshed behind the
 * scenes when online, so a saved pack keeps up with the weekly rebuilds.
 */
async function fromOfflinePack(req) {
  try {
    const cache = await caches.open(OFFLINE);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit && navigator.onLine && isData(new URL(req.url))) {
      fetch(req)
        .then((res) => (res.ok ? cache.put(req, res) : undefined))
        .catch(() => {});
    }
    return hit || null;
  } catch {
    return null;
  }
}

function route(req, url) {
  if (url.origin === self.location.origin) {
    return staleWhileRevalidate(req, isData(url) ? ASSETS : SHELL);
  }
  if (CACHE_FIRST.some((re) => re.test(req.url))) return cacheFirst(req);
  return fetch(req);
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreVary: servers may send Vary: Origin, and page requests carry an Origin the install fetch did not.
  const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate', ignoreVary: true });
  const net = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(async () => (req.mode === 'navigate' ? await cache.match(ROOT) : undefined) ?? Response.error());
  return hit || net;
}

let puts = 0;
async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (++puts % 200 === 0) trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
}
