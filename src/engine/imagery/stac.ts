/** Minimal STAC client for Earth Search (Element 84). */
import { STAC, type BBox } from '../config';
import { fetchJson } from '../util/net';

export interface Scene {
  id: string;
  /** MGRS grid square, e.g. "35TLL". */
  grid: string;
  epsg: number;
  datetime: string;
  cloud: number;
  /** Percentage of the 110 km square with no data (scene at swath edge). */
  nodata: number;
  bbox: BBox;
}

export interface SceneAssets {
  visual: string;
  red: string;
  nir: string;
  /** Scene classification (clouds, shadows, snow…), 20 m. */
  scl: string;
}

interface StacItem {
  id: string;
  bbox: BBox;
  properties: Record<string, unknown>;
  assets?: Record<string, { href: string }>;
}

interface StacPage {
  features: StacItem[];
  links?: Array<{ rel: string; href: string; method?: string; body?: unknown }>;
}

/** "MGRS-35TLL" -> EPSG 32635. Latitude bands N..X are northern hemisphere. */
export function epsgFromGrid(grid: string): number {
  const m = /^(\d{1,2})([C-X])/.exec(grid);
  if (!m) throw new Error(`Bad MGRS grid code: ${grid}`);
  const zone = Number(m[1]);
  return (m[2] >= 'N' ? 32600 : 32700) + zone;
}

export function parseScene(item: StacItem): Scene {
  const p = item.properties;
  const grid = String(p['grid:code'] ?? '').replace(/^MGRS-/, '');
  return {
    id: item.id,
    grid,
    epsg: typeof p['proj:epsg'] === 'number' ? (p['proj:epsg'] as number) : epsgFromGrid(grid),
    datetime: String(p.datetime),
    cloud: Number(p['eo:cloud_cover'] ?? 100),
    nodata: Number(p['s2:nodata_pixel_percentage'] ?? 0),
    bbox: item.bbox,
  };
}

export interface SearchOptions {
  bbox: BBox;
  from: Date;
  to?: Date;
  maxCloud: number;
  signal?: AbortSignal;
  /** Safety cap on pagination. */
  maxItems?: number;
}

/** Searches scenes without assets/geometry (~0.5 KB per item instead of ~14 KB). */
export async function searchScenes(opts: SearchOptions): Promise<Scene[]> {
  const body: Record<string, unknown> = {
    collections: [STAC.collection],
    bbox: opts.bbox,
    datetime: `${opts.from.toISOString()}/${opts.to ? opts.to.toISOString() : '..'}`,
    limit: 250,
    query: { 'eo:cloud_cover': { lt: opts.maxCloud } },
    // Earth Search needs both: `exclude` alone drops all properties but datetime,
    // `include` alone still returns every asset.
    fields: {
      include: [
        'id',
        'bbox',
        'properties.datetime',
        'properties.eo:cloud_cover',
        'properties.grid:code',
        'properties.proj:epsg',
        'properties.s2:nodata_pixel_percentage',
      ],
      exclude: ['assets', 'geometry', 'links'],
    },
  };
  const out: Scene[] = [];
  const max = opts.maxItems ?? 5000;
  let url = `${STAC.endpoint}/search`;
  let reqBody: unknown = body;
  while (url && out.length < max) {
    // Search is a read despite POST: safe to retry.
    const page = await fetchJson<StacPage>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: opts.signal,
      retries: 2,
      timeoutMs: 30_000,
    });
    for (const f of page.features) {
      try {
        out.push(parseScene(f));
      } catch {
        // Malformed item (no grid code): skip rather than lose the whole index.
      }
    }
    const next = page.links?.find((l) => l.rel === 'next');
    if (!next || page.features.length === 0) break;
    url = next.href;
    // Earth Search returns the full next-page body (including its "next" token).
    reqBody = next.body ?? { ...body, next: new URL(next.href).searchParams.get('next') };
  }
  return out;
}

export interface SceneFiles extends SceneAssets {
  blue: string;
  green: string;
  /** 343 px, 320 m/px RGB COG — one tiny read covers a whole grid square at low zoom. */
  preview: string;
}

const C1_BUCKET = 'https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a';

/**
 * Collection-1 files live at {zone}/{band}/{square}/{year}/{month, unpadded}/{id}/.
 * Deriving them saves one STAC round trip per scene; callers fall back to
 * `getSceneAssets` if the derived URL 404s.
 */
export function deriveSceneFiles(id: string): SceneFiles | null {
  const m = /^S2[A-D]_T(\d{2})([C-X])([A-Z]{2})_(\d{4})(\d{2})\d{2}T\d{6}_L2A$/.exec(id);
  if (!m) return null;
  const dir = `${C1_BUCKET}/${Number(m[1])}/${m[2]}/${m[3]}/${m[4]}/${Number(m[5])}/${id}`;
  return {
    visual: `${dir}/TCI.tif`,
    red: `${dir}/B04.tif`,
    nir: `${dir}/B08.tif`,
    scl: `${dir}/SCL.tif`,
    blue: `${dir}/B02.tif`,
    green: `${dir}/B03.tif`,
    preview: `${dir}/L2A_PVI.tif`,
  };
}

const assetCache = new Map<string, Promise<SceneAssets>>();

/** Fetches one item to resolve its COG hrefs. Cached for the session. */
export function getSceneAssets(id: string): Promise<SceneAssets> {
  let p = assetCache.get(id);
  if (!p) {
    p = fetchJson<StacItem>(`${STAC.endpoint}/collections/${STAC.collection}/items/${encodeURIComponent(id)}`)
      .then((item) => {
        const a = item.assets ?? {};
        if (!a.visual || !a.red || !a.nir || !a.scl) throw new Error(`Scene ${id} is missing assets`);
        return { visual: a.visual.href, red: a.red.href, nir: a.nir.href, scl: a.scl.href };
      });
    p.catch(() => assetCache.delete(id));
    assetCache.set(id, p);
  }
  return p;
}
