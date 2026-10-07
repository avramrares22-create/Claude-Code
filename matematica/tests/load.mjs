/* Încarcă fișierele fără DOM (nucleu, motor, date) într-un context Node, în aceeași ordine ca în index.html. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const NO_DOM_FILES = [
  'js/core/ns.js', 'js/core/mathml.js', 'js/core/expr.js', 'js/core/store.js', 'js/core/progress.js',
  'js/engine/exercise.js', 'js/engine/figures.js', 'js/engine/studio.js',
  'data/unit1/helpers.js', 'data/unit1/templates-a.js', 'data/unit1/templates-b.js',
  'data/unit1/unit.js', 'data/unit1/lessons-a.js', 'data/unit1/lessons-b.js',
  'data/units.js', 'data/messages.js', 'data/mistakes.js',
];

export function loadAll(extra) {
  globalThis.window = globalThis;
  const files = NO_DOM_FILES.concat(extra || []);
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: f });
  }
  return globalThis.M;
}
