/** Base MapLibre style: our Sentinel mosaic + terrain + reference labels. Trail layers are added by the engine. */
import type { RasterLayerSpecification, StyleSpecification } from 'maplibre-gl';
import { HIRES, HIRES_FROM_ZOOM, IMAGERY, REFERENCE, ROMANIA_BBOX, TERRAIN } from './config';
import { imageryTileUrl } from './imagery/imageryProtocol';
import { basemapForStyle, type BaseMode, type Theme } from './mapStyle';

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

export function buildBaseStyle(theme: Theme = 'light', mode: BaseMode = 'map'): StyleSpecification {
  const year = new Date().getFullYear();
  const bm = basemapForStyle(theme, mode);
  return {
    version: 8,
    glyphs: REFERENCE.glyphs,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [imageryTileUrl('truecolor')],
        tileSize: IMAGERY.tileSize,
        minzoom: IMAGERY.minZoom,
        maxzoom: IMAGERY.maxZoom,
        bounds: ROMANIA_BBOX,
        attribution: `Contains modified Copernicus Sentinel data ${year}`,
      },
      // One source per high-res provider (each has its own max zoom and credits).
      ...Object.fromEntries(
        HIRES.map((p) => [
          hiresId(p.id),
          {
            type: 'raster' as const,
            tiles: [p.tiles],
            tileSize: 256,
            minzoom: 13,
            maxzoom: p.maxZoom,
            bounds: ROMANIA_BBOX,
            attribution: p.attribution,
          },
        ]),
      ),
      // Separate DEM sources for terrain and hillshade, as MapLibre recommends.
      terrainDem: {
        type: 'raster-dem',
        tiles: [TERRAIN.tiles],
        encoding: TERRAIN.encoding,
        tileSize: 256,
        maxzoom: TERRAIN.maxZoom,
        attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
      },
      hillshadeDem: {
        type: 'raster-dem',
        tiles: [TERRAIN.tiles],
        encoding: TERRAIN.encoding,
        tileSize: 256,
        maxzoom: TERRAIN.maxZoom,
      },
      reference: {
        type: 'vector',
        url: REFERENCE.tilejson,
        attribution: '© OpenStreetMap contributors · OpenFreeMap',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#14231a' } },
      // Drawn map (landcover, water, buildings): visible in "Map" mode.
      ...bm.below,
      {
        id: 'imagery',
        type: 'raster',
        source: 'imagery',
        paint: { 'raster-fade-duration': 150, 'raster-resampling': 'linear' },
      },
      // High-res layers start hidden; the engine shows the provider reachable from this device.
      ...HIRES.map((p): RasterLayerSpecification => ({
        id: hiresId(p.id),
        type: 'raster',
        source: hiresId(p.id),
        minzoom: HIRES_FROM_ZOOM,
        layout: { visibility: 'none' },
        paint: {
          'raster-fade-duration': 150,
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], HIRES_FROM_ZOOM, 0, HIRES_FROM_ZOOM + 1, 1],
        },
      })),
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'hillshadeDem',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 15, 0.12],
          'hillshade-shadow-color': 'rgba(10,20,30,0.55)',
          'hillshade-highlight-color': 'rgba(255,250,235,0.25)',
        },
      },
      // Roads and labels (roads hidden in plain "Satellite").
      ...bm.above,
    ],
    sky: {
      'sky-color': '#7fb2e5',
      'horizon-color': '#dcebf5',
      'fog-color': '#dcebf5',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.4,
    },
  };
}

export const FONTS = { FONT, FONT_BOLD };

export const hiresId = (id: string) => `hires-${id}`;
