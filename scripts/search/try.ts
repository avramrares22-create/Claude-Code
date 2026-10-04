import { BRASOV } from '../../src/engine/search/engine';
import { loadEngine } from './load';

const t0 = Date.now();
const se = loadEngine();
console.log(`loaded ${se.index.entries.length} entries in ${Date.now() - t0} ms`);
for (const q of process.argv.slice(2)) {
  const t = performance.now();
  const r = se.search(q, { focus: BRASOV });
  console.log(`\n“${q}”  [${(performance.now() - t).toFixed(1)} ms] name=${r.parsed.name} cue=${r.parsed.cue} anchor=${r.anchor} me=${r.parsed.nearMe}`);
  for (const x of r.results.slice(0, 5)) console.log(`   ${x.score.toFixed(2)}  ${x.cat.padEnd(10)} ${x.name}  ·  ${x.locality || x.county}  ${x.km.toFixed(1)} km`);
}
