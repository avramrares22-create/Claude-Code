/** Web Mercator tile math (EPSG:3857, XYZ scheme). */
import type { BBox } from '../config';

export const EARTH_RADIUS = 6378137;
const MAX_LAT = 85.0511287798066;

export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
}

export function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function tileBBox(z: number, x: number, y: number): BBox {
  return [tileXToLng(x, z), tileYToLat(y + 1, z), tileXToLng(x + 1, z), tileYToLat(y, z)];
}

/** Ground size of one pixel in metres at a given tile/latitude. */
export function groundResolution(lat: number, z: number, tileSize = 256): number {
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS) / (tileSize * 2 ** z);
}

/** All tiles at zoom z covering a bbox. */
export function tilesInBBox(bbox: BBox, z: number): Array<[number, number, number]> {
  const [w, s, e, n] = bbox;
  const x0 = Math.floor(lngToTileX(w, z));
  const x1 = Math.floor(lngToTileX(e, z) - 1e-9);
  const y0 = Math.floor(latToTileY(n, z));
  const y1 = Math.floor(latToTileY(s, z) - 1e-9);
  const out: Array<[number, number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  return out;
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
