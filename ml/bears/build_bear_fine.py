"""
Fine bear-density layer (~200 m) for local risk around you.

The 1 km grid (build_bear_grid.py) carries the census: bears per county,
spread by a model trained on sightings. Sightings are only located to ~1 km,
so nothing can be *learned* below that. Instead each 1 km cell's bears are
redistributed over its 0.002° sub-cells (≈220 m × 155 m) by habitat use from
full-detail ESA WorldCover (40 m):
  - forest and forest edges are used most (brown bears are forest animals,
    and feed on edges, clearings and orchards next to forest),
  - built-up land is avoided (habituated bears do visit town edges, so the
    town edge keeps some weight, dense cores almost none),
  - open water has none.
Each 1 km cell's total is preserved exactly, so the fine layer never
disagrees with the census map; it only says *where inside the cell*.

Output: public/bears/fine/{lon}_{lat}.bin — 500×500 bytes per 1° tile,
same log encoding as density.bin; fine.json with the header.
Run after build_bear_grid.py:  python ml/bears/build_bear_fine.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "public" / "bears" / "fine"
CACHE = HERE / "cache"

W0, S0, E0, N0 = 20.2, 43.6, 29.8, 48.3
CRES = 0.01
FRES = 0.002
K = round(CRES / FRES)  # 5 fine cells per coarse cell side
NXC, NYC = round((E0 - W0) / CRES), round((N0 - S0) / CRES)
NXF, NYF = NXC * K, NYC * K
LMIN, LMAX = -4.0, 1.0


def decode(q: np.ndarray) -> np.ndarray:
    d = 10 ** (LMIN + (q.astype(np.float64) - 1) / 254 * (LMAX - LMIN))
    return np.where(q == 0, 0.0, d)


def encode(d: np.ndarray) -> np.ndarray:
    q = np.where(d > 1e-4, 1 + np.round((np.log10(np.maximum(d, 1e-4)) - LMIN) / (LMAX - LMIN) * 254), 0)
    return np.clip(q, 0, 255).astype(np.uint8)


def worldcover_fine() -> dict[str, np.ndarray]:
    cache = CACHE / "worldcover_fine.npz"
    if cache.exists():
        return dict(np.load(cache))
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    classes = {"tree": 10, "built": 50, "water": 80, "open": (20, 30, 40, 60, 90, 95, 100)}
    frac = {k: np.zeros((NYF, NXF), np.float32) for k in classes}
    px = 6  # 1/4 overview: 3°/9000 px = 1/3000°, so 6 px per 0.002° cell
    n = 1500  # fine cells per 3° tile side
    for lat0 in (42, 45, 48):
        for lon0 in (18, 21, 24, 27):
            url = f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N{lat0:02d}E{lon0:03d}_Map.tif"
            try:
                with rasterio.open("/vsicurl/" + url) as ds:
                    a = ds.read(1, out_shape=(9000, 9000))
            except Exception as e:  # sea tiles do not exist
                print("  skip", lat0, lon0, e.__class__.__name__)
                continue
            cells = a.reshape(n, px, n, px)
            gy0 = round((N0 - (lat0 + 3)) / FRES)
            gx0 = round((lon0 - W0) / FRES)
            ys, ye = max(0, gy0), min(NYF, gy0 + n)
            xs, xe = max(0, gx0), min(NXF, gx0 + n)
            if ys >= ye or xs >= xe:
                continue
            sub = cells[ys - gy0 : ye - gy0, :, xs - gx0 : xe - gx0, :]
            for k, v in classes.items():
                hit = np.isin(sub, v) if isinstance(v, tuple) else (sub == v)
                frac[k][ys:ye, xs:xe] = hit.mean(axis=(1, 3))
            del a, cells, sub
            print(f"  worldcover fine N{lat0}E{lon0:03d}", flush=True)
    CACHE.mkdir(exist_ok=True)
    np.savez_compressed(cache, **frac)
    return frac


def main():
    meta = json.loads((ROOT / "public" / "bears" / "density.json").read_text())
    assert meta["width"] == NXC and meta["height"] == NYC and abs(meta["res"] - CRES) < 1e-9
    coarse = decode(np.frombuffer((ROOT / "public" / "bears" / "density.bin").read_bytes(), np.uint8).reshape(NYC, NXC))
    print("land cover (40 m)…", flush=True)
    wc = worldcover_fine()
    tree, built, water = wc["tree"], wc["built"], wc["water"]

    # Habitat use inside a 1 km cell.
    sig = lambda m: (m / (FRES * 111.32), m / (FRES * 111.32 * 0.7))  # metres → cells (lat ~45.5)
    tree_near = ndimage.gaussian_filter(tree, sig(0.35))  # forest within ~350 m (edges count)
    built_near = ndimage.gaussian_filter(built, sig(0.3))
    h = 0.06 + 0.9 * tree + 0.55 * tree_near * (1 - tree)
    h *= 1 - 0.92 * np.clip(built, 0, 1)
    h *= 1 - 0.6 * np.clip((built_near - 0.25) / 0.6, 0, 1)
    h *= 1 - np.clip(water, 0, 1)
    h = np.maximum(h, 1e-4).astype(np.float32)

    # Normalise within each coarse cell: mean of the 5×5 sub-cells = coarse density.
    hc = h.reshape(NYC, K, NXC, K).mean(axis=(1, 3))
    scale = np.where(hc > 0, coarse / np.maximum(hc, 1e-9), 0)
    fine = h * np.repeat(np.repeat(scale, K, axis=0), K, axis=1)
    check = fine.reshape(NYC, K, NXC, K).mean(axis=(1, 3))
    err = float(np.abs(check - coarse).max())
    print(f"census preserved per 1 km cell: max abs error {err:.2e} bears/km²")

    # Spot checks: city streets vs forest just above them.
    spots = {
        "Brașov – Piața Sfatului": (45.6425, 25.5887), "Brașov – Gara": (45.6597, 25.6167), "Brașov – Astra": (45.640, 25.620),
        "Brașov – Răcădău (block edge)": (45.627, 25.618), "Tâmpa forest": (45.635, 25.597), "Postăvaru forest": (45.580, 25.565),
        "Poiana Brașov resort": (45.594, 25.555), "Bucegi plateau (alpine)": (45.42, 25.46), "București": (44.43, 26.10),
    }
    spot = {}
    for k, (la, lo) in spots.items():
        y, x = int((N0 - la) / FRES), int((lo - W0) / FRES)
        spot[k] = {"fine": round(float(fine[y, x]), 4), "coarse": round(float(coarse[int((N0 - la) / CRES), int((lo - W0) / CRES)]), 4)}
        print(f"  {k:32s} fine {spot[k]['fine']:.4f}  (1 km cell {spot[k]['coarse']:.4f}) bears/km²")

    OUT.mkdir(parents=True, exist_ok=True)
    q = encode(fine)
    tiles = []
    per = round(1 / FRES)  # 500 cells per degree
    for lo in range(int(np.floor(W0)), int(np.ceil(E0))):
        for la in range(int(np.floor(S0)), int(np.ceil(N0))):
            x0 = round((lo - W0) / FRES)
            y0 = round((N0 - (la + 1)) / FRES)
            tile = np.zeros((per, per), np.uint8)
            ys, ye = max(0, y0), min(NYF, y0 + per)
            xs, xe = max(0, x0), min(NXF, x0 + per)
            if ys >= ye or xs >= xe:
                continue
            tile[ys - y0 : ye - y0, xs - x0 : xe - x0] = q[ys:ye, xs:xe]
            if tile.max() == 0:
                continue
            (OUT / f"{lo}_{la}.bin").write_bytes(tile.tobytes())
            tiles.append(f"{lo}_{la}")
    (OUT.parent / "fine.json").write_text(json.dumps({
        "version": 1, "res": FRES, "tile": per, "tiles": tiles,
        "encoding": {"zero": 0, "log10Min": LMIN, "log10Max": LMAX, "steps": 254},
        "method": "1 km census-based density redistributed by habitat use (WorldCover 40 m); cell totals preserved",
        "spotChecks": spot,
    }, indent=1, ensure_ascii=False))
    print(f"wrote {len(tiles)} tiles to {OUT}")


if __name__ == "__main__":
    main()
