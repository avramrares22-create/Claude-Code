"""
Builds the TrailNet training set: Sentinel-2 (B02,B03,B04,B08 @10 m, native UTM
grid) paired with rasterised OpenStreetMap ways over Romanian landscapes.

Everything stays in the scene's UTM grid — the same grid the app's imagery
worker reads — so training and on-device inference see identical pixels.

Usage:  python ml/build_dataset.py  [out_dir]
"""

import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

OUT = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
STAC = "https://earth-search.aws.element84.com/v1/search"
OSM = "https://api.openstreetmap.org/api/0.6/map.json"
UA = {"User-Agent": "natura-trailnet-dataset/1.0 (research; small one-off extract)"}

# ~0.04° boxes (≈3 x 4.5 km) across Romanian landscapes: alpine, forest, hills, farmland.
REGIONS = {
    # Southern Carpathians
    "bucegi": (25.44, 45.39), "piatra_craiului": (25.22, 45.52), "fagaras_n": (24.62, 45.63),
    "fagaras_s": (24.75, 45.56), "retezat": (22.86, 45.37), "parang": (23.53, 45.36),
    "cozia": (24.33, 45.31), "leaota": (25.30, 45.33), "iezer": (24.95, 45.45),
    "cindrel": (23.85, 45.58), "lotru": (23.65, 45.45), "tarcu": (22.53, 45.27),
    "godeanu": (22.70, 45.27), "vulcan": (23.12, 45.35), "mehedinti": (22.62, 44.98),
    "domogled": (22.45, 44.90), "semenic": (22.05, 45.17), "baiului": (25.62, 45.38),
    "ciucas": (25.92, 45.50), "postavarul": (25.55, 45.57),
    # Eastern Carpathians
    "rodna": (24.78, 47.57), "maramures": (24.35, 47.73), "gutai": (23.82, 47.70),
    "tibles": (24.20, 47.52), "calimani": (25.20, 47.10), "ceahlau": (25.95, 46.95),
    "rarau": (25.58, 47.45), "hasmas": (25.82, 46.68), "nemira": (26.27, 46.25),
    "vrancea": (26.55, 45.85), "penteleu": (26.38, 45.60), "harghita": (25.62, 46.40),
    "bodoc": (25.88, 46.00), "suhard": (25.30, 47.38),
    # Apuseni & west
    "padis": (22.70, 46.60), "vladeasa": (22.80, 46.75), "trascau": (23.55, 46.30),
    "bihor": (22.65, 46.48), "zarand": (22.20, 46.15), "poiana_rusca": (22.45, 45.70),
    # Hills, plateau, farmland (tracks between fields), Dobrogea
    "tarnave": (24.55, 46.25), "somes_hills": (23.80, 47.10), "moldova_hills": (27.20, 47.00),
    "subcarpati": (26.20, 45.25), "macin": (28.25, 45.20), "dobrogea": (28.40, 44.60),
    "baragan": (27.30, 44.55), "oltenia_hills": (23.90, 44.95),
}
VAL = {"retezat", "rarau", "padis", "tarnave", "macin"}
SIZE = 0.04

ROAD_LIKE = {
    "path", "track", "footway", "bridleway", "cycleway", "steps", "unclassified", "service",
    "tertiary", "residential", "secondary", "primary", "trunk", "living_street",
}


def get_json(url, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={**UA, **({"Content-Type": "application/json"} if data else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def best_scene(bbox):
    """Clearest summer scene fully covering the box (Jun–Sep, recent years)."""
    for years in (("2026", "2025"), ("2024",)):
        for y in years:
            body = {
                "collections": ["sentinel-2-c1-l2a"], "bbox": bbox,
                "datetime": f"{y}-06-01T00:00:00Z/{y}-09-30T23:59:59Z",
                "query": {"eo:cloud_cover": {"lt": 5}, "s2:nodata_pixel_percentage": {"lt": 5}},
                "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}], "limit": 5,
            }
            feats = get_json(STAC, json.dumps(body).encode())["features"]
            for f in feats:
                fb = f["bbox"]
                if fb[0] <= bbox[0] and fb[1] <= bbox[1] and fb[2] >= bbox[2] and fb[3] >= bbox[3]:
                    return f
    return None


def osm_ways(bbox):
    url = f"{OSM}?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
    els = get_json(url)["elements"]
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in els if e["type"] == "node"}
    ways = []
    for e in els:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") not in ROAD_LIKE:
            continue
        if t.get("tunnel") in ("yes", "building_passage") or t.get("covered") == "yes":
            continue
        pts = [nodes[n] for n in e["nodes"] if n in nodes]
        if len(pts) >= 2:
            ways.append((t["highway"], pts))
    return ways


def draw_line(lbl, x0, y0, x1, y1, r):
    """Thick line into a uint8 raster (radius r pixels)."""
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    ri = int(math.ceil(r))
    h, w = lbl.shape
    for i in range(n + 1):
        cx = x0 + (x1 - x0) * i / n
        cy = y0 + (y1 - y0) * i / n
        for dy in range(-ri, ri + 1):
            for dx in range(-ri, ri + 1):
                if dx * dx + dy * dy > r * r + 0.25:
                    continue
                x, y = int(cx + dx), int(cy + dy)
                if 0 <= x < w and 0 <= y < h:
                    lbl[y, x] = 1


def build(name, lng, lat):
    out = os.path.join(OUT, f"{name}.npz")
    if os.path.exists(out):
        return name, "cached"
    bbox = [lng, lat, lng + SIZE, lat + SIZE]
    scene = best_scene(bbox)
    if not scene:
        return name, "no clear scene"
    epsg = scene["properties"]["proj:epsg"]
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = to_utm.transform([bbox[0], bbox[2], bbox[0], bbox[2]], [bbox[1], bbox[1], bbox[3], bbox[3]])
    bounds = (min(xs), min(ys), max(xs), max(ys))
    a = scene["assets"]
    bands = []
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        for key in ("blue", "green", "red", "nir"):
            with rasterio.open(a[key]["href"]) as src:
                win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
                bands.append(src.read(1, window=win))
                transform = src.window_transform(win)
        with rasterio.open(a["scl"]["href"]) as src:
            win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
            scl = src.read(1, window=win)
    img = np.stack(bands).astype(np.float32)
    H, W = img.shape[1:]
    # SCL is 20 m: upsample by 2 (nearest) and crop to the 10 m grid.
    scl = np.repeat(np.repeat(scl, 2, 0), 2, 1)[:H, :W]
    if scl.shape != (H, W):
        scl = np.pad(scl, ((0, H - scl.shape[0]), (0, W - scl.shape[1])))
    valid = (~np.isin(scl, [0, 1, 3, 8, 9, 10]) & (img.min(0) > 0)).astype(np.uint8)

    ways = osm_ways(bbox)
    lbl = np.zeros((H, W), np.uint8)
    inv = ~transform
    for hw, pts in ways:
        ux, uy = to_utm.transform([p[0] for p in pts], [p[1] for p in pts])
        px = [inv * (x, y) for x, y in zip(ux, uy)]
        # Bigger roads are wider on the ground.
        r = 1.0 if hw in ("secondary", "primary", "trunk") else 0.75
        for (x0, y0), (x1, y1) in zip(px, px[1:]):
            draw_line(lbl, x0 - 0.5, y0 - 0.5, x1 - 0.5, y1 - 0.5, r)

    np.savez_compressed(
        out, img=img.astype(np.uint16), label=lbl, valid=valid,
        meta=json.dumps({"scene": scene["id"], "epsg": epsg, "bbox": bbox, "ways": len(ways)}),
    )
    return name, f"{scene['id']} {W}x{H} ways={len(ways)} pos={lbl.mean():.3f}"


def _safe(kv):
    name, (lng, lat) = kv
    try:
        return build(name, lng, lat)
    except Exception as e:  # keep going; a region can be retried
        return name, f"ERROR {type(e).__name__}: {e}"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    # Gentle on the OSM API: few parallel requests.
    with ThreadPoolExecutor(4) as ex:
        for name, msg in ex.map(_safe, REGIONS.items()):
            print(f"{name:16s} {msg}", flush=True)
