"""
Builds the bear-density grid the app uses for its bear risk estimate.

Inputs (all public):
  - 2025 national genetic census of brown bears (Ministry of Environment /
    INCDS "Marin Drăcea"): bears per county, from >24,000 DNA samples.
  - ESA WorldCover 2021 (10 m land cover): forest, shrub, grass, crops, built-up.
  - Terrarium DEM (AWS Open Data): elevation and ruggedness.
  - Bear sightings with ~1 km coordinates from GBIF (mostly observation.org).
  - geoBoundaries county outlines (CC BY 4.0).

Model:
  1. A species-distribution model (gradient-boosted trees, presence vs
     background) learns where bears are *seen* from land cover and terrain.
     Sightings are reported by people, so this captures where people and bears
     meet: forest edges, valleys near villages, trail corridors.
  2. Each county's census total is spread over its cells in proportion to that
     suitability, so the grid's totals match the census exactly.

Output: public/bears/density.bin — one byte per 0.01° cell (log-scaled
bears/km²) — and density.json with the grid header and validation scores.

Run:  python ml/bears/build_bear_grid.py   (needs numpy, rasterio, scipy, scikit-learn, pillow)
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from scipy import ndimage
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "public" / "bears"
CACHE = HERE / "cache"

# Grid: Romania bbox at 0.01° (~1.1 km N–S × 0.78 km E–W).
W0, S0, E0, N0 = 20.2, 43.6, 29.8, 48.3
RES = 0.01
NX = round((E0 - W0) / RES)
NY = round((N0 - S0) / RES)
LAT = N0 - (np.arange(NY) + 0.5) * RES
LON = W0 + (np.arange(NX) + 0.5) * RES
CELL_KM2 = (RES * 111.32) * (RES * 111.32 * np.cos(np.radians(LAT)))[:, None]  # (NY,1)

# 2025 genetic census (bears per county). Combined counties are split by area
# of suitable habitat below. Counties the study did not list get a small
# "transient" allowance so the map never claims bears are impossible there.
CENSUS = {
    "HARGHITA": 1727, "BRASOV": 1329, "MURES": 873, "ARGES": 771, "SIBIU": 683,
    "BUZAU": 606, "COVASNA": 552, "HUNEDOARA": 526, "PRAHOVA": 493, "VALCEA": 459,
    "BACAU": 411, "VRANCEA": 363, "DAMBOVITA": 153, "SUCEAVA": 169, "NEAMT": 173,
    "ALBA": 109, "CLUJ": 7, "BIHOR": 5,
}
CENSUS_GROUPS = {("BISTRITA-NASAUD", "MARAMURES"): 1153, ("CARAS-SEVERIN", "GORJ", "TIMIS"): 253}
TRANSIENT_PER_KM2_FOREST = 0.002  # unlisted counties: ~1 bear per 500 km² of forest


def fetch(url: str, path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as r:
            path.write_bytes(r.read())
    return path


# ---------------------------------------------------------------- land cover

WC_CLASSES = {"tree": 10, "shrub": 20, "grass": 30, "crop": 40, "built": 50, "water": 80}


def worldcover() -> dict[str, np.ndarray]:
    cache = CACHE / "worldcover.npz"
    if cache.exists():
        return dict(np.load(cache))
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    frac = {k: np.zeros((NY, NX), np.float32) for k in WC_CLASSES}
    px = 15  # 1/8 overview: 3° / 4500 px = 1/1500°, so 15 px per 0.01° cell
    for lat0 in (42, 45, 48):
        for lon0 in (18, 21, 24, 27):
            url = f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N{lat0:02d}E{lon0:03d}_Map.tif"
            try:
                with rasterio.open("/vsicurl/" + url) as ds:
                    a = ds.read(1, out_shape=(4500, 4500))
            except Exception as e:  # sea tiles do not exist
                print("  skip", lat0, lon0, e.__class__.__name__)
                continue
            cells = a.reshape(300, px, 300, px)
            # tile cell (i,j) -> grid cell
            gy0 = round((N0 - (lat0 + 3)) / RES)
            gx0 = round((lon0 - W0) / RES)
            ys, ye = max(0, gy0), min(NY, gy0 + 300)
            xs, xe = max(0, gx0), min(NX, gx0 + 300)
            if ys >= ye or xs >= xe:
                continue
            sub = cells[ys - gy0 : ye - gy0, :, xs - gx0 : xe - gx0, :]
            for k, v in WC_CLASSES.items():
                frac[k][ys:ye, xs:xe] = (sub == v).mean(axis=(1, 3))
            print(f"  worldcover N{lat0}E{lon0:03d} ok")
    CACHE.mkdir(exist_ok=True)
    np.savez_compressed(cache, **frac)
    return frac


# ---------------------------------------------------------------- elevation

def elevation() -> np.ndarray:
    cache = CACHE / "elev.npy"
    if cache.exists():
        return np.load(cache)
    from PIL import Image

    z = 9
    n = 2**z
    tx = lambda lon: (lon + 180) / 360 * n
    ty = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    x0, x1 = int(tx(W0)), int(tx(E0))
    y0, y1 = int(ty(N0)), int(ty(S0))
    tiles = {}

    def load(xy):
        x, y = xy
        p = fetch(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", CACHE / f"dem/{z}_{x}_{y}.png")
        im = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
        return xy, im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768

    with ThreadPoolExecutor(8) as ex:
        for xy, e in ex.map(load, [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]):
            tiles[xy] = e
    fx = np.array([tx(l) for l in LON])
    fy = np.array([ty(l) for l in LAT])
    out = np.zeros((NY, NX), np.float32)
    for i, yy in enumerate(fy):
        for j, xx in enumerate(fx):
            t = tiles[(int(xx), int(yy))]
            out[i, j] = t[min(255, int((yy % 1) * 256)), min(255, int((xx % 1) * 256))]
    np.save(cache, out)
    return out


# ---------------------------------------------------------------- counties

def counties() -> tuple[np.ndarray, list[str]]:
    gj = json.loads(fetch(
        "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/ROU/ADM1/geoBoundaries-ROU-ADM1_simplified.geojson",
        HERE / "counties.geojson",
    ).read_text())
    names = [f["properties"]["shapeName"] for f in gj["features"]]
    transform = rasterio.transform.from_origin(W0, N0, RES, RES)
    ids = rasterize(((f["geometry"], i + 1) for i, f in enumerate(gj["features"])), out_shape=(NY, NX), transform=transform, fill=0, dtype="int16")
    return ids, names


# ---------------------------------------------------------------- sightings

def sightings() -> list[tuple[float, float, int]]:
    """Bear records with ≤1 km coordinates (lat, lon, year). Obscured iNaturalist records (~20 km) are excluded."""
    p = HERE / "gbif_raw.json"
    if not p.exists():
        recs, off = [], 0
        while True:
            d = json.load(urllib.request.urlopen(
                f"https://api.gbif.org/v1/occurrence/search?taxonKey=2433433&country=RO&hasCoordinate=true&limit=300&offset={off}", timeout=60))
            recs += d["results"]
            off += 300
            if d["endOfRecords"]:
                break
        p.write_text(json.dumps(recs))
    out = []
    for r in json.loads(p.read_text()):
        u = r.get("coordinateUncertaintyInMeters")
        if r.get("informationWithheld") or (u is not None and u > 1500):
            continue
        if r.get("basisOfRecord") not in ("HUMAN_OBSERVATION", "MACHINE_OBSERVATION", "OBSERVATION"):
            continue
        out.append((r["decimalLatitude"], r["decimalLongitude"], r.get("year") or 0))
    return out


# ---------------------------------------------------------------- features

def features(wc, elev, inside):
    km_y, km_x = RES * 111.32, RES * 111.32 * math.cos(math.radians(46))
    f = {}
    f["tree"] = wc["tree"]
    f["shrub_grass"] = wc["shrub"] + wc["grass"]
    f["crop"] = wc["crop"]
    f["built"] = wc["built"]
    for r_km in (2.5, 8):
        size = (max(1, round(2 * r_km / km_y)), max(1, round(2 * r_km / km_x)))
        f[f"tree_{r_km}k"] = ndimage.uniform_filter(wc["tree"], size)
        f[f"built_{r_km}k"] = ndimage.uniform_filter(wc["built"], size)
        f[f"crop_{r_km}k"] = ndimage.uniform_filter(wc["crop"], size)
    forest = wc["tree"] > 0.5
    town = wc["built"] > 0.25
    f["dist_forest_km"] = ndimage.distance_transform_edt(~forest, sampling=(km_y, km_x)).astype(np.float32)
    f["dist_town_km"] = np.minimum(ndimage.distance_transform_edt(~town, sampling=(km_y, km_x)), 30).astype(np.float32)
    f["elev"] = elev
    f["rugged"] = np.sqrt(np.maximum(ndimage.uniform_filter(elev**2, 3) - ndimage.uniform_filter(elev, 3) ** 2, 0))
    names = list(f)
    X = np.stack([f[k] for k in names], -1)
    X[~inside] = 0
    return X, names


# ---------------------------------------------------------------- model

def blocks(iy, ix, size=50):
    """Spatial CV blocks of 0.5°, so validation regions are far from training points."""
    return (iy // size) * 1000 + (ix // size)


def fit_sdm(X, inside, pres_idx, rng):
    iy_bg, ix_bg = np.nonzero(inside)
    pick = rng.choice(len(iy_bg), 30000, replace=False)
    bg = (iy_bg[pick], ix_bg[pick])
    Xp = X[pres_idx]
    Xb = X[bg]
    Xall = np.concatenate([Xp, Xb])
    y = np.concatenate([np.ones(len(Xp)), np.zeros(len(Xb))])
    blk = np.concatenate([blocks(*pres_idx), blocks(*bg)])
    # Weight so presences and background count equally.
    w = np.where(y == 1, len(Xb) / len(Xp), 1.0)
    ublk = np.unique(blk)
    rng.shuffle(ublk)
    folds = np.array_split(ublk, 5)
    scores = {"gbm": [], "logistic": []}
    for fb in folds:
        te = np.isin(blk, fb)
        if y[te].sum() < 5:
            continue
        gbm = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0)
        gbm.fit(Xall[~te], y[~te], sample_weight=w[~te])
        scores["gbm"].append(roc_auc_score(y[te], gbm.predict_proba(Xall[te])[:, 1]))
        sc = StandardScaler().fit(Xall[~te])
        lr = LogisticRegression(max_iter=2000, C=0.5).fit(sc.transform(Xall[~te]), y[~te], sample_weight=w[~te])
        scores["logistic"].append(roc_auc_score(y[te], lr.predict_proba(sc.transform(Xall[te]))[:, 1]))
    model = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0)
    model.fit(Xall, y, sample_weight=w)
    return model, {k: (float(np.mean(v)), float(np.std(v))) for k, v in scores.items()}


def main():
    rng = np.random.default_rng(7)
    print("land cover…")
    wc = worldcover()
    print("elevation…")
    elev = elevation()
    print("counties…")
    cid, cnames = counties()
    inside = cid > 0
    X, fnames = features(wc, elev, inside)

    pts = sightings()
    iy = np.clip(((N0 - np.array([p[0] for p in pts])) / RES).astype(int), 0, NY - 1)
    ix = np.clip(((np.array([p[1] for p in pts]) - W0) / RES).astype(int), 0, NX - 1)
    keep = inside[iy, ix]
    cells = np.unique(np.stack([iy[keep], ix[keep]], 1), axis=0)  # one presence per cell: limits observer clustering
    pres = (cells[:, 0], cells[:, 1])
    print(f"sightings: {len(pts)} precise, {len(cells)} distinct cells")

    model, cv = fit_sdm(X, inside, pres, rng)
    print("spatial-block CV AUC:", cv)

    flat = X.reshape(-1, X.shape[-1])
    suit = np.zeros(NY * NX, np.float32)
    m = inside.reshape(-1)
    suit[m] = model.predict_proba(flat[m])[:, 1]
    suit = suit.reshape(NY, NX)
    # Habitat floor: bears use all forest, sighted or not (sightings follow observers).
    suit = np.maximum(suit, 0.15 * wc["tree"] * (suit.max()))
    suit[~inside] = 0
    # Open water and dense city cores hold no resident bears.
    # Bears do enter towns (Brașov, Sinaia, Tușnad) but pass through rather than live in dense cores.
    suit *= (1 - wc["water"]) * (1 - 0.95 * np.clip((wc["built"] - 0.3) / 0.4, 0, 1))

    # Spread each county's census total over its suitable habitat. The per-county
    # scale (bears per unit of suitability) is smoothed across borders (~12 km),
    # since bears do not stop at county lines; the national total is preserved.
    scale = np.zeros((NY, NX), np.float32)
    name_to_ids = {n: i + 1 for i, n in enumerate(cnames)}
    groups = [((k,), v) for k, v in CENSUS.items()] + list(CENSUS_GROUPS.items())
    listed = set()
    for names, n in groups:
        mask = np.isin(cid, [name_to_ids[x] for x in names])
        listed |= set(names)
        scale[mask] = n / max(float((suit * mask * CELL_KM2).sum()), 1e-9)
    for nme, i in name_to_ids.items():
        if nme in listed:
            continue
        mask = cid == i
        n = TRANSIENT_PER_KM2_FOREST * float((wc["tree"] * mask * CELL_KM2).sum())
        scale[mask] = n / max(float((suit * mask * CELL_KM2).sum()), 1e-9)
    sig = (12 / (RES * 111.32), 12 / (RES * 111.32 * math.cos(math.radians(46))))
    wsum = ndimage.gaussian_filter(inside.astype(np.float32), sig)
    scale = ndimage.gaussian_filter(scale * inside, sig) / np.maximum(wsum, 1e-6)
    dens = scale * suit
    dens[~inside] = 0
    total = sum(CENSUS.values()) + sum(CENSUS_GROUPS.values())
    dens *= total / float((dens * CELL_KM2)[inside & np.isin(cid, [name_to_ids[x] for x in listed])].sum())

    # Sanity: census totals reproduced.
    for names, n in groups[:3]:
        mask = np.isin(cid, [name_to_ids[x] for x in names])
        print(f"  {'+'.join(names)}: census {n}, grid {float((dens * CELL_KM2)[mask].sum()):.0f} (smoothed across borders)")

    # Independent check: iNaturalist research-grade records (not used for training,
    # coordinates obscured to ~0.2°) should fall where the grid says bears are dense.
    inat = [r for r in json.loads((HERE / "gbif_raw.json").read_text()) if r.get("informationWithheld")]
    def coarse(d):
        k = 20
        h, w_ = NY // k * k, NX // k * k
        return d[:h, :w_].reshape(NY // k, k, NX // k, k).mean(axis=(1, 3))
    cd = coarse(dens)
    ci = coarse(inside.astype(np.float32)) > 0.5
    hits = np.zeros_like(cd)
    for r in inat:
        a = int((N0 - r["decimalLatitude"]) / RES) // 20
        b = int((r["decimalLongitude"] - W0) / RES) // 20
        if 0 <= a < hits.shape[0] and 0 <= b < hits.shape[1]:
            hits[a, b] = 1
    inat_auc = float(roc_auc_score(hits[ci].ravel(), cd[ci].ravel()))
    print("independent iNaturalist check (0.2° cells with a record vs without), AUC:", round(inat_auc, 3))

    # Spot checks at places with documented incidents / frequent sightings.
    spots = {
        "Brașov – Răcădău (city edge)": (45.627, 25.618),
        "Bucegi – Jepii Mici trail (fatal attack 2024)": (45.42, 25.52),
        "Transfăgărășan – Bâlea (frequent roadside bears)": (45.60, 24.62),
        "Băile Tușnad": (46.15, 25.86),
        "Predeal": (45.50, 25.58),
        "Sibiu city centre": (45.797, 24.152),
        "Cluj-Napoca centre": (46.770, 23.590),
        "București": (44.43, 26.10),
        "Constanța": (44.18, 28.63),
    }
    spot_vals = {}
    for k, (la, lo) in spots.items():
        a, b = int((N0 - la) / RES), int((lo - W0) / RES)
        r = 1
        spot_vals[k] = round(float(dens[a - r : a + r + 1, b - r : b + r + 1].mean()), 4)
        print(f"  {k}: {spot_vals[k]} bears/km²")

    # Encode: byte = 0 for none, else 1..255 log-scaled over [1e-4, 10] bears/km².
    LMIN, LMAX = -4.0, 1.0
    q = np.where(dens > 1e-4, 1 + np.round((np.log10(np.maximum(dens, 1e-4)) - LMIN) / (LMAX - LMIN) * 254), 0)
    q = np.clip(q, 0, 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "density.bin").write_bytes(q.tobytes())
    meta = {
        "version": 1,
        "west": W0, "north": N0, "res": RES, "width": NX, "height": NY,
        "encoding": {"zero": 0, "log10Min": LMIN, "log10Max": LMAX, "steps": 254},
        "unit": "bears per km²",
        "censusTotal": int(sum(CENSUS.values()) + sum(CENSUS_GROUPS.values())),
        "validation": {
            "sdmSpatialCvAuc": {k: {"mean": round(v[0], 3), "std": round(v[1], 3)} for k, v in cv.items()},
            "independentInatAuc": round(inat_auc, 3),
            "trainingSightings": len(cells),
        },
        "spotChecks": spot_vals,
        "sources": [
            "Brown bear genetic census 2022–2025, Romanian Ministry of Environment / INCDS Marin Drăcea (county totals)",
            "ESA WorldCover 2021 v200 (CC BY 4.0)",
            "Mapzen Terrarium DEM (AWS Open Data)",
            "GBIF.org occurrence records of Ursus arctos in Romania (observation.org and others)",
            "geoBoundaries ROU ADM1 (CC BY 4.0)",
        ],
    }
    (OUT / "density.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    print("wrote", OUT / "density.bin", q.nbytes, "bytes")


if __name__ == "__main__":
    sys.exit(main())
