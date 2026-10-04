"""
TrailNet v4 dataset: the next 130 grid regions across Romania plus a dense
grid around Brașov (the app's home area), two scenes each, labels from the
OSM API. Validation regions from v1 are untouched so scores compare with v3.

Usage: python ml/build_dataset_v4.py [out_dir]
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import build_dataset as b  # noqa: E402
import build_dataset_v3 as v3  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
v3.OUT = OUT


def brasov_regions():
    out = {}
    k = 0
    for lat in np.arange(45.36, 45.84, 0.09):
        for lng in np.arange(25.18, 25.95, 0.09):
            out[f"bv{k:02d}"] = (round(float(lng), 3), round(float(lat), 3))
            k += 1
    return out


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    regions = list(v3.grid_regions().items())[130:260] + list(brasov_regions().items())
    print(f"{len(regions)} new regions", flush=True)
    t0 = time.time()
    with ThreadPoolExecutor(4) as ex:
        for name, msg in ex.map(v3.safe, regions):
            print(f"{name:8s} {msg}  [{time.time() - t0:.0f}s]", flush=True)
