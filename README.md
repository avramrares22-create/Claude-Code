# Natura: off-road and nature map of Romania

Natura is an installable web app (PWA) for iOS and Linux, built on a custom map engine. It is for hikers, mountain bikers and off-road riders, and does what mainstream maps don't:

- **Finds trails nobody mapped.** Two detectors look for them:
  - **TrailNet**, a neural network trained on Romanian satellite imagery
  - **public GPS traces**, which show where people actually go
- **Routes like a local.** **RouteNet** is a small on-device model that learned real travel speeds from GPS recordings in the Carpathians. It powers hike, bike and moto/4x4 routing, using slope, surface, track grade, MTB difficulty and legal access.
- **Super-zoom imagery.** Fresh Sentinel-2 imagery (10 m) is shown at every zoom. From zoom 14 it switches to sub-metre aerial photos up to zoom 21:
  - ANCPI national orthophoto when reachable
  - Esri World Imagery otherwise
- **Every OSM path, track and rural road**, with Romanian trail markings (bandă, cruce, punct, triunghi), SAC and MTB grades, and 3D terrain.

Everything runs on the phone. There are no API keys and no backend; static data is published by CI.

```
npm install
npm run dev        # http://localhost:5173 (on your LAN too, so an iPhone can open it)
npm test           # 77 unit tests
npm run build      # typecheck and production build in dist/
```

## Install on iPhone

1. Merge into the default branch and enable **Settings → Pages → Source: GitHub Actions**.
2. The workflow publishes the app to `https://<user>.github.io/<repo>/`.
3. Open that URL in Safari, then tap **Share → Add to Home Screen**.

Natura then launches full-screen from its own icon, like an app, with no Safari address bar. It is not in the App Store.

## Architecture

```
src/engine/
  MapEngine.ts           facade: MapLibre map, layers, discovery, routing
  imagery/               custom Sentinel-2 engine
    sceneIndex.ts          best scenes per MGRS square (global, so tiles never seam)
    tilePipeline.ts        COG range reads → SCL cloud mask → UTM→Mercator → composite
    imagery.worker.ts      off-main-thread rendering + Cache API
    hires.ts               picks ANCPI / Esri sub-metre imagery reachable from the device
  trails/                OSM data model
    classify.ts            marked / path / track / road / hidden; surface, grade, access per mode
    trailStore.ts          static Romania cells first, Overpass fallback, IndexedDB cache
    cellFormat.ts          compact cell decoder
  detect/                unmapped-trail discovery
    gps.ts                 public GPS traces → corridors not on the map
    trailnet.ts            TrailNet probabilities → hysteresis → skeleton → trails
    trailnetRunner.ts      Sentinel-2 bands → onnxruntime-web (WASM) inference
    merge.ts               fuses agreeing GPS + imagery detections
    raster.ts, vectorize.ts  shared raster toolkit; snaps detections onto OSM junctions
  routing/
    router.ts              A* by travel time, modes foot/bike/moto, preferences
    routeModel.ts          expert speed models (Tobler for walking, power-limited cycling…)
    routeNet.ts            learned correction on top of the expert model
ml/                      TrailNet dataset + training (PyTorch → ONNX)
scripts/routenet/        RouteNet data collection, map matching, training (TypeScript)
scripts/data/            CI data builders (trail cells, mosaic pre-render)
```

## The models

**TrailNet** (`public/models/trailnet.onnx`, 1.5 MB) is a U-Net. Its input is Sentinel-2 bands B02, B03, B04 and B08 at 10 m. It was trained on 47 Romanian landscapes with OpenStreetMap labels:

- Regions where OSM is too sparse to trust its "no trail" pixels were excluded from training.
- Held-out regions: precision 0.52 and recall 0.32 at the app's threshold of 0.5 (±2 px tolerance).
- Known weakness: about 16% of mapped stream pixels are mistaken for trails. An experiment adding a waterway head (`TRAILNET_HEADS=2`) did not reduce this, because Carpathian forest roads often follow streams, so it isn't shipped.

Scores on held-out regions are measured against OSM, so they understate real precision: every true but unmapped trail it finds counts as an error. The current scores are in `ml/trailnet-report.json`. Retrain with:

```
python ml/build_dataset.py && python ml/add_water.py && python ml/train_trailnet.py   # TRAILNET_HEADS=2 for the waterway experiment
```

**RouteNet** (`src/engine/routing/routenet.weights.json`, 8 KB) has one small MLP per travel mode. Each predicts a log-speed correction to the expert model, from features of the way and the DEM slope. It was trained on 8,351 stretches of public GPS trips map-matched in 29 Romanian regions. Validation holds out whole regions:

| mode | median time error, expert | median time error, RouteNet |
|------|------|------|
| hike | 26.9% | **20.9%** |
| bike | 39.9% | **38.3%** |
| moto | expert rules only (too little data to beat them) | |

Retrain with:

```
npm run routenet:collect && npm run routenet:build && npm run routenet:train
```

## Data pipeline (GitHub Actions)

- **Every push:** typecheck, tests, build.
- **Default branch, daily:**
  - `data/trails/`: Romania-wide trail cells from the Geofabrik OSM extract, rebuilt weekly with pyosmium.
  - `data/s2/`: a pre-rendered z6–z9 Sentinel-2 mosaic, so the country view opens instantly.
  - `data/scenes.json`: a scene-index snapshot.
- Deploys to GitHub Pages.

## Honest limits

- 10 m imagery can't see narrow paths under dense canopy. GPS traces and OSM cover those.
- Detected trails are candidates, shown with a confidence score. Verify them on the ground.
- Legal access is taken from OSM tags. Romanian forest roads are usually closed to the public's motor vehicles even when untagged. The moto mode warns about this, and has a strict-access option.
- ANCPI imagery may only be reachable from Romanian networks. Esri imagery is for viewing only (its terms forbid offline caching and data extraction, so TrailNet never runs on it).

## Data and attribution

- Contains modified Copernicus Sentinel data (Element 84 Earth Search, `sentinel-2-c1-l2a`)
- Trails, GPS traces and places © OpenStreetMap contributors (ODbL)
- Aerial imagery: Ortofotoplan © ANCPI; Esri, Maxar, Earthstar Geographics
- Labels: OpenFreeMap. Terrain: Mapzen Terrarium (AWS Open Data)
