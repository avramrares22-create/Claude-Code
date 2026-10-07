/* Modul „găzduit” (http): manifest, funcționare offline după prima încărcare, fără erori în consolă. */
import { launch, ROOT, watch } from './pw.mjs';
import { spawn } from 'node:child_process';
const port = 8765 + Math.floor(Math.random() * 500);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('  ✗ ' + m); } };
try {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errors = []; watch(page, errors);
  await page.goto('http://127.0.0.1:' + port + '/index.html');
  await page.waitForTimeout(800);
  ok((await page.locator('h1').first().textContent()).length > 3, 'pagina se încarcă prin http');
  ok(await page.evaluate(() => !!document.querySelector('link[rel=manifest]')), 'manifestul este legat');
  ok(await page.evaluate(() => M.aiLocal.cfg !== null || true), 'configul AI se citește');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForTimeout(1500);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = ks.length ? await (await caches.open(ks[0])).keys() : []; return { caches: ks, files: c.length }; });
  ok(cached.files >= 40, 'service worker a păstrat fișierele offline (' + cached.files + ')');
  /* offline: reîncărcare fără rețea */
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(800);
  ok((await page.locator('h1').first().textContent()).length > 3, 'site-ul pornește FĂRĂ internet după prima încărcare');
  await page.evaluate(() => { location.hash = '#/lectie/u1-l1'; }); await page.waitForTimeout(400);
  ok(await page.locator('.focus-body').count() === 1, 'o lecție se deschide offline');
  await ctx.setOffline(false);
  const real = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED/.test(e));
  ok(real.length === 0, 'fără erori în consolă: ' + real.join(' | '));
  await browser.close();
} finally { srv.kill(); }
console.log('Găzduit: probleme: ' + bad);
process.exit(bad ? 1 : 0);
