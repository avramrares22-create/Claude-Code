"""
Trains RankNet (src/engine/search/rankNet.ts): MLP features → 32 tanh → 1,
listwise softmax cross-entropy over each query's candidate list.
Input: JSONL from scripts/search/gen_ranker.ts.

  python ml/search/train_ranker.py /tmp/claude-0/search/rank.jsonl src/engine/search/ranknet.weights.json
"""
import json
import sys
import time

import numpy as np

H = 32
EPOCHS = 30
LR = 0.01


def main(src, dst):
    rng = np.random.default_rng(3)
    lists = []
    for line in open(src):
        d = json.loads(line)
        lists.append((np.array(d["f"], np.float32), np.array(d["y"], np.float32), np.array(d["h"], np.float32)))
    rng.shuffle(lists)
    nval = len(lists) // 10
    val, train = lists[:nval], lists[nval:]
    allf = np.concatenate([f for f, _, _ in train])
    mean = allf.mean(0)
    std = allf.std(0) + 1e-6
    nf = allf.shape[1]
    # Category one-hots (last 36 features) would let the model learn the training sampler's
    # category mix instead of relevance; category fit already comes from QueryNet (catProb).
    keep = np.ones(nf, np.float32)
    keep[nf - 36 :] = 0
    mean = mean * keep
    std = np.where(keep > 0, std, 1.0).astype(np.float32)
    print(f"{len(train)} train lists, {len(val)} val, {nf} features, {len(allf)} candidates")

    W1 = (rng.standard_normal((H, nf)) * np.sqrt(1 / nf)).astype(np.float32)
    b1 = np.zeros(H, np.float32)
    W2 = (rng.standard_normal(H) * 0.01).astype(np.float32)  # start as "rules only"
    b2 = np.float32(0)
    a = np.array([1.0], np.float32)  # weight of the hand-set score
    params = [W1, b1, W2, a]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    step = 0

    def scores(X, h):
        Z = np.tanh(X @ W1.T + b1)
        return a[0] * h + Z @ W2 + b2, Z

    best = (-1, None)
    for ep in range(EPOCHS):
        t0 = time.time()
        order = rng.permutation(len(train))
        tot = 0.0
        for k in range(0, len(order), 64):
            gW1 = np.zeros_like(W1)
            gb1 = np.zeros_like(b1)
            gW2 = np.zeros_like(W2)
            ga = np.zeros_like(a)
            for i in order[k : k + 64]:
                F, y, h = train[i]
                X = (F - mean) / std * keep
                s, Z = scores(X, h)
                p = np.exp(s - s.max())
                p /= p.sum()
                tot -= float((y * np.log(p + 1e-12)).sum())
                ds = p - y  # d loss / d score
                gW2 += ds @ Z
                ga += ds @ h
                dZ = np.outer(ds, W2) * (1 - Z * Z)
                gW1 += dZ.T @ X
                gb1 += dZ.sum(0)
            step += 1
            for j, (p_, g) in enumerate(zip(params, (gW1, gb1, gW2, ga))):
                g = g / 64 + (3e-3 * p_ if j in (0, 2) else 0)
                m[j] = 0.9 * m[j] + 0.1 * g
                v[j] = 0.999 * v[j] + 0.001 * g * g
                mh = m[j] / (1 - 0.9**step)
                vh = v[j] / (1 - 0.999**step)
                p_ -= LR * mh / (np.sqrt(vh) + 1e-8)
        top1, top3, mrr = evaluate(val, lambda X, h: scores(X * keep, h), mean, std)
        print(f"epoch {ep + 1}: loss {tot / len(train):.4f}  val top1 {top1:.4f} top3 {top3:.4f} MRR {mrr:.4f} ({time.time() - t0:.0f}s)")
        if top1 > best[0]:
            best = (top1, (W1.copy(), b1.copy(), W2.copy(), float(b2), float(a[0])))
    W1b, b1b, W2b, b2b, ab = best[1]
    h1, h3, hm = evaluate(val, lambda X, h: (h, None), mean, std)
    print(f"rules only on the same val: top1 {h1:.4f} top3 {h3:.4f} MRR {hm:.4f}")
    out = {
        "mean": [round(float(x), 6) for x in mean],
        "std": [round(float(x), 6) for x in std],
        "W1": [round(float(x), 6) for x in (W1b * keep).ravel()],
        "b1": [round(float(x), 6) for x in b1b],
        "W2": [round(float(x), 6) for x in W2b],
        "b2": round(b2b, 6),
        "hScale": round(ab, 6),
        "report": {"trainLists": len(train), "valLists": len(val), "valTop1": round(best[0], 4)},
    }
    json.dump(out, open(dst, "w"), separators=(",", ":"))
    print("wrote", dst, "best val top1", round(best[0], 4))


def evaluate(val, scores, mean, std):
    top1 = top3 = mrr = 0.0
    for F, y, h in val:
        s, _ = scores((F - mean) / std, h)
        order = np.argsort(-s)
        pos = y > 0
        # For browse lists (soft labels) count the best-labelled item as "the" target.
        target = np.flatnonzero(y >= y.max() * 0.999) if not np.all(np.isin(y[pos], [y[pos].max()])) else np.flatnonzero(pos)
        rank = next(r for r, i in enumerate(order) if i in set(target))
        top1 += rank == 0
        top3 += rank < 3
        mrr += 1 / (rank + 1)
    n = len(val)
    return top1 / n, top3 / n, mrr / n


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
