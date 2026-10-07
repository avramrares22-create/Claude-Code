/* Funcționare offline. Lista de fișiere și versiunea sunt scrise automat de `node tools/make-sw.mjs`. */
/*VERSION-BEGIN*/ const VERSION = "e63c330b566b"; /*VERSION-END*/
const CACHE = 'matematica-' + VERSION;
/*ASSETS-BEGIN*/ const ASSETS = [
  "./", "ai/config.json", "css/base.css", "css/components.css", "css/tokens.css", "data/messages.js", "data/mistakes.js", "data/unit1/helpers.js", "data/unit1/lessons-a.js", "data/unit1/lessons-b.js", "data/unit1/templates-a.js", "data/unit1/templates-b.js", "data/unit1/unit.js", "data/units.js", "fonts/Inter-OFL-LICENSE.txt", "fonts/NotoSansMath-OFL-LICENSE.txt", "fonts/inter-latin-ext-wght-normal.woff2", "fonts/inter-latin-wght-normal.woff2", "fonts/noto-sans-math-latin-400-normal.woff2", "icons/icon.svg", "index.html", "js/core/dom.js", "js/core/expr.js", "js/core/mathml.js", "js/core/ns.js", "js/core/progress.js", "js/core/sound.js", "js/core/store.js", "js/engine/exercise.js", "js/engine/figures.js", "js/engine/studio.js", "js/ui/ai-local.js", "js/ui/app.js", "js/ui/exercise-view.js", "js/ui/lesson-player.js", "js/ui/pages.js", "js/ui/session-view.js", "js/ui/settings.js", "js/ui/shell.js", "js/ui/stats.js", "js/ui/studio.js", "js/visuals/common.js", "js/visuals/figure.js", "js/visuals/v1.js", "js/visuals/v2.js", "manifest.webmanifest"
]; /*ASSETS-END*/

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('matematica-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html'))),
  );
});
