import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TrailGraph } from '../src/engine/routing/graph';
import { findRoute } from '../src/engine/routing/router';
import { decodeCell, type TrailCellV1 } from '../src/engine/trails/cellFormat';
import { TrailStore } from '../src/engine/trails/trailStore';

// Real cell built by scripts/data/build_trail_cells.py from an OSM extract of the Bucegi plateau.
const cell = JSON.parse(readFileSync(new URL('./fixtures/trail-cell-bucegi.json', import.meta.url), 'utf8')) as TrailCellV1;

describe('static trail cells', () => {
  it('decodes ways, routes and POIs', () => {
    const els = decodeCell(cell);
    const ways = els.filter((e) => e.type === 'way');
    expect(ways.length).toBe(cell.w.length);
    expect(els.filter((e) => e.type === 'relation').length).toBe(cell.r.length);
    expect(els.filter((e) => e.type === 'node').length).toBe(cell.p.length);
    for (const w of ways) {
      if (w.type !== 'way') continue;
      expect(w.nodes.length).toBe(w.geometry.length);
      for (const g of w.geometry) {
        expect(g.lon).toBeGreaterThan(25.3);
        expect(g.lon).toBeLessThan(25.6);
        expect(g.lat).toBeGreaterThan(45.3);
        expect(g.lat).toBeLessThan(45.5);
      }
    }
  });

  it('keeps junctions so the network is routable across the plateau', async () => {
    const store = new TrailStore(async () => decodeCell(cell), false);
    await store.ensure([25.45, 45.40, 25.46, 45.41]);
    const marked = store.trails.filter((t) => t.kind === 'marked');
    expect(marked.length).toBeGreaterThan(20);
    const g = new TrailGraph(store.trails);
    // Babele cave → Șaua Sugărilor, the route from the earlier end-to-end test.
    const r = findRoute(g, [25.4612, 45.406], [25.4641, 45.4308]);
    expect(r).not.toBeNull();
    expect(r!.distance).toBeGreaterThan(3000);
    expect(r!.distance).toBeLessThan(5000);
  });
});
