/* Cât de bine înțelege parserul cu reguli cererile din setul de test? Un model antrenat ar trebui să depășească acest scor.
   node ai/eval_baseline.mjs [test|val|train] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../tests/load.mjs';
const M = loadAll();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const split = process.argv[2] || 'test';
const rows = fs.readFileSync(path.join(HERE, 'data', split + '.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const norm = (p) => ({ count: p.count, level: p.level || 0, ramp: !!p.ramp, weak: !!p.weak, ids: Array.from(new Set((p.templates || []).map((t) => t.id))).sort(), where: JSON.stringify((p.templates || []).map((t) => [t.id, t.where || null]).sort()) });
let n = 0, exact = 0, idsEq = 0, countEq = 0, levelEq = 0, jac = 0, whereEq = 0, weakEq = 0;
const misses = [];
for (const r of rows) {
  const gold = norm(JSON.parse(r.messages[2].content));
  const plan = M.studio.parse(r.messages[1].content);
  const off = gold.ids.length === 0 && !gold.weak;
  /* cerere în afara domeniului: parserul întoarce un plan implicit + notă; considerăm corect dacă are notă */
  const pred = off ? { count: 5, level: 0, ramp: false, weak: false, templates: plan.notes.length ? [] : plan.templates } : plan;
  const p = norm({ count: pred.count, level: pred.level, ramp: pred.ramp, weak: pred.weak, templates: pred.templates });
  n++;
  const sameIds = JSON.stringify(p.ids) === JSON.stringify(gold.ids);
  if (sameIds) idsEq++;
  if (p.count === gold.count || off) countEq++;
  if (p.level === gold.level || off) levelEq++;
  if (p.weak === gold.weak) weakEq++;
  if (p.where === gold.where) whereEq++;
  const inter = p.ids.filter((x) => gold.ids.indexOf(x) >= 0).length, uni = new Set(p.ids.concat(gold.ids)).size || 1;
  jac += inter / uni;
  if (sameIds && (p.count === gold.count || off) && (p.level === gold.level || off) && p.ramp === gold.ramp && p.weak === gold.weak && p.where === gold.where) exact++;
  else if (misses.length < 6) misses.push({ cerere: r.messages[1].content, gold: gold.ids.join(',') + ' c' + gold.count + ' l' + gold.level, pred: p.ids.join(',') + ' c' + p.count + ' l' + p.level });
}
const pc = (x) => (100 * x / n).toFixed(1) + '%';
console.log('Parser cu reguli pe „' + split + '” (' + n + ' cereri):');
console.log('  plan complet corect : ' + pc(exact));
console.log('  familii identice    : ' + pc(idsEq) + '   (suprapunere medie ' + (100 * jac / n).toFixed(1) + '%)');
console.log('  număr corect        : ' + pc(countEq) + '   nivel corect: ' + pc(levelEq) + '   puncte slabe: ' + pc(weakEq) + '   filtre de poveste: ' + pc(whereEq));
console.log('Exemple greșite:'); misses.forEach((m) => console.log('  - ' + m.cerere + '\n      corect: ' + m.gold + '\n      reguli: ' + m.pred));
