/**
 * Chooses which Sentinel-2 scenes make up the mosaic.
 *
 * The index is built once for all of Romania (not per tile) so every map tile
 * agrees on the same scene for a given grid square — otherwise neighbouring
 * tiles would pick different dates and the mosaic would show seams.
 */
import { ROMANIA_BBOX, STAC, type BBox } from '../config';
import { bboxIntersects } from '../geo/mercator';
import { searchScenes, type Scene } from './stac';
import { dataUrl } from '../util/base';

const CACHE_KEY = 'nature-engine:scene-index:v1';
const CACHE_TTL_MS = 12 * 3600 * 1000;

/** Lower is better. Cloud cover dominates, then swath-edge gaps, then age. */
export function sceneScore(s: Scene, now = Date.now()): number {
  const ageDays = (now - Date.parse(s.datetime)) / 86_400_000;
  return s.cloud + s.nodata * 0.3 + ageDays * 0.08;
}

export class SceneIndex {
  /** Per grid square, best scenes first. */
  private byGrid = new Map<string, Scene[]>();
  private scores = new Map<string, number>();

  constructor(scenes: Scene[], perGrid: number = STAC.scenesPerGrid, now = Date.now()) {
    const groups = new Map<string, Scene[]>();
    for (const s of scenes) {
      this.scores.set(s.id, sceneScore(s, now));
      const g = groups.get(s.grid);
      if (g) g.push(s);
      else groups.set(s.grid, [s]);
    }
    for (const [grid, list] of groups) {
      list.sort((a, b) => this.scores.get(a.id)! - this.scores.get(b.id)! || a.id.localeCompare(b.id));
      this.byGrid.set(grid, list.slice(0, perGrid));
    }
  }

  get size(): number {
    return this.byGrid.size;
  }

  /**
   * Scenes to paint a tile with, in paint order: every grid's best scene first,
   * then every grid's second-best (fills swath-edge gaps), and so on.
   */
  scenesFor(bbox: BBox): Scene[] {
    const levels: Scene[][] = [];
    for (const list of this.byGrid.values()) {
      list.forEach((s, i) => {
        if (!bboxIntersects(s.bbox, bbox)) return;
        (levels[i] ??= []).push(s);
      });
    }
    const out: Scene[] = [];
    for (const level of levels) {
      if (!level) continue;
      level.sort((a, b) => this.scores.get(a.id)! - this.scores.get(b.id)! || a.id.localeCompare(b.id));
      out.push(...level);
    }
    return out;
  }

  static async load(signal?: AbortSignal): Promise<SceneIndex> {
    const cached = readCache();
    if (cached) return new SceneIndex(cached);
    // Snapshot published daily by CI: one small static file instead of paging STAC.
    const snap = await loadSnapshot(signal);
    if (snap) {
      writeCache(snap);
      return new SceneIndex(snap);
    }
    const from = new Date(Date.now() - STAC.lookbackDays * 86_400_000);
    const scenes = await searchScenes({ bbox: ROMANIA_BBOX, from, maxCloud: STAC.maxCloudCover, signal });
    writeCache(scenes);
    return new SceneIndex(scenes);
  }
}

const SNAPSHOT_MAX_AGE_MS = 3 * 86_400_000;

async function loadSnapshot(signal?: AbortSignal): Promise<Scene[] | null> {
  try {
    const res = await fetch(dataUrl('scenes.json'), { signal });
    if (!res.ok) return null;
    const { generated, scenes } = (await res.json()) as { generated: string; scenes: Scene[] };
    return Date.now() - Date.parse(generated) < SNAPSHOT_MAX_AGE_MS && scenes.length ? scenes : null;
  } catch {
    return null;
  }
}

function readCache(): Scene[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { t, scenes } = JSON.parse(raw) as { t: number; scenes: Scene[] };
    return Date.now() - t < CACHE_TTL_MS ? scenes : null;
  } catch {
    return null;
  }
}

function writeCache(scenes: Scene[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), scenes }));
  } catch {
    // Storage full or unavailable (private mode) — the index just reloads next time.
  }
}
