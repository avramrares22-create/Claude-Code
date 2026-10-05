"""
TrailNet: a small U-Net that finds trails, tracks and roads in 10 m Sentinel-2
imagery. Trained on OpenStreetMap labels; exported to ONNX for on-device
inference in the browser (onnxruntime-web).

OSM is incomplete, so "unlabelled" ≠ "not a trail": negatives get a lower
weight and sparsely mapped regions are left out of training entirely.

Experiment (TRAILNET_HEADS=2): a second waterway head that teaches mapped
streams as confident negatives. On held-out regions it did not reduce
stream→trail confusion (16.9% vs 16.3%) — Carpathian forest roads often follow
streams — so the shipped model is the single-head v1 (the default).

Usage:  python ml/train_trailnet.py [data_dir] [out_dir] [epochs]
"""

import glob
import json
import os
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

DATA = sys.argv[1] if len(sys.argv) > 1 else "ml/data"
OUT = sys.argv[2] if len(sys.argv) > 2 else "ml/out"
EPOCHS = int(sys.argv[3]) if len(sys.argv) > 3 else 40
VAL = {"retezat", "rarau", "padis", "tarnave", "macin"}
MIN_LABEL_DENSITY = 0.009  # below this a region is too under-mapped to trust its negatives
CHIP = 96
BATCH = 16
STEPS = int(os.environ.get("TRAILNET_STEPS", "150"))
NEG_WEIGHT = 0.5
HEADS = int(os.environ.get("TRAILNET_HEADS", "1"))
# v5 "learn from mistakes": tiles the model gets wrong are drawn again and again
# (sampling ∝ running loss) until it gets them right, and a mapped trail pixel
# it misses costs up to 1 + MISS_PENALTY times more the more confidently it missed.
HARD = os.environ.get("TRAILNET_HARD", "0") == "1"
MISS_PENALTY = float(os.environ.get("TRAILNET_MISS_PENALTY", "8"))
WIDTH = tuple(int(c) for c in os.environ.get("TRAILNET_WIDTH", "16,32,64,96").split(","))
torch.manual_seed(0)
np.random.seed(0)


def normalize(dn: np.ndarray) -> np.ndarray:
    """Must match src/engine/detect/trailnet.ts: C1 L2A reflectance, centred on ~0.15."""
    r = np.clip(dn.astype(np.float32) * 1e-4 - 0.1, 0, 0.5)
    return r / 0.25 - 1


def load():
    train, val, skipped = [], [], []
    for f in sorted(glob.glob(os.path.join(DATA, "*.npz"))):
        name = os.path.basename(f)[:-4]
        d = np.load(f)
        x = normalize(d["img"])
        y = d["label"].astype(np.float32)
        v = d["valid"].astype(np.float32)
        wk = float(d["water_known"]) if "water_known" in d else 0.0
        water = d["water"].astype(np.float32) if "water" in d else np.zeros_like(y)
        # Water channel: 1 = stream, 0 = not; -1 = unknown (ignored by the loss).
        wl = np.where(wk > 0, water * (1 - y), -1).astype(np.float32)
        if min(y.shape) < CHIP:
            skipped.append(name)
            continue
        item = (name, x, y, v, wl)
        if name in VAL:
            val.append(item)
        elif y.mean() < MIN_LABEL_DENSITY:
            skipped.append(name)
        else:
            train.append(item)
    return train, val, skipped


def conv(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))


class TrailNet(nn.Module):
    def __init__(self, c=WIDTH, heads=HEADS):
        super().__init__()
        self.e1 = nn.Sequential(conv(4, c[0]), conv(c[0], c[0]))
        self.e2 = nn.Sequential(conv(c[0], c[1]), conv(c[1], c[1]))
        self.e3 = nn.Sequential(conv(c[1], c[2]), conv(c[2], c[2]))
        self.b = nn.Sequential(conv(c[2], c[3]), conv(c[3], c[3]))
        self.d3 = nn.Sequential(conv(c[3] + c[2], c[2]), conv(c[2], c[2]))
        self.d2 = nn.Sequential(conv(c[2] + c[1], c[1]), conv(c[1], c[1]))
        self.d1 = nn.Sequential(conv(c[1] + c[0], c[0]), conv(c[0], c[0]))
        self.head = nn.Conv2d(c[0], heads, 1)

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(F.max_pool2d(e1, 2))
        e3 = self.e3(F.max_pool2d(e2, 2))
        b = self.b(F.max_pool2d(e3, 2))
        up = lambda t, ref: F.interpolate(t, size=ref.shape[-2:], mode="bilinear", align_corners=False)
        d3 = self.d3(torch.cat([up(b, e3), e3], 1))
        d2 = self.d2(torch.cat([up(d3, e2), e2], 1))
        d1 = self.d1(torch.cat([up(d2, e1), e1], 1))
        return self.head(d1)


def sample_batch(items, probs=None):
    xs, ys, vs, ws = [], [], [], []
    idx = np.random.choice(len(items), BATCH, p=probs) if probs is not None else np.random.randint(len(items), size=BATCH)
    sample_batch.idx = idx
    for n in idx:
        _, x, y, v, wl = items[n]
        H, W = y.shape
        # Bias crops towards labelled areas so batches aren't mostly empty.
        for _try in range(5):
            i, j = np.random.randint(H - CHIP + 1), np.random.randint(W - CHIP + 1)
            if y[i : i + CHIP, j : j + CHIP].mean() > 0.005:
                break
        cx, cy, cv = x[:, i : i + CHIP, j : j + CHIP], y[i : i + CHIP, j : j + CHIP], v[i : i + CHIP, j : j + CHIP]
        cw = wl[i : i + CHIP, j : j + CHIP]
        k = np.random.randint(4)
        cx, cy, cv, cw = np.rot90(cx, k, (1, 2)), np.rot90(cy, k), np.rot90(cv, k), np.rot90(cw, k)
        if np.random.rand() < 0.5:
            cx, cy, cv, cw = cx[:, :, ::-1], cy[:, ::-1], cv[:, ::-1], cw[:, ::-1]
        # Radiometric jitter: scenes differ in sun angle, haze and season.
        cx = cx * np.random.uniform(0.9, 1.1) + np.random.uniform(-0.08, 0.08)
        xs.append(cx.copy())
        ys.append(cy.copy())
        vs.append(cv.copy())
        ws.append(cw.copy())
    t = lambda a: torch.from_numpy(np.stack(a)).float()
    return t(xs), t(ys)[:, None], t(vs)[:, None], t(ws)[:, None]


def loss_fn(out, y, v, wl, per_sample=False):
    trail = out[:, :1]
    if out.shape[1] == 1:
        # v1: trail head only; streams are ordinary (weak) negatives.
        w = v * torch.where(y > 0, torch.ones_like(y), torch.full_like(y, NEG_WEIGHT))
        if HARD:
            # Missed trail pixels: penalty grows with how confidently the model said "no trail".
            with torch.no_grad():
                miss = (1 - torch.sigmoid(trail)) ** 2
            w = w * torch.where(y > 0, 1 + MISS_PENALTY * miss, torch.ones_like(y))
        bce_px = F.binary_cross_entropy_with_logits(trail, y, weight=w, pos_weight=torch.tensor(3.0), reduction="none")
        p = torch.sigmoid(trail) * v
        dims = (1, 2, 3)
        dice = 1 - (2 * (p * y).sum(dims) + 1) / (p.sum(dims) + (y * v).sum(dims) + 1)
        each = bce_px.mean(dims) + 0.5 * dice
        return (each.mean(), each.detach()) if per_sample else each.mean()
    water = out[:, 1:2]
    is_stream = (wl > 0).float()
    # Unlabelled pixels are weak negatives (OSM is incomplete); mapped streams are strong ones.
    neg_w = torch.where(is_stream > 0, torch.ones_like(y), torch.full_like(y, NEG_WEIGHT))
    w = v * torch.where(y > 0, torch.ones_like(y), neg_w)
    bce = F.binary_cross_entropy_with_logits(trail, y, weight=w, pos_weight=torch.tensor(3.0))
    p = torch.sigmoid(trail) * v
    dice = 1 - (2 * (p * y).sum() + 1) / (p.sum() + (y * v).sum() + 1)
    known = (wl >= 0).float() * v
    ww = known * torch.where(wl > 0, torch.ones_like(wl), torch.full_like(wl, 0.3))
    water_bce = F.binary_cross_entropy_with_logits(water, wl.clamp(min=0), weight=ww, pos_weight=torch.tensor(3.0))
    return bce + 0.5 * dice + 0.5 * water_bce


@torch.no_grad()
def evaluate(model, items, thr=0.5, tol=2):
    """Precision/recall with a ±tol px tolerance (line labels are ~2 px wide)."""
    model.eval()
    tp_p = fp = tp_r = fn = 0
    stream_px = stream_fp = 0
    for _, x, y, v, wl in items:
        H, W = y.shape
        H8, W8 = H - H % 8, W - W % 8
        logits = model(torch.from_numpy(x[None, :, :H8, :W8]).float())[0, 0].numpy()
        stream = wl[:H8, :W8] > 0
        pred = (1 / (1 + np.exp(-logits))) > thr
        yy, vv = y[:H8, :W8] > 0, v[:H8, :W8] > 0
        pool = lambda m: F.max_pool2d(torch.from_numpy(m[None, None].astype(np.float32)), 2 * tol + 1, 1, tol)[0, 0].numpy() > 0
        y_d, p_d = pool(yy), pool(pred)
        tp_p += (pred & y_d & vv).sum()
        fp += (pred & ~y_d & vv).sum()
        tp_r += (yy & p_d & vv).sum()
        fn += (yy & ~p_d & vv).sum()
        # Stream confusion: mapped stream pixels (away from any trail) predicted as trail.
        s_only = stream & ~y_d & vv
        stream_px += s_only.sum()
        stream_fp += (pred & s_only).sum()
    model.train()
    prec = tp_p / max(1, tp_p + fp)
    rec = tp_r / max(1, tp_r + fn)
    evaluate.stream_fp_rate = stream_fp / max(1, stream_px)
    return prec, rec, 2 * prec * rec / max(1e-9, prec + rec)


def main():
    os.makedirs(OUT, exist_ok=True)
    train, val, skipped = load()
    print(f"train {len(train)} regions, val {len(val)}, skipped (under-mapped) {skipped}", flush=True)
    model = TrailNet()
    print("params", sum(p.numel() for p in model.parameters()), flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=EPOCHS * STEPS)
    best, history = -1.0, []
    hard = np.ones(len(train))  # running loss per tile
    for ep in range(EPOCHS):
        t0, tot = time.time(), 0.0
        for _ in range(STEPS):
            probs = None
            if HARD and ep >= 2:  # a couple of plain epochs first, then chase the mistakes
                w = hard ** 1.5
                probs = 0.7 * w / w.sum() + 0.3 / len(train)
            x, y, v, wl = sample_batch(train, probs)
            if HARD and HEADS == 1:
                loss, each = loss_fn(model(x), y, v, wl, per_sample=True)
                for n, l in zip(sample_batch.idx, each.numpy()):
                    hard[n] = 0.7 * hard[n] + 0.3 * float(l)
            else:
                loss = loss_fn(model(x), y, v, wl)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item()
        prec, rec, f1 = evaluate(model, val)
        sfp = evaluate.stream_fp_rate
        history.append({"epoch": ep + 1, "loss": tot / STEPS, "precision": prec, "recall": rec, "f1": f1, "stream_fp": sfp})
        hint = f"  hardest tiles {', '.join(train[n][0] for n in np.argsort(-hard)[:3])}" if HARD else ""
        print(f"ep {ep + 1:3d} loss {tot / STEPS:.4f}  val P {prec:.3f} R {rec:.3f} F1 {f1:.3f} streams→trail {sfp:.3f}  {time.time() - t0:.0f}s{hint}", flush=True)
        if f1 > best:
            best = f1
            torch.save(model.state_dict(), os.path.join(OUT, "trailnet.pt"))
    model.load_state_dict(torch.load(os.path.join(OUT, "trailnet.pt")))
    model.eval()
    # Pick the threshold that maximises validation F1 for the app to use.
    sweep = {}
    for t in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7):
        sweep[t] = (*evaluate(model, val, t), evaluate.stream_fp_rate)
    thr = max(sweep, key=lambda t: sweep[t][2])
    report = {
        "best_f1": float(sweep[thr][2]), "precision": float(sweep[thr][0]), "recall": float(sweep[thr][1]),
        "sweep": {str(t): [float(x) for x in v] for t, v in sweep.items()},
        "threshold": thr, "val_regions": sorted(VAL), "train_regions": [n for n, *_ in train],
        "history": [{k: float(v) for k, v in h.items()} for h in history],
    }
    json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
    print("threshold sweep", {t: tuple(round(float(x), 3) for x in s) for t, s in sweep.items()}, flush=True)
    torch.onnx.export(
        model, torch.zeros(1, 4, 128, 128), os.path.join(OUT, "trailnet.onnx"),
        input_names=["image"], output_names=["logits"], opset_version=17,
        dynamic_axes={"image": {2: "h", 3: "w"}, "logits": {2: "h", 3: "w"}}, dynamo=False,
    )
    print("exported", os.path.getsize(os.path.join(OUT, "trailnet.onnx")), "bytes", flush=True)


if __name__ == "__main__":
    main()
