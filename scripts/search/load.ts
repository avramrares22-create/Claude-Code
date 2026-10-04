/** Loads the gazetteer (core + street shards) for Node scripts. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SearchEngine } from '../../src/engine/search/search';
import type { CoreFile, Row } from '../../src/engine/search/engine';

export const DATA = process.env.SEARCH_DATA ?? '/tmp/claude-0/search';

export function loadEngine(opts: { models?: boolean } = {}): SearchEngine {
  const se = new SearchEngine();
  const core = JSON.parse(readFileSync(join(DATA, 'core.json'), 'utf8')) as CoreFile;
  se.index.addCore(core);
  for (const f of ['s25_45.json', 's25_46.json', 's24_45.json', 's26_44.json', 's23_46.json']) {
    const p = join(DATA, f);
    if (existsSync(p)) se.index.addShard(f, JSON.parse(readFileSync(p, 'utf8')) as Row[], core.ctx);
  }
  if (opts.models !== false) {
    const qp = 'src/engine/search/querynet.weights.json';
    const rp = 'src/engine/search/ranknet.weights.json';
    se.setModels(existsSync(qp) ? JSON.parse(readFileSync(qp, 'utf8')) : null, existsSync(rp) ? JSON.parse(readFileSync(rp, 'utf8')) : null);
  }
  return se;
}
