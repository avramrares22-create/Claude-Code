import { describe, expect, it } from 'vitest';
import { PACKS, areaTooLarge, planOfflineArea, planPack, planSize, tileOfUrl } from '../src/engine/offline';
import { fold, searchLocal, type Place } from '../src/ui/search';

describe('offline packs', () => {
  it('plans the country overview from the pre-rendered mosaic only', () => {
    const plan = planPack(PACKS.find((p) => p.id === 'romania')!, 12, null);
    expect(plan.rendered).toBe(0);
    expect(Math.max(...plan.imagery.map((t) => t[0]))).toBe(12);
    expect(plan.hires).toHaveLength(0);
    // Clipped to Romania's outline: well under the full bbox at z12.
    expect(plan.imagery.length).toBeLessThan(12000);
    expect(plan.estimateMB).toBeGreaterThan(100);
  });

  it('renders only the zooms above the static mosaic for a city/mountain pack', () => {
    const plan = planPack(PACKS.find((p) => p.id === 'brasov')!, 12, null);
    expect(plan.rendered).toBe(plan.imagery.filter(([z]) => z > 12).length);
    expect(plan.rendered).toBeGreaterThan(0);
    expect(plan.trailCells.every(([z]) => z === 11)).toBe(true);
  });

  it('every pack lies in Romania and has a unique id', () => {
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
    for (const p of PACKS) {
      expect(p.bbox[0]).toBeGreaterThanOrEqual(20.2);
      expect(p.bbox[2]).toBeLessThanOrEqual(29.8);
      expect(p.bbox[0]).toBeLessThan(p.bbox[2]);
      expect(p.bbox[1]).toBeLessThan(p.bbox[3]);
    }
  });

  it('caps ad-hoc areas but not ready-made packs', () => {
    const small = planOfflineArea([25.55, 45.6, 25.62, 45.66], null, 12);
    expect(areaTooLarge(small)).toBe(false);
    const big = planOfflineArea([24, 45, 26, 46.5], null, 12);
    expect(areaTooLarge(big)).toBe(true);
    expect(planSize(big)).toBeGreaterThan(4000);
  });

  it('parses tile coordinates from cached URLs', () => {
    expect(tileOfUrl('https://tiles.nature.local/s2/v3/truecolor/14/9283/5810.png?s=abc')).toEqual([14, 9283, 5810]);
    expect(tileOfUrl('https://example.org/app/data/trails/11/1169/724.json')).toEqual([11, 1169, 724]);
    expect(tileOfUrl('https://example.org/app/data/trails/meta.json')).toBeNull();
    expect(tileOfUrl('https://example.org/2/9/9.png')).toBeNull(); // out of range for z2
  });
});

describe('offline search', () => {
  const places: Place[] = [
    { name: 'Șaua Sugărilor', detail: '', kind: 'peak', lngLat: [25.464, 45.43], zoom: 15 },
    { name: 'Vârful Omu', detail: '', kind: 'peak', lngLat: [25.456, 45.445], zoom: 15 },
    { name: 'Cabana Omu', detail: '', kind: 'hut', lngLat: [25.457, 45.446], zoom: 15 },
    { name: 'Omul Mic', detail: '', kind: 'peak', lngLat: [27, 47], zoom: 15 },
  ];
  it('ignores diacritics and case', () => {
    expect(fold('Șaua Sugărilor')).toBe('saua sugarilor');
    expect(searchLocal('saua sug', places).map((p) => p.name)).toEqual(['Șaua Sugărilor']);
  });
  it('ranks prefix matches and nearby places first', () => {
    const r = searchLocal('omu', places, [25.46, 45.44]).map((p) => p.name);
    expect(r[0]).toBe('Omul Mic'); // name starts with the query
    expect(r.slice(1).sort()).toEqual(['Cabana Omu', 'Vârful Omu']);
  });
});
