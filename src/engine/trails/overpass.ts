/** Fetches trail + nature data from OpenStreetMap via Overpass, with endpoint fallback. */
import { OVERPASS, type BBox } from '../config';
import type { OsmElement } from './types';

export function trailQuery([w, s, e, n]: BBox): string {
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:25];
(
  way["highway"~"^(path|track|footway|bridleway|cycleway|steps|via_ferrata|pedestrian|tertiary|unclassified|residential|living_street)$"]["footway"!~"^(traffic_island|access_aisle)$"](${b});
  way["highway"="service"]["service"!~"^(driveway|parking_aisle|drive-through)$"](${b});
)->.w;
.w out body geom qt;
relation["route"~"^(hiking|foot|mtb|bicycle)$"](${b})->.r;
.r out body qt;
(
  node["natural"~"^(peak|saddle|spring|cave_entrance)$"](${b});
  node["waterway"="waterfall"](${b});
  node["tourism"~"^(viewpoint|alpine_hut|wilderness_hut|camp_site)$"](${b});
  node["amenity"="shelter"](${b});
)->.p;
.p out body qt;`;
}

let preferred = 0;

export async function fetchOverpass(bbox: BBox, signal?: AbortSignal): Promise<OsmElement[]> {
  const query = trailQuery(bbox);
  const n = OVERPASS.endpoints.length;
  let lastErr: unknown;
  // Start from the endpoint that last worked; rotate on failure.
  for (let k = 0; k < n; k++) {
    const i = (preferred + k) % n;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OVERPASS.timeoutMs);
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(OVERPASS.endpoints[i], {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      preferred = i;
      return json.elements;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All Overpass endpoints failed');
}
