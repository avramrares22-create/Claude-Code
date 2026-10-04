/**
 * Evaluates search on hand-written queries (scripts/search/eval.json), from Brașov.
 * Compares: rules only (no models), QueryNet + RankNet, and Photon (online, OSM-based).
 *   npx tsx scripts/search/eval.ts [--photon]
 */
import { readFileSync } from 'node:fs';
import { BRASOV } from '../../src/engine/search/engine';
import { loadEngine } from './load';

const cases = JSON.parse(readFileSync('scripts/search/eval.json', 'utf8')) as Array<[string, string, string?]>;
const ctx = { focus: BRASOV as [number, number] };

function score(label: string, run: (q: string) => Promise<Array<{ name: string; cat?: string }>> | Array<{ name: string; cat?: string }>) {
  return (async () => {
    let t1 = 0, t3 = 0;
    const fails: string[] = [];
    for (const [q, re, cat] of cases) {
      const r = await run(q);
      const ok = (x: { name: string; cat?: string }) => new RegExp(re, 'i').test(x.name) && (!cat || !x.cat || x.cat === cat);
      const rank = r.findIndex(ok);
      if (rank === 0) t1++;
      if (rank >= 0 && rank < 3) t3++;
      if (rank !== 0) fails.push(`${q} → ${r[0]?.name ?? '∅'}${rank > 0 ? ` (#${rank + 1})` : ''}`);
    }
    console.log(`${label.padEnd(26)} top1 ${t1}/${cases.length} (${((100 * t1) / cases.length).toFixed(1)}%)  top3 ${t3}/${cases.length} (${((100 * t3) / cases.length).toFixed(1)}%)`);
    return fails;
  })();
}

const rules = loadEngine({ models: false });
const full = loadEngine();
const qnOnly = loadEngine();
{
  const fs = await import('node:fs');
  qnOnly.setModels(JSON.parse(fs.readFileSync('src/engine/search/querynet.weights.json', 'utf8')), null);
}
const set = process.argv.includes('--test') ? 'scripts/search/test.json' : 'scripts/search/eval.json';
cases.splice(0, cases.length, ...(JSON.parse(readFileSync(set, 'utf8')) as typeof cases));
console.log('set:', set);
const f1 = await score('rules only', (q) => rules.search(q, ctx).results);
const f2 = await score('QueryNet + RankNet', (q) => full.search(q, ctx).results);
const f3 = await score('QueryNet + rules', (q) => qnOnly.search(q, ctx).results);
console.log('\nmisses (QueryNet + rules):\n  ' + f3.join('\n  '));
if (process.argv.includes('--photon')) {
  await score('Photon (online)', async (q) => {
    const u = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lat=${BRASOV[1]}&lon=${BRASOV[0]}&bbox=20.2,43.6,29.8,48.3`;
    try {
      const d = (await (await fetch(u)).json()) as { features: Array<{ properties: { name?: string } }> };
      await new Promise((r) => setTimeout(r, 400));
      return d.features.map((f) => ({ name: f.properties.name ?? '' }));
    } catch {
      return [];
    }
  });
}
console.log('\nmisses (models):\n  ' + f2.join('\n  '));
void f1;
