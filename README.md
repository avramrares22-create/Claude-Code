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
- **AI-corrected roads.** When you zoom in, TrailNet checks mapped trails against the imagery and nudges misplaced ones onto the real path. An auto-scan re-runs every minute (and whenever the map settles) to find more hidden trails around you.
- **Navigation from your position.** Tap Directions on any place, trail or long-press pin. You get:
  - a route chosen by RouteNet
  - the road you should follow highlighted (done part greyed out)
  - a heading-up 3D camera
  - spoken turn-by-turn directions
  - automatic rerouting when you leave the route
- **Bear risk while navigating.** A corner panel shows a 1–100 bear risk for 10 km and 1 km around you. It updates every 30 s or every 150 m, and voice warns you when the risk right around you becomes very high. Tap it for details and safety tips. See *Bear risk model* below.
- **Offline maps.** Download all of Romania (overview, zoom 6–12), a mountain range, a city, or just the area on screen. Satellite, terrain, labels, trails and routing then work with no signal. Downloads can be paused and resumed. Search falls back to places and trails stored on the phone.
- **Made for the mountains:**
  - track recording with GPX export
  - GPX import
  - place search
  - long-press any spot for its coordinates and elevation
  - a dark UI built for one-handed use

Everything runs on the phone. There are no API keys and no backend; static data is published by CI.

```
npm install
npm run dev        # http://localhost:5173 (on your LAN too, so an iPhone can open it)
npm test           # 103 unit tests
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

**TrailNet** (`public/models/trailnet.onnx`) is a U-Net. Its input is Sentinel-2 bands B02, B03, B04 and B08 at 10 m. Version 3 was trained on 242 Romanian image tiles with OpenStreetMap labels:

- Regions where OSM is too sparse to trust its "no trail" pixels were excluded from training.
- Held-out regions: precision 0.60 and recall 0.30 (F1 0.40) at the app's threshold of 0.3 (±2 px tolerance).
- Known weakness: about 14% of mapped stream pixels are mistaken for trails. An experiment adding a waterway head (`TRAILNET_HEADS=2`) did not reduce this, because Carpathian forest roads often follow streams, so it isn't shipped.
- Besides finding new trails, its output is used to shift mapped OSM ways sideways onto the path visible in the imagery. Ends and junctions stay anchored, so routing is unaffected.

Scores on held-out regions are measured against OSM, so they understate real precision: every true but unmapped trail it finds counts as an error. The current scores are in `ml/trailnet-report.json`. Retrain with:

```
python ml/build_dataset.py && python ml/add_water.py && python ml/train_trailnet.py   # TRAILNET_HEADS=2 for the waterway experiment
```

**RouteNet** (`src/engine/routing/routenet.weights.json`) has one small MLP per travel mode. Each predicts a log-speed correction to the expert model, from features of the way and the DEM slope.

- **Training data:** 21,668 stretches of public GPS trips, map-matched in 85 Romanian regions.
- **Brașov focus:** 25 zones around Brașov (Tâmpa, Postăvarul, Piatra Mare, Pietrele lui Solomon, Cristian, Codlea, Zărnești, Predeal…) were collected densely, and rows within 40 km of Brașov count 3× in training.
- **Validation:** whole regions are held out.

| mode | all held-out regions: expert → RouteNet | Brașov held-out: expert → RouteNet |
|------|------|------|
| hike | 23.6% → **20.1%** | 20.3% → **19.3%** |
| bike | 42.3% → **39.0%** | 43.1% → **41.2%** |
| moto | 26.1% → **14.5%** | 27.6% → **13.8%** |

The figures are median travel-time error.

Retrain with:

```
npm run routenet:collect && npm run routenet:build && npm run routenet:train
```

**Bear risk model** (`ml/bears/build_bear_grid.py` → `public/bears/density.bin`, 450 KB, works offline).

- **Census.** Bears per county come from the 2025 national genetic census: about 11,650 bears, from more than 24,000 DNA samples.
- **Habitat model.** A gradient-boosted presence/background model spreads each county's bears over its habitat. It learned from 599 bear sightings with about 1 km coordinates (GBIF, mostly observation.org), ESA WorldCover land cover and terrain.
  - Because people report sightings, the model also learns where people and bears meet: forest edges near villages, valleys and trail corridors.
  - Validation, 0.5° spatial blocks held out: AUC 0.82.
  - Independent check against iNaturalist bear records it never saw: AUC 0.93.
- **In the app**, the grid is combined with:
  - live iNaturalist sightings from the last 30 days. These are obscured to about 20 km, so each one is weighted by the chance it really falls inside the radius.
  - season (autumn feeding peak, winter denning)
  - sun position (dawn, dusk and night)
  - travel mode (quiet, fast bikes surprise bears more)
- **The index** is logarithmic: 1 means fewer than 1 bear per 500 km², 100 means 1.5 bears per km² or more. Bands: low below 20, moderate 20–44, high 45–69, very high 70 or more.

It is an encounter-likelihood estimate, not a probability of being attacked. No public geolocated attack records or live GPS-collar data exist for Romania, so neither is used. A low value never means "no bears".

## Data pipeline (GitHub Actions)

- **Every push:** typecheck, tests, build.
- **Default branch, daily:**
  - `data/trails/`: Romania-wide trail cells from the Geofabrik OSM extract, rebuilt weekly with pyosmium.
  - `data/s2/`: a pre-rendered z6–z12 Sentinel-2 mosaic (WebP), so imagery loads instantly instead of being rendered on the phone. Only tiles whose scenes changed are re-rendered.
  - `data/scenes.json`: a scene-index snapshot.
- Deploys to GitHub Pages.

## Honest limits

- 10 m imagery can't see narrow paths under dense canopy. GPS traces and OSM cover those.
- Detected trails are candidates, shown with a confidence score. Verify them on the ground.
- Legal access is taken from OSM tags. Romanian forest roads are usually closed to the public's motor vehicles even when untagged. The moto mode warns about this, and has a strict-access option.
- Offline packs above zoom 12 are rendered on the phone while downloading, which takes a few minutes for a mountain pack.
- ANCPI imagery may only be reachable from Romanian networks. Esri imagery is for viewing only (its terms forbid offline caching and data extraction, so TrailNet never runs on it).

## Data and attribution

- Contains modified Copernicus Sentinel data (Element 84 Earth Search, `sentinel-2-c1-l2a`)
- Trails, GPS traces and places © OpenStreetMap contributors (ODbL)
- Aerial imagery: Ortofotoplan © ANCPI; Esri, Maxar, Earthstar Geographics
- Bears: Romanian Ministry of Environment / INCDS "Marin Drăcea" genetic census 2025; GBIF.org and iNaturalist observations; ESA WorldCover 2021; geoBoundaries
- Labels: OpenFreeMap. Terrain: Mapzen Terrarium (AWS Open Data)
