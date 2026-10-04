/**
 * Elevation sampling from Terrarium DEM tiles (elevation = R*256 + G + B/256 - 32768).
 * Used by the router for slope-aware hiking times and by elevation profiles.
 */
import { TERRAIN, type BBox } from '../config';
import { latToTileY, lngToTileX, tilesInBBox } from '../geo/mercator';
import { fetchSafe } from '../util/net';

export interface ElevationProvider {
  /** Loads whatever is needed to answer `get` synchronously inside bbox. */
  prepare(bbox: BBox): Promise<void>;
  /** Metres above sea level, or null if not loaded. */
  get(lng: number, lat: number): number | null;
}

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

type Tile = { size: number; elev: Float32Array };

const MIN_ZOOM = 6;

export class TerrariumElevation implements ElevationProvider {
  private tiles = new Map<string, Promise<Tile | null>>();
  private ready = new Map<string, Tile | null>();

  constructor(
    private zoom = TERRAIN.sampleZoom,
    private url = TERRAIN.tiles,
  ) {}

  /** Loads DEM tiles for bbox, dropping to coarser zooms for big areas (bike/moto routes). */
  async prepare(bbox: BBox): Promise<void> {
    let z = this.zoom;
    let tiles = tilesInBBox(bbox, z);
    while (tiles.length > 64 && z > 8) tiles = tilesInBBox(bbox, --z);
    await Promise.all(tiles.map(([tz, x, y]) => this.loadOrParent(tz, x, y)));
  }

  /** Falls back to coarser tiles when one is missing (offline pack saved only up to a lower zoom). */
  private async loadOrParent(z: number, x: number, y: number): Promise<void> {
    for (; z >= MIN_ZOOM; z--, x >>= 1, y >>= 1) if (await this.load(z, x, y)) return;
  }

  get(lng: number, lat: number): number | null {
    // Finest loaded zoom wins.
    for (let z = this.zoom; z >= MIN_ZOOM; z--) {
      const v = this.sample(z, lng, lat);
      if (v !== null) return v;
    }
    return null;
  }

  private sample(z: number, lng: number, lat: number): number | null {
    const fx = lngToTileX(lng, z);
    const fy = latToTileY(lat, z);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = this.ready.get(`${z}/${tx}/${ty}`);
    if (!tile) return null;
    // Bilinear within the tile (edges clamp; fine at ~30 m sampling).
    const s = tile.size;
    const px = Math.min(s - 1.001, Math.max(0, (fx - tx) * s - 0.5));
    const py = Math.min(s - 1.001, Math.max(0, (fy - ty) * s - 0.5));
    const ix = Math.floor(px), iy = Math.floor(py);
    const ax = px - ix, ay = py - iy;
    const e = tile.elev;
    const i = iy * s + ix;
    return (e[i] * (1 - ax) + e[i + 1] * ax) * (1 - ay) + (e[i + s] * (1 - ax) + e[i + s + 1] * ax) * ay;
  }

  private load(z: number, x: number, y: number): Promise<Tile | null> {
    const key = `${z}/${x}/${y}`;
    let p = this.tiles.get(key);
    if (!p) {
      p = fetchTile(this.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
        .then((t) => {
          this.ready.set(key, t);
          return t;
        })
        .catch(() => {
          this.tiles.delete(key);
          return null;
        });
      this.tiles.set(key, p);
    }
    return p;
  }
}

async function fetchTile(url: string): Promise<Tile> {
  const res = await fetchSafe(url, { timeoutMs: 15_000 });
  const bmp = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
  const elev = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < elev.length; i++) elev[i] = decodeTerrarium(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const size = bmp.width; // read before close(): a closed ImageBitmap reports width 0
  bmp.close();
  return { size, elev };
}
