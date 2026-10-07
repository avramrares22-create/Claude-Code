/* Rulează toate verificările și afișează un rezumat.   node tests/run-all.mjs [--fast]  (--fast sare peste testele din browser) */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fast = process.argv.includes('--fast');
const STEPS = [
  ['Exerciții generate (1.000 / familie / nivel)', ['tests/generate.mjs', '1000']],
  ['Coerența datelor (lecții, abilități, greșeli)', ['tests/data.mjs']],
  ['Nucleu (răspunsuri, niveluri, adaptiv, salvare)', ['tests/core.mjs']],
  ['Studio (cereri → exerciții verificate)', ['tests/studio.mjs']],
  ['Contrast culori (WCAG AA)', ['tests/contrast.mjs']],
  ['Fișier offline la zi', ['tools/make-sw.mjs', '--check']],
  ['index.html încarcă toate fișierele, în ordine', ['tests/scripts.mjs']],
];
if (!fast) STEPS.push(['Browser: toate cele 8 lecții, de la un capăt la altul', ['tests/e2e/tour.mjs']], ['Browser: tastatură, test, progres, Studio, setări, accesibilitate, 3 dimensiuni × 2 teme', ['tests/e2e/full.mjs']], ['Browser: mod găzduit, offline după prima încărcare', ['tests/e2e/hosted.mjs']]);
let bad = 0;
for (const [name, args] of STEPS) {
  const t0 = Date.now();
  const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60 * 1000 });
  const ok = r.status === 0 && !/erori:\s*\[/.test(r.stdout);
  const last = (r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || (r.stderr || '').trim().split('\n').slice(-1)[0] || '';
  console.log((ok ? '✓ ' : '✗ ') + name + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)\n    ' + last.slice(0, 160));
  if (!ok) { bad++; console.log((r.stdout || '').split('\n').filter((l) => /✗/.test(l)).slice(0, 12).join('\n')); }
}
console.log(bad ? '\n' + bad + ' pași cu probleme.' : '\nToate verificările au trecut.');
process.exit(bad ? 1 : 0);
