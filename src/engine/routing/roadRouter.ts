/**
 * Online road router (OSRM on routing.openstreetmap.de, free, no key, CORS
 * enabled). The trail graph only holds the trails, tracks and minor roads of
 * the cells loaded on the device, so it cannot reach a place 60 km away over
 * main roads; this fills that gap whenever there is signal.
 */
import type { TravelMode } from '../trails/types';
import { fetchJson } from '../util/net';
import type { Route, RouteSegmentInfo } from './router';

const PROFILE: Record<TravelMode, string> = { foot: 'routed-foot', bike: 'routed-bike', moto: 'routed-car' };

interface OsrmStep {
  name?: string;
  ref?: string;
  geometry: { coordinates: Array<[number, number]> };
}
export interface OsrmResponse {
  code: string;
  routes?: Array<{ distance: number; duration: number; legs: Array<{ steps: OsrmStep[] }> }>;
}

/** OSRM JSON (geojson geometry, steps) → a Route the sheet and turn-by-turn understand. */
export function parseOsrm(res: OsrmResponse, mode: TravelMode): Route | null {
  const r = res.code === 'Ok' ? res.routes?.[0] : undefined;
  if (!r) return null;
  const coords: Array<[number, number]> = [];
  const segments: RouteSegmentInfo[] = [];
  let stepNo = 0;
  for (const leg of r.legs)
    for (const step of leg.steps) {
      stepNo++;
      const pts = step.geometry.coordinates;
      // Each step starts where the previous one ended: skip the shared vertex.
      for (let i = coords.length ? 1 : 0; i < pts.length; i++) {
        if (coords.length) segments.push({ wayId: -stepNo, name: step.name || step.ref || undefined, kind: 'road' });
        coords.push([pts[i][0], pts[i][1]]);
      }
    }
  if (coords.length < 2) return null;
  return {
    mode,
    model: 'osrm',
    coords,
    elevations: coords.map(() => NaN),
    distance: r.distance,
    ascent: 0,
    descent: 0,
    duration: r.duration,
    wayIds: [],
    segments,
    hiddenShare: 0,
    offroadShare: 0,
    unknownAccessShare: 0,
    snapDistance: [0, 0],
  };
}

export async function roadRoute(from: [number, number], to: [number, number], mode: TravelMode, signal?: AbortSignal): Promise<Route | null> {
  const url = `https://routing.openstreetmap.de/${PROFILE[mode]}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=false&steps=true&geometries=geojson`;
  return parseOsrm(await fetchJson<OsrmResponse>(url, { signal, timeoutMs: 15_000, retries: 1 }), mode);
}
