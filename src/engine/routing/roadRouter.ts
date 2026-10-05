/**
 * Car routing on the public road network (OSRM, OpenStreetMap data).
 *
 * Our trail graph only carries trails, tracks and minor roads, so it can't
 * drive you across a city or between towns; OSRM can. The result is shaped as
 * a normal Route, so the route sheet, elevation profile and turn-by-turn
 * navigation work the same as for trails.
 */
import type { ElevationProvider } from '../terrain/elevation';
import { fetchJson } from '../util/net';
import type { Route, RouteSegmentInfo } from './router';

/** Two public OSRM servers (same API): the main demo, then the FOSSGIS one if it's down or busy. */
const OSRM = ['https://router.project-osrm.org/route/v1/driving', 'https://routing.openstreetmap.de/routed-car/route/v1/driving'];

interface OsrmStep {
  name: string;
  ref?: string;
  geometry: { coordinates: Array<[number, number]> };
}
interface OsrmResponse {
  code: string;
  routes: Array<{ distance: number; duration: number; legs: Array<{ steps: OsrmStep[] }> }>;
}

/** Turns OSRM steps into one polyline with a segment (street) per vertex pair. */
export function routeFromOsrm(res: OsrmResponse, elevation?: ElevationProvider): Route | null {
  const r = res.code === 'Ok' ? res.routes[0] : undefined;
  if (!r) return null;
  const coords: Array<[number, number]> = [];
  const segments: RouteSegmentInfo[] = [];
  let id = 0;
  for (const leg of r.legs)
    for (const step of leg.steps) {
      id++;
      const name = step.name || step.ref || undefined;
      for (const c of step.geometry.coordinates) {
        const last = coords[coords.length - 1];
        if (last && last[0] === c[0] && last[1] === c[1]) continue;
        if (coords.length) segments.push({ wayId: id, name, kind: 'road' });
        coords.push([c[0], c[1]]);
      }
    }
  if (coords.length < 2) return null;
  const elevations = coords.map(([x, y]) => elevation?.get(x, y) ?? NaN);
  // Gaps where the DEM isn't loaded: carry the nearest known height (no fake drops to 0 m).
  let last = elevations.find(Number.isFinite);
  if (last !== undefined) for (let i = 0; i < elevations.length; i++) Number.isFinite(elevations[i]) ? (last = elevations[i]) : (elevations[i] = last);
  let ascent = 0, descent = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (Number.isFinite(d)) d > 0 ? (ascent += d) : (descent -= d);
  }
  return {
    mode: 'car',
    coords,
    elevations,
    distance: r.distance,
    ascent,
    descent,
    duration: r.duration,
    wayIds: [],
    hiddenShare: 0,
    offroadShare: 0,
    unknownAccessShare: 0,
    snapDistance: [0, 0],
    model: 'osrm',
    segments,
  };
}

export async function driveRoute(from: [number, number], to: [number, number], elevation?: ElevationProvider): Promise<Route | null> {
  const path = `${from[0].toFixed(6)},${from[1].toFixed(6)};${to[0].toFixed(6)},${to[1].toFixed(6)}?overview=false&steps=true&geometries=geojson`;
  let err: unknown;
  for (const base of OSRM) {
    try {
      return routeFromOsrm(await fetchJson<OsrmResponse>(`${base}/${path}`, { timeoutMs: 15_000, retries: 0 }), elevation);
    } catch (e) {
      err = e;
    }
  }
  throw new Error(navigator.onLine ? 'road routing is unavailable right now' : 'car routing needs a connection', { cause: err });
}
