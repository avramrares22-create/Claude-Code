"""
Builds Romania-wide trail cells from an OpenStreetMap extract (Geofabrik .pbf,
or .osm XML for testing): every path, track and rural road, hiking/MTB route
relations and nature POIs, split into z11 cells (~20 km) the app loads on demand.

Compact format v1 (decoded by src/engine/trails/cellFormat.ts):
  { "v": 1,
    "t": [ {tags}, ... ],                      # tag dictionary
    "w": [ [wayId, tagIdx, [x0, y0, dx1, dy1, ...], [[vertexIdx, nodeId], ...]] ],
    "r": [ [relId, {tags}, [wayId, ...]] ],
    "p": [ [nodeId, x, y, {tags}] ] }
Coordinates are integers in 1e-6 degrees, delta-encoded along each way. Node ids
are only kept where ways meet (junctions) — the only place routing needs them.

Usage: python scripts/data/build_trail_cells.py romania-latest.osm.pbf dist/data/trails
"""

import json
import math
import os
import sys
from collections import defaultdict

import numpy as np
import osmium

CELL_Z = 11
HIGHWAYS = {
    "path", "track", "footway", "bridleway", "cycleway", "steps", "via_ferrata",
    "tertiary", "unclassified",
}
# Rural service roads matter (forest/quarry/hut access); driveways and car parks do not.
SKIP_SERVICE = {"driveway", "parking_aisle", "drive-through", "alley"}
# Urban pedestrian infrastructure is noise on a nature map.
SKIP_FOOTWAY = {"sidewalk", "crossing", "traffic_island", "access_aisle"}
ROUTES = {"hiking", "foot", "mtb", "bicycle"}
KEEP_TAGS = {
    "highway", "name", "ref", "surface", "tracktype", "smoothness", "sac_scale", "mtb:scale",
    "trail_visibility", "informal", "access", "foot", "bicycle", "vehicle", "motor_vehicle",
    "motorcycle", "4wd_only", "width", "incline", "service", "bridge", "ford", "seasonal",
}
ROUTE_TAGS = {"route", "name", "ref", "osmc:symbol", "colour", "network"}
POI_TAGS = {"natural", "waterway", "tourism", "amenity", "name", "ele"}


def tile_x(lng, z):
    return int((lng + 180) / 360 * 2**z)


def tile_y(lat, z):
    s = math.sin(math.radians(max(-85.0511, min(85.0511, lat))))
    return int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 2**z)


def is_poi(t):
    return (
        t.get("natural") in ("peak", "saddle", "spring", "cave_entrance")
        or t.get("waterway") == "waterfall"
        or t.get("tourism") in ("viewpoint", "alpine_hut", "wilderness_hut", "camp_site")
        or t.get("amenity") == "shelter"
    )


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []  # (id, tags, refs, xs, ys)
        self.rels = []
        self.pois = []

    def way(self, w):
        t = w.tags
        hw = t.get("highway")
        if hw not in HIGHWAYS and not (hw == "service" and t.get("service") not in SKIP_SERVICE):
            return
        if t.get("footway") in SKIP_FOOTWAY:
            return
        try:
            xs = [round(n.location.lon * 1e6) for n in w.nodes]
            ys = [round(n.location.lat * 1e6) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(xs) < 2:
            return
        tags = {k: v for k, v in t if k in KEEP_TAGS}
        self.ways.append((w.id, tags, [n.ref for n in w.nodes], xs, ys))

    def relation(self, r):
        if r.tags.get("type") == "route" and r.tags.get("route") in ROUTES:
            tags = {k: v for k, v in r.tags if k in ROUTE_TAGS}
            self.rels.append((r.id, tags, [m.ref for m in r.members if m.type == "w"]))

    def node(self, n):
        if n.tags and is_poi(n.tags):
            tags = {k: v for k, v in n.tags if k in POI_TAGS}
            self.pois.append((n.id, round(n.location.lon * 1e6), round(n.location.lat * 1e6), tags))


def main(src, out):
    c = Collector()
    c.apply_file(src, locations=True, idx="flex_mem")
    print(f"ways {len(c.ways)}, routes {len(c.rels)}, pois {len(c.pois)}", flush=True)

    # Junctions: nodes used by more than one kept way, or twice by one (loops).
    all_refs = np.concatenate([np.asarray(w[2], dtype=np.int64) for w in c.ways]) if c.ways else np.zeros(0, np.int64)
    uniq, counts = np.unique(all_refs, return_counts=True)
    junction = set(uniq[counts > 1].tolist())

    cells = defaultdict(lambda: {"w": [], "r": [], "p": [], "tag_ix": {}, "t": []})
    way_cells = defaultdict(set)

    def tag_index(cell, tags):
        key = json.dumps(tags, sort_keys=True, ensure_ascii=False)
        ix = cell["tag_ix"].get(key)
        if ix is None:
            ix = cell["tag_ix"][key] = len(cell["t"])
            cell["t"].append(tags)
        return ix

    for wid, tags, refs, xs, ys in c.ways:
        x0, x1 = tile_x(min(xs) / 1e6, CELL_Z), tile_x(max(xs) / 1e6, CELL_Z)
        y0, y1 = tile_y(max(ys) / 1e6, CELL_Z), tile_y(min(ys) / 1e6, CELL_Z)
        coords = [xs[0], ys[0]]
        for k in range(1, len(xs)):
            coords += [xs[k] - xs[k - 1], ys[k] - ys[k - 1]]
        # Always keep the end nodes too: other cells' ways may continue from them.
        junc = [[k, r] for k, r in enumerate(refs) if r in junction or k in (0, len(refs) - 1)]
        for cx in range(x0, x1 + 1):
            for cy in range(y0, y1 + 1):
                cell = cells[(cx, cy)]
                cell["w"].append([wid, tag_index(cell, tags), coords, junc])
                way_cells[wid].add((cx, cy))

    for rid, tags, members in c.rels:
        touched = defaultdict(list)
        for m in members:
            for cell in way_cells.get(m, ()):
                touched[cell].append(m)
        for cell, ms in touched.items():
            cells[cell]["r"].append([rid, tags, ms])

    for nid, x, y, tags in c.pois:
        cells[(tile_x(x / 1e6, CELL_Z), tile_y(y / 1e6, CELL_Z))]["p"].append([nid, x, y, tags])

    total = 0
    for (cx, cy), cell in cells.items():
        d = os.path.join(out, str(CELL_Z), str(cx))
        os.makedirs(d, exist_ok=True)
        body = json.dumps({"v": 1, "t": cell["t"], "w": cell["w"], "r": cell["r"], "p": cell["p"]}, separators=(",", ":"), ensure_ascii=False)
        with open(os.path.join(d, f"{cy}.json"), "w", encoding="utf-8") as f:
            f.write(body)
        total += len(body)
    with open(os.path.join(out, "meta.json"), "w") as f:
        json.dump({"v": 1, "z": CELL_Z, "cells": len(cells), "ways": len(c.ways), "bytes": total}, f)
    print(f"wrote {len(cells)} cells, {total / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
