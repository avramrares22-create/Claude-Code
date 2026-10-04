import { describe, expect, it } from 'vitest';
import { SceneIndex, sceneScore } from '../src/engine/imagery/sceneIndex';
import { epsgFromGrid, parseScene, type Scene } from '../src/engine/imagery/stac';
import { hashString } from '../src/engine/imagery/hash';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const scene = (id: string, grid: string, daysAgo: number, cloud: number, bbox: Scene['bbox'], nodata = 0): Scene => ({
  id,
  grid,
  epsg: epsgFromGrid(grid),
  datetime: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  cloud,
  nodata,
  bbox,
});

describe('STAC parsing', () => {
  it('derives EPSG from MGRS grid', () => {
    expect(epsgFromGrid('35TLL')).toBe(32635);
    expect(epsgFromGrid('34TEP')).toBe(32634);
    expect(epsgFromGrid('34HBH')).toBe(32734);
  });

  it('parses a trimmed Earth Search item', () => {
    const s = parseScene({
      id: 'S2B_T35TLL_20261004T092258_L2A',
      bbox: [24.4, 45.0, 25.9, 46.0],
      properties: { 'grid:code': 'MGRS-35TLL', datetime: '2026-10-04T09:08:21Z', 'eo:cloud_cover': 1.5, 's2:nodata_pixel_percentage': 12 },
    });
    expect(s).toMatchObject({ grid: '35TLL', epsg: 32635, cloud: 1.5, nodata: 12 });
  });
});

describe('SceneIndex', () => {
  const A: Scene['bbox'] = [24, 45, 25.5, 46];
  const B: Scene['bbox'] = [25.3, 45, 26.8, 46];
  const scenes = [
    scene('a-old-clear', '35TLL', 40, 0, A),
    scene('a-new-cloudy', '35TLL', 1, 12, A),
    scene('a-new-clear', '35TLL', 3, 0.5, A),
    scene('a-partial', '35TLL', 2, 0, A, 60),
    scene('b-clear', '35TML', 5, 1, B),
  ];

  it('prefers clear, complete, recent scenes', () => {
    expect(sceneScore(scenes[2], NOW)).toBeLessThan(sceneScore(scenes[0], NOW));
    expect(sceneScore(scenes[2], NOW)).toBeLessThan(sceneScore(scenes[1], NOW));
    expect(sceneScore(scenes[2], NOW)).toBeLessThan(sceneScore(scenes[3], NOW));
  });

  it('paints every grid best-first, then fallbacks', () => {
    const idx = new SceneIndex(scenes, 2, NOW);
    const ids = idx.scenesFor([25.35, 45.4, 25.45, 45.5]).map((s) => s.id);
    // Level 0: best of each grid, then level 1 fallbacks.
    expect(ids.slice(0, 2).sort()).toEqual(['a-new-clear', 'b-clear']);
    // Grid B has a single scene, so only grid A contributes a fallback.
    expect(ids).toHaveLength(3);
    expect(ids[2]).toBe('a-old-clear'); // score 3.2 beats a-partial's 18.2
  });

  it('is deterministic so neighbouring tiles agree', () => {
    const idx = new SceneIndex(scenes, 3, NOW);
    const t1 = idx.scenesFor([25.35, 45.4, 25.4, 45.45]).map((s) => s.id);
    const t2 = idx.scenesFor([25.4, 45.4, 25.45, 45.45]).map((s) => s.id);
    expect(t1).toEqual(t2);
  });

  it('skips grids that do not touch the tile', () => {
    const idx = new SceneIndex(scenes, 3, NOW);
    expect(idx.scenesFor([26.5, 45.4, 26.6, 45.5]).every((s) => s.grid === '35TML')).toBe(true);
  });
});

describe('hashString', () => {
  it('is stable and sensitive to order', () => {
    expect(hashString('a,b')).toBe(hashString('a,b'));
    expect(hashString('a,b')).not.toBe(hashString('b,a'));
  });
});
