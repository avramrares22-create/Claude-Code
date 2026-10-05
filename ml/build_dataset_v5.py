"""
TrailNet v5 dataset: past 1000 training tiles. The last v3 grid regions plus a
second, offset grid over Romania's hills and mountains (where hidden trails
are), two scenes each, labels from the OSM API. Validation regions from v1 are
untouched so scores compare with every earlier version.

Usage: python ml/build_dataset_v5.py [out_dir]
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import build_dataset_v3 as v3  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
v3.OUT = OUT

# Carpathian arc + Apuseni + Subcarpathian hills (lon, lat boxes): trail country.
UPLAND = [
    (22.2, 45.0, 23.6, 45.8),  # Retezat–Parâng–Godeanu (val region Retezat itself is excluded below)
    (23.6, 45.2, 25.0, 45.8),  # Lotru–Făgăraș–Cozia
    (25.0, 45.2, 26.6, 45.9),  # Bucegi–Piatra Craiului–Ciucaș–Baiului
    (25.6, 45.6, 26.6, 46.6),  # Brașov depression rim, Vrancea, Nemira
    (25.2, 46.4, 26.4, 47.6),  # Hășmaș–Ceahlău–Călimani–Rodna south
    (24.2, 47.2, 25.6, 47.9),  # Rodna–Maramureș
    (22.4, 46.2, 23.6, 47.0),  # Apuseni (Padiș val excluded below)
    (21.8, 44.6, 22.8, 45.4),  # Banat mountains
    (24.4, 44.9, 26.0, 45.3),  # Subcarpathian hills, Argeș–Dâmbovița
]


def upland_regions():
    rng = np.random.default_rng(23)
    out, k = {}, 0
    for w, s, e, n in UPLAND:
        for lat in np.arange(s, n, 0.16):
            for lng in np.arange(w, e, 0.16):
                x, y = lng + rng.uniform(-0.05, 0.05), lat + rng.uniform(-0.05, 0.05)
                if v3.inside(x + 0.02, y + 0.02):
                    out[f"u{k:03d}"] = (round(float(x), 3), round(float(y), 3))
                    k += 1
    return out


VAL_BOXES = [(22.86, 45.37), (25.58, 47.45), (22.70, 46.60), (24.55, 46.25), (28.25, 45.20)]  # keep well away from validation


def far_from_val(p):
    return all(abs(p[0] - x) > 0.15 or abs(p[1] - y) > 0.15 for x, y in VAL_BOXES)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    ups = [kv for kv in upland_regions().items() if far_from_val(kv[1])]
    regions = list(v3.grid_regions().items())[260:] + ups[: int(os.environ.get("V5_MAX", "220"))]
    print(f"{len(regions)} new regions", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(4) as ex:
        for name, msg in ex.map(v3.safe, regions):
            print(f"{name:8s} {msg}  [{time.time() - t0:.0f}s]", flush=True)
