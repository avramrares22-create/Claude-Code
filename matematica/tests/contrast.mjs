/* Verifică contrastul WCAG AA (≥ 4,5:1 pentru text) pentru perechile de culori din css/tokens.css, în modul luminos și întunecat. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load.mjs';
const css = fs.readFileSync(path.join(ROOT, 'css/tokens.css'), 'utf8');
function block(re) { const m = re.exec(css); return m ? m[1] : ''; }
function vars(txt) { const o = {}; txt.replace(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g, (_, k, v) => { o[k] = v; }); return o; }
const light = vars(block(/:root\s*\{([\s\S]*?)\n\}/));
const dark = Object.assign({}, vars(block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)));
const lum = (hex) => { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'], ['accent', 'surface'], ['accent', 'bg'], ['on-accent', 'accent'],
  ['ok', 'ok-bg'], ['bad', 'bad-bg'], ['hint', 'hint-bg'], ['gold', 'gold-bg'], ['accent', 'accent-soft'],
  ['ca', 'surface'], ['cb', 'surface'], ['cc', 'surface'], ['ch', 'surface'], ['ca', 'ca-soft'], ['cb', 'cb-soft'], ['cc', 'cc-soft'], ['ch', 'ch-soft'],
  ['ok', 'surface'], ['bad', 'surface'], ['cx', 'surface'],
];
let bad = 0;
for (const [name, set] of [['luminos', light], ['întunecat', Object.assign({}, light, dark)]]) {
  for (const [f, b] of PAIRS) {
    if (!set[f] || !set[b]) { console.log('  ? lipsește ' + f + ' / ' + b + ' în ' + name); bad++; continue; }
    const r = ratio(set[f], set[b]);
    if (r < 4.5) { bad++; console.log('  ✗ ' + name + ': ' + f + ' pe ' + b + ' = ' + r.toFixed(2)); }
  }
}
console.log('Contrast: ' + (bad ? bad + ' probleme' : 'toate perechile ≥ 4,5:1 (AA)'));
process.exit(bad ? 1 : 0);
