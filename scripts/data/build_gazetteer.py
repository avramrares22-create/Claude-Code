"""
Builds the offline search index (gazetteer) for Romania from an OpenStreetMap
extract (Geofabrik .pbf, or .osm XML for testing).

Everything people search for on a nature map: towns, villages and city
districts; peaks, saddles, lakes, rivers, waterfalls, springs, caves, gorges;
huts, shelters, campsites, viewpoints; castles, fortresses, monasteries;
ski slopes and cable cars; named hiking/MTB routes (with simplified geometry);
named paths and tracks; restaurants, stations, car parks; and streets.

Output (in OUT_DIR):
  core.json            places + nature + POIs + routes (always loaded)
  streets/X_Y.json     streets per 1° cell (loaded for the area you search in)
  routes/X_Y.json      simplified route geometry per 1° cell (loaded on demand)
  meta.json

Entry format (core): [name, alt, cat, x, y, imp, ctx, bbox, osm]
  name  display name               alt  other names joined by "|"
  cat   category code (CATS)       x,y  lon/lat × 1e5 (ints)
  imp   importance 0..100          ctx  index into "ctx" list (locality, county)
  bbox  [w, s, e, n] × 1e5 or 0    osm  "n123" / "w123" / "r123"

Usage: python scripts/data/build_gazetteer.py romania.osm.pbf dist/data/search
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import osmium
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent

# Category codes. Keep in sync with src/engine/search/categories.ts.
CATS = [
    "city", "town", "village", "district", "peak", "saddle", "ridge", "lake", "river", "waterfall",
    "spring", "cave", "gorge", "valley", "forest", "meadow", "hut", "camp", "lodging", "viewpoint",
    "attraction", "castle", "monument", "church", "park", "ski", "food", "station", "parking",
    "shop", "health", "sport", "trail", "path", "street", "other",
]
C = {c: i for i, c in enumerate(CATS)}

BASE_IMPORTANCE = {
    "city": 80, "town": 62, "village": 40, "district": 45, "peak": 44, "saddle": 30, "ridge": 32,
    "lake": 42, "river": 30, "waterfall": 44, "spring": 22, "cave": 42, "gorge": 46, "valley": 30,
    "forest": 26, "meadow": 26, "hut": 46, "camp": 30, "lodging": 22, "viewpoint": 34,
    "attraction": 40, "castle": 56, "monument": 26, "church": 28, "park": 34, "ski": 34,
    "food": 16, "station": 34, "parking": 12, "shop": 16, "health": 22, "sport": 22,
    "trail": 40, "path": 18, "street": 10, "other": 14,
}

STREET_HW = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "pedestrian", "service", "road",
}
PATH_HW = {"path", "track", "footway", "bridleway", "cycleway", "steps", "via_ferrata"}
ROUTES = {"hiking", "foot", "mtb", "bicycle", "ski", "piste"}
NAME_KEYS = ("name:ro", "alt_name", "old_name", "short_name", "loc_name", "official_name", "name:hu", "name:de", "name:en", "alt_name:ro")


def category(t) -> str | None:
    g = t.get
    place = g("place")
    if place == "city":
        return "city"
    if place == "town":
        return "town"
    if place in ("village", "hamlet"):
        return "village"
    if place in ("suburb", "neighbourhood", "quarter", "borough", "city_block"):
        return "district"
    nat = g("natural")
    if nat in ("peak", "volcano", "hill", "rock", "stone"):
        return "peak"
    if nat == "saddle" or g("mountain_pass") == "yes":
        return "saddle"
    if nat in ("ridge", "arete", "cliff", "mountain_range"):
        return "ridge"
    if nat == "water" or g("water") or g("landuse") == "reservoir":
        return "lake"
    ww = g("waterway")
    if ww == "waterfall" or nat == "waterfall":
        return "waterfall"
    if ww in ("river", "stream", "canal"):
        return "river"
    if nat == "spring" or g("amenity") == "drinking_water":
        return "spring"
    if nat == "cave_entrance" or g("natural") == "cave":
        return "cave"
    if nat in ("gorge", "canyon") or g("geological") == "gorge":
        return "gorge"
    if nat == "valley":
        return "valley"
    if nat == "wood" or g("landuse") == "forest":
        return "forest"
    if nat in ("grassland", "heath", "meadow") or g("landuse") == "meadow":
        return "meadow"
    tour = g("tourism")
    am = g("amenity")
    if tour in ("alpine_hut", "wilderness_hut") or am == "shelter" or g("building") == "cabin" and g("name"):
        return "hut"
    if tour in ("camp_site", "caravan_site", "picnic_site") or g("leisure") == "picnic_table" and False:
        return "camp"
    if tour in ("hotel", "guest_house", "hostel", "motel", "chalet", "apartment"):
        return "lodging"
    if tour == "viewpoint":
        return "viewpoint"
    hist = g("historic")
    if hist in ("castle", "fort", "fortress", "citadel", "city_gate", "tower") or g("castle_type"):
        return "castle"
    if hist in ("ruins", "archaeological_site", "monument", "memorial", "battlefield", "manor"):
        return "monument"
    if tour in ("attraction", "museum", "zoo", "theme_park", "gallery", "aquarium") or g("leisure") == "water_park":
        return "attraction"
    if am in ("place_of_worship", "monastery") or g("building") in ("church", "cathedral", "monastery"):
        return "church"
    if g("leisure") in ("park", "garden", "nature_reserve") or g("boundary") in ("national_park", "protected_area"):
        return "park"
    if g("piste:type") or g("aerialway") in ("station", "cable_car", "gondola", "chair_lift") or g("landuse") == "winter_sports":
        return "ski"
    if am in ("restaurant", "cafe", "fast_food", "pub", "bar", "biergarten", "ice_cream"):
        return "food"
    if g("railway") in ("station", "halt") or am == "bus_station" or g("public_transport") == "station":
        return "station"
    if am == "parking":
        return "parking"
    if g("shop") in ("supermarket", "mall", "department_store", "outdoor", "sports", "bicycle", "convenience"):
        return "shop"
    if am in ("hospital", "pharmacy", "clinic", "doctors", "mountain_rescue") or g("emergency") == "mountain_rescue":
        return "health"
    if g("leisure") in ("stadium", "sports_centre", "swimming_pool", "climbing", "ice_rink") or g("sport") == "climbing":
        return "sport"
    if am in ("university", "fuel", "townhall", "police") or g("office") == "government":
        return "other"
    return None


def importance(cat: str, t) -> int:
    v = BASE_IMPORTANCE[cat]
    if t.get("wikidata") or t.get("wikipedia"):
        v += 18
    pop = t.get("population")
    if pop and pop.replace(" ", "").isdigit():
        v += min(20, 3 * math.log10(max(1, int(pop.replace(" ", "")))))
    ele = t.get("ele")
    if cat == "peak" and ele:
        try:
            v += min(14, max(0, (float(ele.split()[0].replace(",", ".")) - 800) / 120))
        except ValueError:
            pass
    if t.get("tourism") or t.get("historic"):
        v += 3
    if t.get("website") or t.get("contact:website"):
        v += 3
    return int(max(1, min(100, v)))


def names(t) -> tuple[str, list[str]]:
    name = t.get("name") or t.get("name:ro") or ""
    alt = []
    for k in NAME_KEYS:
        for v in (t.get(k) or "").split(";"):
            v = v.strip()
            if v and v != name and v not in alt:
                alt.append(v)
    return name, alt


def simplify(pts, tol):
    """Douglas–Peucker on lon/lat pairs (tol in degrees)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                u = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2
            if d > best:
                best, bi = d, i
        if bi >= 0 and best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


class Relations(osmium.SimpleHandler):
    """Pass 1: route relations and named multipolygons (lakes, forests, parks…)."""

    def __init__(self):
        super().__init__()
        self.rels = {}
        self.member_ways = defaultdict(list)

    def relation(self, r):
        t = {k: v for k, v in r.tags}
        if not t.get("name") and not t.get("ref"):
            return
        kind = None
        if t.get("boundary") == "administrative":
            if t.get("admin_level") in ("4", "6", "7", "8", "9", "10") and t.get("name"):
                kind = "admin"
        elif t.get("type") == "route" and t.get("route") in ROUTES:
            if re.search(r"re[țţt]eaua|network", t.get("name", ""), re.I):
                return
            kind = "trail"
        elif t.get("type") in ("multipolygon", "boundary", "waterway"):
            kind = category(t)
            if t.get("type") == "waterway" and t.get("waterway") in ("river", "stream", "canal"):
                kind = "river"
        if not kind:
            return
        ways = [m.ref for m in r.members if m.type == "w"]
        if not ways:
            return
        self.rels[r.id] = (kind, t, ways)
        for w in ways:
            self.member_ways[w].append(r.id)


class Features(osmium.SimpleHandler):
    """Pass 2: named nodes and ways (with locations), plus geometry for relation members."""

    def __init__(self, rels: Relations):
        super().__init__()
        self.rels = rels
        self.out = []  # dicts
        self.streets = []
        self.member_geom = {}

    def node(self, n):
        if not n.tags or "name" not in n.tags:
            return
        t = {k: v for k, v in n.tags}
        cat = category(t)
        if not cat:
            return
        nm, alt = names(t)
        self.out.append(dict(name=nm, alt=alt, cat=cat, x=n.location.lon, y=n.location.lat, imp=importance(cat, t), bbox=None, osm=f"n{n.id}", tags=t))

    def way(self, w):
        member = w.id in self.rels.member_ways
        t = {k: v for k, v in w.tags} if (member or "name" in w.tags) else None
        if t is None:
            return
        try:
            pts = [(nd.location.lon, nd.location.lat) for nd in w.nodes if nd.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not pts:
            return
        if member:
            self.member_geom[w.id] = pts
        if "name" not in t:
            return
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        bbox = (min(xs), min(ys), max(xs), max(ys))
        mid = pts[len(pts) // 2]
        hw = t.get("highway")
        nm, alt = names(t)
        if hw in STREET_HW and not category(t):
            self.streets.append(dict(name=nm, x=mid[0], y=mid[1], hw=hw))
            return
        cat = category(t)
        if not cat and hw in PATH_HW:
            cat = "path"
        if not cat:
            return
        closed = len(pts) > 3 and pts[0] == pts[-1]
        c = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2) if closed else mid
        self.out.append(dict(name=nm, alt=alt, cat=cat, x=c[0], y=c[1], imp=importance(cat, t), bbox=bbox, osm=f"w{w.id}", tags=t))


def main(src: str, out_dir: str):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rels = Relations()
    rels.apply_file(src)
    print(f"relations: {len(rels.rels)}")
    f = Features(rels)
    f.apply_file(src, locations=True, idx="flex_mem")
    print(f"named nodes/ways: {len(f.out)}, street segments: {len(f.streets)}")

    # Relations: bbox from member ways; routes also keep simplified geometry.
    route_geom = {}
    admin_bbox = defaultdict(list)
    for rid, (kind, t, ways) in rels.rels.items():
        segs = [f.member_geom[w] for w in ways if w in f.member_geom]
        if not segs:
            continue
        xs = [p[0] for s in segs for p in s]
        ys = [p[1] for s in segs for p in s]
        bbox = (min(xs), min(ys), max(xs), max(ys))
        nm, alt = names(t)
        if not nm:
            nm = t.get("ref", "")
        if kind == "admin":
            admin_bbox[fold(nm)].append(bbox)
            continue
        if kind == "trail":
            mid = segs[len(segs) // 2][len(segs[len(segs) // 2]) // 2]
            imp = importance("trail", t) + min(12, len(segs) // 4)
            route_geom[rid] = [simplify(s, 0.00012) for s in segs]
            f.out.append(dict(name=nm, alt=alt, cat="trail", x=mid[0], y=mid[1], imp=min(100, imp), bbox=bbox, osm=f"r{rid}", tags=t))
        else:
            c = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
            f.out.append(dict(name=nm, alt=alt, cat=kind, x=c[0], y=c[1], imp=importance(kind, t) + 4, bbox=bbox, osm=f"r{rid}", tags=t))

    # Settlements: attach the municipality outline's bbox (for "fit to town") to the place node.
    for e in f.out:
        if e["cat"] in ("city", "town", "village", "district") and not e["bbox"]:
            for b in admin_bbox.get(fold(e["name"]), []):
                if b[0] <= e["x"] <= b[2] and b[1] <= e["y"] <= b[3] and (b[2] - b[0]) < 0.6:
                    e["bbox"] = b
                    break

    # Rivers and streams come in many pieces: merge same-name pieces that touch (≤ 3 km apart).
    merged, rest = merge_linear(f.out)
    entries = rest + merged
    entries = [e for e in entries if e["name"]]

    # Context: nearest district (inside cities), nearest settlement, county.
    settle = [e for e in entries if e["cat"] in ("city", "town", "village")]
    dist_ = [e for e in entries if e["cat"] == "district"]
    counties = load_counties()
    ctx_list, ctx_index = [], {}

    def ctx_of(x, y, own=None):
        county = county_of(counties, x, y)
        if own is not None and own["cat"] in ("city", "town", "village"):
            key = ("", county)
            if key not in ctx_index:
                ctx_index[key] = len(ctx_list)
                ctx_list.append(["", county])
            return ctx_index[key]
        loc = nearest(settle_tree, settle, x, y, own)
        d = nearest(dist_tree, dist_, x, y, own, max_km=1.6) if dist_ else None
        parts = []
        if d and loc and loc["cat"] == "city" and (own is None or own["cat"] != "district"):
            parts.append(d["name"])
        if loc:
            parts.append(loc["name"])
        key = (", ".join(parts), county)
        if key not in ctx_index:
            ctx_index[key] = len(ctx_list)
            ctx_list.append([key[0], county])
        return ctx_index[key]

    settle_tree = cKDTree(np.array([[e["x"] * math.cos(math.radians(46)), e["y"]] for e in settle])) if settle else None
    dist_tree = cKDTree(np.array([[e["x"] * math.cos(math.radians(46)), e["y"]] for e in dist_])) if dist_ else None

    # Deduplicate: same folded name + category within 300 m (node + area for the same lake, etc.).
    entries.sort(key=lambda e: -e["imp"])
    seen = defaultdict(list)
    core = []
    for e in entries:
        if e["cat"] == "path" and len(e["name"]) < 3:
            continue
        key = (fold(e["name"]), e["cat"] if e["cat"] not in ("hut", "lodging") else "hut")
        bb0 = e["bbox"] or (e["x"], e["y"], e["x"], e["y"])
        def same(o):
            if abs(o[0] - e["x"]) < 0.004 and abs(o[1] - e["y"]) < 0.003:
                return True
            ob = o[2]
            # Linear/area features: overlapping extents with the same name are the same thing.
            return e["cat"] in ("river", "trail", "park", "forest", "lake", "ridge", "path") and bb0[0] <= ob[2] and bb0[2] >= ob[0] and bb0[1] <= ob[3] and bb0[3] >= ob[1]
        if any(same(o) for o in seen[key]):
            continue
        seen[key].append((e["x"], e["y"], bb0))
        bb = [round(v * 1e5) for v in e["bbox"]] if e["bbox"] else 0
        core.append([e["name"], "|".join(e["alt"]), C[e["cat"]], round(e["x"] * 1e5), round(e["y"] * 1e5), e["imp"], ctx_of(e["x"], e["y"], e), bb, e["osm"]])

    # Streets: one entry per (name, settlement), placed at the middle segment.
    by_key = defaultdict(list)
    for s in f.streets:
        loc = nearest(settle_tree, settle, s["x"], s["y"], None, max_km=6)
        by_key[(s["name"], loc["name"] if loc else "")].append(s)
    shards = defaultdict(list)
    for (nm, _), segs in by_key.items():
        segs.sort(key=lambda s: (s["x"], s["y"]))
        s = segs[len(segs) // 2]
        rank = {"motorway": 30, "trunk": 28, "primary": 26, "secondary": 22, "tertiary": 18, "pedestrian": 18}.get(s["hw"], 10)
        shards[(math.floor(s["x"]), math.floor(s["y"]))].append([nm, "", C["street"], round(s["x"] * 1e5), round(s["y"] * 1e5), min(40, rank + min(10, len(segs))), ctx_of(s["x"], s["y"]), 0, ""])

    (out / "streets").mkdir(exist_ok=True)
    for (cx, cy), rows in shards.items():
        (out / "streets" / f"{cx}_{cy}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    (out / "routes").mkdir(exist_ok=True)
    rshards = defaultdict(dict)
    for e in core:
        if e[8].startswith("r") and e[2] == C["trail"]:
            rid = int(e[8][1:])
            if rid in route_geom:
                rshards[(math.floor(e[3] / 1e5), math.floor(e[4] / 1e5))][e[8]] = [
                    [[round(x * 1e5), round(y * 1e5)] for x, y in seg] for seg in route_geom[rid]
                ]
    for (cx, cy), rows in rshards.items():
        (out / "routes" / f"{cx}_{cy}.json").write_text(json.dumps(rows, separators=(",", ":")))

    (out / "core.json").write_text(json.dumps({"v": 1, "cats": CATS, "ctx": ctx_list, "e": core}, ensure_ascii=False, separators=(",", ":")))
    meta = {
        "v": 1,
        "entries": len(core),
        "streets": sum(len(v) for v in shards.values()),
        "streetShards": sorted(f"{x}_{y}" for x, y in shards),
        "routeShards": sorted(f"{x}_{y}" for x, y in rshards),
        "byCategory": {c: sum(1 for e in core if e[2] == i) for i, c in enumerate(CATS)},
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta)[:600])


def merge_linear(entries):
    """Merges same-name river/stream/path pieces into one entry with a combined bbox."""
    linear = defaultdict(list)
    rest = []
    for e in entries:
        if e["cat"] in ("river", "path") and e["osm"].startswith("w") and e["bbox"]:
            linear[(e["name"], e["cat"])].append(e)
        else:
            rest.append(e)
    merged = []
    for (nm, cat), es in linear.items():
        groups = []
        for e in es:
            for g in groups:
                b = g["bbox"]
                if e["bbox"][0] < b[2] + 0.03 and e["bbox"][2] > b[0] - 0.03 and e["bbox"][1] < b[3] + 0.03 and e["bbox"][3] > b[1] - 0.03:
                    g["bbox"] = (min(b[0], e["bbox"][0]), min(b[1], e["bbox"][1]), max(b[2], e["bbox"][2]), max(b[3], e["bbox"][3]))
                    g["parts"].append(e)
                    break
            else:
                groups.append({"bbox": e["bbox"], "parts": [e]})
        for g in groups:
            p = max(g["parts"], key=lambda e: e["imp"])
            mid = g["parts"][len(g["parts"]) // 2]
            span = max(g["bbox"][2] - g["bbox"][0], g["bbox"][3] - g["bbox"][1])
            merged.append({**p, "x": mid["x"], "y": mid["y"], "bbox": g["bbox"], "imp": min(100, p["imp"] + int(min(20, span * 40)))})
    return merged, rest


FOLD = str.maketrans("ăâîșşțţĂÂÎȘŞȚŢáéíóöőúüűÁÉÍÓÖŐÚÜŰ", "aaissttaaissttaeiooouuuaeiooouuu")


def fold(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", s.translate(FOLD).lower()).strip()


def nearest(tree, items, x, y, own=None, max_km=12):
    if tree is None:
        return None
    k = 3
    d, i = tree.query([x * math.cos(math.radians(46)), y], k=k)
    for dd, ii in zip(np.atleast_1d(d), np.atleast_1d(i)):
        if ii >= len(items):
            continue
        it = items[ii]
        if it is own:
            continue
        km = dd * 111.32
        lim = max_km if it["cat"] != "village" else min(max_km, 5)
        if km <= lim:
            return it
    return None


def load_counties():
    p = HERE / "counties.geojson"
    if not p.exists():
        return []
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree

    gj = json.loads(p.read_text())
    geoms = [shape(f["geometry"]) for f in gj["features"]]
    names_ = [f["properties"]["name"] for f in gj["features"]]
    return (STRtree(geoms), geoms, names_, Point)


def county_of(counties, x, y):
    if not counties:
        return ""
    tree, geoms, names_, Point = counties
    p = Point(x, y)
    for i in tree.query(p):
        if geoms[i].contains(p):
            return names_[i]
    return ""


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
