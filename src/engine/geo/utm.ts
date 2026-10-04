/**
 * WGS84 -> UTM forward projection (Krüger series, 3rd order in n).
 * Sub-millimetre within a zone and still well under a pixel a few degrees outside it,
 * which matters because Sentinel-2 tiles near 24°E overlap zones 34 and 35.
 *
 * Kept dependency-free so it can run in hot loops inside the imagery workers.
 */

const a = 6378137;
const f = 1 / 298.257223563;
const n = f / (2 - f);
const A = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
const alpha = [
  n / 2 - (2 * n * n) / 3 + (5 * n ** 3) / 16,
  (13 * n * n) / 48 - (3 * n ** 3) / 5,
  (61 * n ** 3) / 240,
];
const k0 = 0.9996;
const E0 = 500000;
const twoSqrtN = (2 * Math.sqrt(n)) / (1 + n);
const DEG = Math.PI / 180;

export interface UtmZone {
  zone: number;
  south: boolean;
}

/** EPSG:326xx (north) / 327xx (south) -> zone. */
export function zoneFromEpsg(epsg: number): UtmZone {
  if (epsg > 32600 && epsg <= 32660) return { zone: epsg - 32600, south: false };
  if (epsg > 32700 && epsg <= 32760) return { zone: epsg - 32700, south: true };
  throw new Error(`Not a WGS84 UTM EPSG code: ${epsg}`);
}

/** Writes [easting, northing] into `out` (avoids allocation in hot loops). */
export function lngLatToUtm(lng: number, lat: number, z: UtmZone, out: Float64Array | number[] = [0, 0]) {
  const lon0 = (z.zone * 6 - 183) * DEG;
  const phi = lat * DEG;
  const dl = lng * DEG - lon0;
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - twoSqrtN * Math.atanh(twoSqrtN * sinPhi));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta;
  let nn = xi;
  for (let j = 1; j <= 3; j++) {
    const aj = alpha[j - 1];
    e += aj * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    nn += aj * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  out[0] = E0 + k0 * A * e;
  out[1] = (z.south ? 10000000 : 0) + k0 * A * nn;
  return out;
}
