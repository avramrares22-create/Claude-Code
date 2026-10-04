"""
TrailNet v3 dataset: many more Romanian regions on a regular grid, and two
scenes per region from different dates (seasonal / illumination robustness).

Writes <name>_s0.npz and <name>_s1.npz (same labels, different imagery) next to
the v1 samples. Validation regions from v1 are untouched so scores compare.

Usage: python ml/build_dataset_v3.py [out_dir] [max_regions]
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import build_dataset as b  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 130

# Rough outline of Romania (lon, lat) — good enough to keep samples inside the country.
ROMANIA = [
    (22.15, 47.95), (22.9, 48.05), (24.0, 47.95), (24.9, 47.75), (26.6, 48.25), (27.4, 48.4),
    (28.2, 47.9), (28.1, 46.8), (28.2, 45.9), (28.6, 45.3), (29.7, 45.25), (29.55, 44.8),
    (28.6, 44.2), (28.55, 43.75), (27.7, 43.75), (27.0, 44.1), (25.4, 43.65), (24.2, 43.7),
    (22.9, 43.85), (22.4, 44.5), (21.4, 44.75), (21.35, 45.2), (20.3, 46.1), (21.2, 46.4),
    (21.6, 47.0), (22.0, 47.4), (22.15, 47.95),
]


def inside(lng, lat):
    hit = False
    for (x1, y1), (x2, y2) in zip(ROMANIA, ROMANIA[1:]):
        if (y1 > lat) != (y2 > lat) and lng < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def grid_regions():
    rng = np.random.default_rng(7)
    pts = []
    for lat in np.arange(43.8, 48.2, 0.3):
        for lng in np.arange(20.5, 29.6, 0.3):
            # Jitter so boxes don't align with any MGRS/tile structure.
            x, y = lng + rng.uniform(-0.08, 0.08), lat + rng.uniform(-0.08, 0.08)
            if inside(x + 0.02, y + 0.02):
                pts.append((round(x, 3), round(y, 3)))
    rng.shuffle(pts)
    taken = {tuple(v) for v in b.REGIONS.values()}
    return {f"g{i:03d}": p for i, p in enumerate(pts) if p not in taken}


def scenes(bbox, n=2):
    """Up to n clear scenes fully covering the box, from different months."""
    out, months = [], set()
    for y in ("2026", "2025", "2024"):
        body = {
            "collections": ["sentinel-2-c1-l2a"], "bbox": bbox,
            "datetime": f"{y}-04-15T00:00:00Z/{y}-10-31T23:59:59Z",
            "query": {"eo:cloud_cover": {"lt": 5}, "s2:nodata_pixel_percentage": {"lt": 5}},
            "sortby": [{"field": "properties.eo:cloud_cover", "direction": "asc"}], "limit": 20,
        }
        for f in b.get_json(b.STAC, json.dumps(body).encode())["features"]:
            fb, m = f["bbox"], f["properties"]["datetime"][:7]
            covers = fb[0] <= bbox[0] and fb[1] <= bbox[1] and fb[2] >= bbox[2] and fb[3] >= bbox[3]
            if covers and m not in months:
                out.append(f)
                months.add(m)
                if len(out) == n:
                    return out
    return out


def build_region(name, lng, lat):
    if os.path.exists(os.path.join(OUT, f"{name}_s0.npz")):
        return name, "cached"
    bbox = [lng, lat, lng + b.SIZE, lat + b.SIZE]
    sc = scenes(bbox)
    if not sc:
        return name, "no clear scene"
    ways = b.osm_ways(bbox)
    if len(ways) < 5:
        return name, f"too few ways ({len(ways)})"
    msgs = [b.build(f"{name}_s{k}", lng, lat, scene=scene, ways=ways, out_dir=OUT)[1] for k, scene in enumerate(sc)]
    return name, " | ".join(msgs)


def safe(kv):
    name, (lng, lat) = kv
    try:
        return build_region(name, lng, lat)
    except Exception as e:
        return name, f"ERROR {type(e).__name__}: {e}"


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    regions = list(grid_regions().items())[:MAX]
    print(f"{len(regions)} grid regions", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(4) as ex:
        for name, msg in ex.map(safe, regions):
            print(f"{name:8s} {msg}  [{time.time() - t0:.0f}s]", flush=True)
