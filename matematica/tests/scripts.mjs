/* index.html trebuie să încarce, în aceeași ordine, fișierele fără DOM folosite de teste, și fiecare fișier trebuie să existe. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, NO_DOM_FILES } from './load.mjs';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
srcs.forEach((s) => { if (!fs.existsSync(path.join(ROOT, s))) fail('lipsește fișierul ' + s); });
const posInHtml = NO_DOM_FILES.map((f) => srcs.indexOf(f));
NO_DOM_FILES.forEach((f, i) => { if (posInHtml[i] < 0) fail(f + ' nu este în index.html'); });
for (let i = 1; i < posInHtml.length; i++) if (posInHtml[i] >= 0 && posInHtml[i - 1] >= 0 && posInHtml[i] < posInHtml[i - 1]) fail('ordine diferită între teste și index.html la ' + NO_DOM_FILES[i]);
/* orice fișier .js din js/ și data/ trebuie încărcat */
const all = [];
const walk = (d) => { for (const f of fs.readdirSync(path.join(ROOT, d))) { const rel = d + '/' + f; if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel); else if (rel.endsWith('.js')) all.push(rel); } };
['js', 'data'].forEach(walk);
all.forEach((f) => { if (srcs.indexOf(f) < 0) fail(f + ' nu este încărcat de index.html'); });
/* fără încărcări externe în index.html și CSS */
if (/(src|href)="https?:\/\//.test(html)) fail('index.html conține o încărcare externă');
for (const f of fs.readdirSync(path.join(ROOT, 'css'))) if (/url\(\s*["']?https?:/.test(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))) fail('css/' + f + ' încarcă ceva din exterior');
/* nicio cheie secretă în site */
const secret = /(sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*["'][^"']{12,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{30,})/;
[...all, 'index.html', 'ai/config.json', 'sw.js'].forEach((f) => { if (secret.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))) fail('posibilă cheie secretă în ' + f); });
console.log('index.html: ' + srcs.length + ' scripturi, probleme: ' + bad);
process.exit(bad ? 1 : 0);
