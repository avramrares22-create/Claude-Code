/**
 * Elevation sampling from Terrarium DEM tiles (elevation = R*256 + G + B/256 - 32768).
 * Used by the router for slope-aware hiking times and by elevation profiles.
 */
import { TERRAIN, type BBox } from '../config';
import { latToTileY, lngToTileX, tilesInBBox } from '../geo/mercator';

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

export class TerrariumElevation implements ElevationProvider {
  private tiles = new Map<string, Promise<Tile | null>>();
  private ready = new Map<string, Tile | null>();

  constructor(
    private zoom = TERRAIN.sampleZoom,
    private url = TERRAIN.tiles,
  ) {}

  async prepare(bbox: BBox): Promise<void> {
    const tiles = tilesInBBox(bbox, this.zoom);
    if (tiles.length > 64) throw new Error('Area too large for elevation sampling');
    await Promise.all(tiles.map(([z, x, y]) => this.load(z, x, y)));
  }

  get(lng: number, lat: number): number | null {
    const fx = lngToTileX(lng, this.zoom);
    const fy = latToTileY(lat, this.zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = this.ready.get(`${tx}/${ty}`);
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
    const key = `${x}/${y}`;
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DEM tile ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
  const elev = new Float32Array(bmp.width * bmp.height);
  for (let i = 0; i < elev.length; i++) elev[i] = decodeTerrarium(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  bmp.close();
  return { size: bmp.width, elev };
}
