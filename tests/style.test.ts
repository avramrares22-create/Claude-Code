import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { basemapForStyle } from '../src/engine/mapStyle';

describe('map style', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const mode of ['map', 'satellite', 'hybrid'] as const)
      it(`${theme} ${mode} is a valid MapLibre style`, () => {
        const bm = basemapForStyle(theme, mode);
        const style = { version: 8, glyphs: 'https://x/{fontstack}/{range}.pbf', sources: { reference: { type: 'vector', url: 'https://x' } }, layers: [...bm.below, ...bm.above] };
        expect(validateStyleMin(style as never).map((e: { message: string }) => e.message)).toEqual([]);
      });
});
