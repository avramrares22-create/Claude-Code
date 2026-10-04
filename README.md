# Natura: nature and hidden-trail map of Romania

Natura is an installable web app (PWA) for iOS and Linux. It is built on a custom map engine:

- **Imagery:** fresh **Sentinel-2** satellite imagery, rendered by the engine itself.
- **Trails:** trail data from **OpenStreetMap**, with a classifier that finds the *hidden* paths mainstream maps leave out.
- **Routing:** a **slope-aware hiking router**.

Everything runs in the browser. There are no API keys, no paid services and no backend.

```
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can open it on an iPhone)
npm test           # unit tests (geo math, renderer, scene selection, trails, router)
npm run build      # typecheck and production build in dist/
npm run preview    # serve the production build (service worker on)
```

## Architecture

```
src/engine/
  MapEngine.ts         App-facing facade: owns the MapLibre map, wires everything together
  config.ts            Romania bbox, endpoints, tunables
  style.ts             Base style: our imagery, terrain, hillshade, OpenFreeMap labels
  geo/                 Web Mercator tile math, WGS84→UTM (Krüger series), haversine
  imagery/             ── custom Sentinel-2 imagery engine ──
    stac.ts            Earth Search STAC client (trimmed fields, ~0.7 KB/scene)
    sceneIndex.ts      Romania-wide scene choice: best scenes per MGRS square
    renderTile.ts      Pure renderer: UTM→Mercator reprojection, bilinear, compositing, NDVI
    cog.ts             Range-request COG reader (geotiff.js), LRU of open files
    imagery.worker.ts  Off-main-thread tile pipeline, PNG encode, Cache API
    workerPool.ts      Worker pool with tile→worker affinity
    imageryProtocol.ts `s2://{mode}/{z}/{x}/{y}` MapLibre protocol
  terrain/elevation.ts Terrarium DEM sampling for routing
  trails/              OSM loading (Overpass, endpoint fallback, IndexedDB cache) and classification
  routing/             Trail graph and A* hiking router (Tobler's function)
```

### How a satellite tile is made

1. At startup the scene index runs **one** STAC search over Romania for the last 90 days with under 15% cloud. For each Sentinel-2 grid square (~54 squares) it keeps the best 3 scenes. Scenes are scored by cloud cover, swath-edge gaps and age. The index is global, so every tile picks the same scene for the same square, and the mosaic has no seams between tiles.
2. MapLibre requests `s2://truecolor/z/x/y`. The protocol handler sends the tile and its candidate scenes to a worker.
3. The worker projects a 17×17 grid of the tile into the scene's UTM zone (Romania spans zones 34 and 35) and interpolates the rest. The error is under 5 cm.
4. It picks the coarsest COG overview that is still sharp enough, or the 320 m `L2A_PVI` preview at country zoom. It then range-reads just that window.
5. It paints pixels best-scene-first and fills nodata gaps from the next scene. The result is encoded as PNG and stored in the Cache API, so revisiting an area is instant and works offline.

The NDVI (vegetation) mode reads the red and NIR bands instead and colour-maps the vegetation index.

### Hidden trails

Each OSM way gets a `hiddenScore` from 0 to 1. It is 0 for any trail that belongs to a marked hiking route (bandă, cruce, punct, triunghi markings parsed from `osmc:symbol`). Otherwise the score rises with poor `trail_visibility`, `informal=yes`, no name, being a plain `path`, and demanding SAC grades. Ways scoring ≥ 0.6 are drawn as dashed magenta **hidden trails**.

### Routing

The router runs A* over a graph whose junctions are shared OSM node IDs. Edge time uses Tobler's hiking function on the DEM slope, scaled by trail kind and SAC difficulty. Preferences bias the cost, not the reported time:

- **Seek hidden trails:** cuts the cost of hidden segments by up to 40%.
- **Avoid hidden trails:** adds up to 40% to their cost.
- **Max difficulty:** removes any edge above the chosen SAC grade.

The heuristic stays admissible under every preference setting.

## Installing on iPhone

Serve over HTTPS, open the app in Safari, then tap **Share → Add to Home Screen**. It launches as a standalone full-screen app, not a Safari tab. It has its own icon and status bar, and its service worker gives it an offline app shell. Imagery, terrain and labels are cached for offline use. Trail areas you have viewed are also stored on the device.

## Data and attribution

- Contains modified Copernicus Sentinel data, via Element 84 Earth Search (`sentinel-2-c1-l2a`)
- Trails and places © OpenStreetMap contributors (ODbL), via Overpass API
- Labels: OpenFreeMap (OpenMapTiles schema)
- Terrain: Mapzen Terrarium tiles on AWS Open Data
