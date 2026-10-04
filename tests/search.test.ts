import { describe, expect, it } from 'vitest';
import { SearchEngine, ruleParse } from '../src/engine/search/search';
import { fold, stem, tokenMatch } from '../src/engine/search/text';
import type { CoreFile } from '../src/engine/search/engine';

const core: CoreFile = {
  v: 1,
  cats: [],
  ctx: [['Noua, Brașov', 'Brașov'], ['', 'Brașov'], ['Bușteni', 'Prahova']],
  e: [
    ['Lacul Noua', '', 7, 2563700, 4561300, 42, 0, 0, 'w1'],
    ['Parc Lacul Noua', '', 24, 2563950, 4561350, 34, 0, 0, 'w2'],
    ['Tâmpa', '', 4, 2559700, 4563500, 66, 1, 0, 'n3'],
    ['Postăvaru', '', 4, 2555000, 4558000, 70, 1, 0, 'n4'],
    ['Cabana Postăvaru', '', 16, 2555100, 4558100, 52, 1, 0, 'n5'],
    ['Bastionul Postăvarilor', '', 21, 2558900, 4564000, 77, 1, 0, 'w6'],
    ['Cabana Babele', '', 16, 2546400, 4540500, 60, 2, 0, 'n7'],
    ['Lacul Bâlea', '', 7, 2461700, 4560300, 60, 1, 0, 'w8'],
  ],
};
const se = new SearchEngine();
se.index.addCore(core);
const ctx = { focus: [25.5887, 45.6427] as [number, number] };

describe('search text', () => {
  it('folds diacritics and Romanian endings', () => {
    expect(fold('Șaua Sugărilor')).toBe('saua sugarilor');
    expect(stem('lacul')).toBe('lac');
    expect(stem('postavarul')).toBe(stem('postavaru'));
    expect(stem('postavarilor')).not.toBe(stem('postavaru'));
    expect(stem('7')).toBe('sapte');
  });
  it('tolerates typos and prefixes', () => {
    expect(tokenMatch('tamap', 'tampa')).toBeGreaterThan(0.5);
    expect(tokenMatch('posta', 'postavaru')).toBeGreaterThan(0.6);
    expect(tokenMatch('bran', 'zarnesti')).toBe(0);
  });
});

describe('search engine (rules)', () => {
  const top = (q: string) => se.search(q, ctx).results[0]?.name;
  it('finds places by name, type and typos', () => {
    expect(top('lacul noua')).toBe('Lacul Noua');
    expect(top('tampa')).toBe('Tâmpa');
    expect(top('tamap')).toBe('Tâmpa');
    expect(top('cabana postavaru')).toBe('Cabana Postăvaru');
    expect(top('balea lake')).toBe('Lacul Bâlea');
  });
  it('reads "near X" and category-only queries', () => {
    const p = ruleParse('cabane langa busteni');
    expect(p.cue).toEqual(['cabane']);
    expect(p.anchor).toEqual(['busteni']);
    expect(ruleParse('lacuri near me').nearMe).toBe(true);
  });
});
