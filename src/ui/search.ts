/**
 * Place search for Romania (peaks, huts, villages, lakes…) via Photon, the
 * OpenStreetMap geocoder by Komoot — free, no key, CORS enabled.
 */
import { ROMANIA_BBOX } from '../engine/config';
import { fetchJson } from '../engine/util/net';

export interface Place {
  name: string;
  detail: string;
  kind: 'peak' | 'water' | 'hut' | 'town' | 'pin';
  lngLat: [number, number];
  zoom: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

function kindOf(p: PhotonFeature['properties']): Place['kind'] {
  const v = p.osm_value ?? '';
  if (/peak|saddle|volcano|ridge|cliff/.test(v)) return 'peak';
  if (/water|lake|river|waterfall|spring|reservoir|stream/.test(v)) return 'water';
  if (/hut|shelter|chalet|camp|hostel|guest_house|hotel/.test(v)) return 'hut';
  if (/city|town|village|hamlet|suburb|locality/.test(v)) return 'town';
  return 'pin';
}

export async function searchPlaces(q: string, signal?: AbortSignal, near?: [number, number]): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: '8', bbox: ROMANIA_BBOX.join(',') });
  if (near) {
    params.set('lon', String(near[0]));
    params.set('lat', String(near[1]));
  }
  const res = await fetchJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?${params}`, { signal, timeoutMs: 8000, retries: 1 });
  return res.features
    .filter((f) => f.properties.countrycode === 'RO' || !f.properties.countrycode)
    .map((f) => {
      const p = f.properties;
      const kind = kindOf(p);
      const where = [p.city ?? p.town ?? p.village, p.county].filter(Boolean).join(', ');
      return {
        name: p.name ?? where ?? q,
        detail: [p.osm_value?.replace(/_/g, ' '), where].filter(Boolean).join(' · '),
        kind,
        lngLat: f.geometry.coordinates,
        zoom: kind === 'town' ? 13 : 15,
      };
    });
}

/** Lower-case and strip diacritics, so "saua sugarilor" finds "Șaua Sugărilor". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Offline / low-signal search over what the app already has on the device:
 * named peaks, huts and springs, named trails, and the saved offline packs.
 */
export function searchLocal(q: string, items: Iterable<Place>, near?: [number, number], limit = 8): Place[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ p: Place; s: number }> = [];
  const seen = new Set<string>();
  for (const p of items) {
    const name = fold(p.name);
    if (!words.every((w) => name.includes(w))) continue;
    const key = `${name}|${p.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Prefix matches first, then nearer places.
    let s = name.startsWith(words[0]) ? 0 : 1;
    if (near) s += Math.hypot(p.lngLat[0] - near[0], (p.lngLat[1] - near[1]) * 1.4) / 10;
    scored.push({ p, s });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.p);
}
