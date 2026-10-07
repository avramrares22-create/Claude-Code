/* Încarcă Playwright din locul unde e instalat în acest mediu (sau din node_modules, dacă există). */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidates = ['/opt/node-tools/node_modules/', '/opt/node22/lib/node_modules/', ROOT + '/node_modules/'];
let pw = null;
for (const c of candidates) { try { pw = createRequire(c)('playwright'); break; } catch (e) { /* următorul */ } }
if (!pw) throw new Error('Playwright nu este instalat (npm i -D playwright).');
export const chromium = pw.chromium;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
export const launch = () => chromium.launch(exe ? { executablePath: exe } : {});
export const FILE_URL = 'file://' + ROOT + '/index.html';
export function watch(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
}
