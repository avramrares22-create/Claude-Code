/* Scrie în sw.js lista fișierelor de păstrat offline și o versiune (hash al conținutului).
   node tools/make-sw.mjs          — actualizează sw.js
   node tools/make-sw.mjs --check  — doar verifică dacă sw.js este la zi (exit 1 dacă nu) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['css', 'fonts', 'js', 'data', 'icons'];
const FILES = ['index.html', 'manifest.webmanifest', 'ai/config.json'];
export function collect() {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(path.join(ROOT, d)).sort()) { const rel = d + '/' + f; if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel); else out.push(rel); } };
  DIRS.forEach(walk);
  FILES.forEach((f) => { if (fs.existsSync(path.join(ROOT, f))) out.push(f); });
  return out.sort();
}
export function hash(files) {
  const h = crypto.createHash('sha256');
  files.forEach((f) => { h.update(f); h.update(fs.readFileSync(path.join(ROOT, f))); });
  return h.digest('hex').slice(0, 12);
}
export function render(src, files, ver) {
  return src.replace(/\/\*VERSION-BEGIN\*\/[\s\S]*?\/\*VERSION-END\*\//, '/*VERSION-BEGIN*/ const VERSION = ' + JSON.stringify(ver) + '; /*VERSION-END*/')
    .replace(/\/\*ASSETS-BEGIN\*\/[\s\S]*?\/\*ASSETS-END\*\//, '/*ASSETS-BEGIN*/ const ASSETS = ' + JSON.stringify(['./'].concat(files), null, 1).replace(/\n\s*/g, ' ').replace(/\[ /, '[\n  ').replace(/ \]$/, '\n]') + '; /*ASSETS-END*/');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = collect(), ver = hash(files);
  const cur = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const next = render(cur, files, ver);
  if (process.argv.includes('--check')) { if (cur !== next) { console.log('sw.js nu este la zi: rulează `node tools/make-sw.mjs`'); process.exit(1); } console.log('sw.js la zi (' + files.length + ' fișiere, versiunea ' + ver + ')'); }
  else { fs.writeFileSync(path.join(ROOT, 'sw.js'), next); console.log('sw.js actualizat: ' + files.length + ' fișiere, versiunea ' + ver); }
}
