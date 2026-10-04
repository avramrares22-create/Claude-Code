"""
Adds a waterway raster to each TrailNet sample: forest streams look like trails
from space, so the model learns them as an explicit "not a trail" class.

Usage: python ml/add_water.py [data_dir]
"""

import glob
import json
import os
import sys
import time

import numpy as np
from affine import Affine
from pyproj import Transformer
from rasterio.windows import from_bounds

sys.path.insert(0, os.path.dirname(__file__))
from build_dataset import OSM, draw_line, get_json  # noqa: E402

DATA = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
WATERWAYS = {"stream", "river", "brook", "ditch", "drain", "canal", "torrent"}


def waterways(bbox):
    els = get_json(f"{OSM}?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}")["elements"]
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in els if e["type"] == "node"}
    out = []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "way" and t.get("waterway") in WATERWAYS and t.get("tunnel") != "culvert":
            pts = [nodes[n] for n in e["nodes"] if n in nodes]
            if len(pts) >= 2:
                out.append((t["waterway"], pts))
    return out


def main():
    for f in sorted(glob.glob(os.path.join(DATA, "*.npz"))):
        d = dict(np.load(f))
        if "water" in d:
            print(os.path.basename(f), "has water")
            continue
        meta = json.loads(str(d["meta"]))
        bbox, epsg = meta["bbox"], meta["epsg"]
        H, W = d["label"].shape
        to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
        # Recover the exact window build_dataset.py read. Sentinel-2 10 m grids have
        # origins on multiples of 10 m, so any such origin yields the same window.
        xs, ys = to_utm.transform([bbox[0], bbox[2], bbox[0], bbox[2]], [bbox[1], bbox[1], bbox[3], bbox[3]])
        grid = Affine(10, 0, 0, 0, -10, 10_000_000)
        win = from_bounds(min(xs), min(ys), max(xs), max(ys), transform=grid).round_offsets().round_lengths()
        if (int(win.height), int(win.width)) != (H, W):
            # Sample clipped at a scene edge: window not recoverable, mark water unknown.
            d["water"] = np.zeros((H, W), np.uint8)
            d["water_known"] = np.uint8(0)
            np.savez_compressed(f, **d)
            print(os.path.basename(f), "clipped sample: water unknown")
            continue
        x0 = win.col_off * 10
        y1 = 10_000_000 - win.row_off * 10
        water = np.zeros((H, W), np.uint8)
        try:
            ws = waterways(bbox)
        except Exception as e:  # keep going; rerun to fill gaps
            print(os.path.basename(f), "ERROR", e)
            continue
        for kind, pts in ws:
            ux, uy = to_utm.transform([p[0] for p in pts], [p[1] for p in pts])
            px = [((x - x0) / 10, (y1 - y) / 10) for x, y in zip(ux, uy)]
            r = 1.0 if kind in ("river", "canal") else 0.75
            for (a, b), (c, e2) in zip(px, px[1:]):
                draw_line(water, a - 0.5, b - 0.5, c - 0.5, e2 - 0.5, r)
        d["water"] = water
        d["water_known"] = np.uint8(1)
        np.savez_compressed(f, **d)
        print(f"{os.path.basename(f):22s} waterways={len(ws)} water={water.mean():.3f} overlap_with_trails={(water & d['label']).mean():.4f}", flush=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
