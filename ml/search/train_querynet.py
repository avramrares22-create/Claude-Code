"""
Trains QueryNet (src/engine/search/queryNet.ts): a fastText-style model with a
shared hashed-feature embedding table, a per-word role head and a per-query
category head. Input: JSONL from scripts/search/gen_querynet.ts.

  python ml/search/train_querynet.py /tmp/claude-0/search/qn.jsonl src/engine/search/querynet.weights.json
"""
import base64
import json
import sys
import time

import numpy as np

B = 16384
D = 16
ROLES = 6
EPOCHS = 6
LR = 0.25
CAT_WEIGHT = 0.6


def load(path):
    ex = [json.loads(l) for l in open(path)]
    n_cats = max(e["c"] for e in ex) + 1
    return ex, max(n_cats, 37)


def batches(ex, bs, rng):
    idx = rng.permutation(len(ex))
    for i in range(0, len(idx), bs):
        yield [ex[j] for j in idx[i : i + bs]]


def pack(batch):
    F, owner, tok_ex, roles, cats, ntok = [], [], [], [], [], []
    t = 0
    for b, e in enumerate(batch):
        for fi, r in zip(e["f"], e["r"]):
            F.extend(fi)
            owner.extend([t] * len(fi))
            tok_ex.append(b)
            roles.append(r)
            t += 1
        cats.append(e["c"])
        ntok.append(len(e["r"]))
    return (np.array(F), np.array(owner), np.array(tok_ex), np.array(roles), np.array(cats), np.array(ntok, dtype=np.float32), t)


def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def forward(P, F, owner, tok_ex, ntok, T, nb):
    E, Wr, br, Wc, bc = P["E"], P["Wr"], P["br"], P["Wc"], P["bc"]
    cnt = np.bincount(owner, minlength=T).astype(np.float32)
    V = np.zeros((T, D), np.float32)
    np.add.at(V, owner, E[F])
    V /= cnt[:, None]
    S = np.zeros((nb, D), np.float32)
    np.add.at(S, tok_ex, V)
    S /= ntok[:, None]
    pr = softmax(V @ Wr.T + br)
    pc = softmax(S @ Wc.T + bc)
    return V, S, cnt, pr, pc


def main(src, dst):
    rng = np.random.default_rng(1)
    ex, C = load(src)
    rng.shuffle(ex)
    nval = len(ex) // 20
    val, train = ex[:nval], ex[nval:]
    P = {
        "E": (rng.standard_normal((B, D)) * 0.1).astype(np.float32),
        "Wr": (rng.standard_normal((ROLES, D)) * 0.1).astype(np.float32),
        "br": np.zeros(ROLES, np.float32),
        "Wc": (rng.standard_normal((C, D)) * 0.1).astype(np.float32),
        "bc": np.zeros(C, np.float32),
    }
    G = {k: np.full_like(v, 1e-6) for k, v in P.items()}  # Adagrad accumulators
    # Class balance for roles (names dominate).
    rc = np.bincount(np.concatenate([e["r"] for e in train]), minlength=ROLES).astype(np.float32)
    rw = (rc.sum() / (ROLES * np.maximum(rc, 1))) ** 0.5
    print("role counts", rc.astype(int).tolist(), "weights", np.round(rw, 2).tolist())
    for ep in range(EPOCHS):
        t0 = time.time()
        loss_sum = 0.0
        lr = LR * (1 - ep / EPOCHS * 0.7)
        for batch in batches(train, 256, rng):
            F, owner, tok_ex, roles, cats, ntok, T = pack(batch)
            nb = len(batch)
            V, S, cnt, pr, pc = forward(P, F, owner, tok_ex, ntok, T, nb)
            yr = np.zeros_like(pr)
            yr[np.arange(T), roles] = 1
            yc = np.zeros_like(pc)
            yc[np.arange(nb), cats] = 1
            w_tok = rw[roles][:, None]
            loss_sum += float(-(np.log(pr[np.arange(T), roles] + 1e-9) * rw[roles]).sum() - CAT_WEIGHT * np.log(pc[np.arange(nb), cats] + 1e-9).sum())
            dzr = (pr - yr) * w_tok
            dzc = (pc - yc) * CAT_WEIGHT
            gWr = dzr.T @ V
            gbr = dzr.sum(0)
            gWc = dzc.T @ S
            gbc = dzc.sum(0)
            dV = dzr @ P["Wr"]
            dS = dzc @ P["Wc"]
            dV += dS[tok_ex] / ntok[tok_ex][:, None]
            dV /= cnt[:, None]
            gE_rows = dV[owner]
            uniq, inv = np.unique(F, return_inverse=True)
            gE = np.zeros((len(uniq), D), np.float32)
            np.add.at(gE, inv, gE_rows)
            for k, g in (("Wr", gWr), ("br", gbr), ("Wc", gWc), ("bc", gbc)):
                G[k] += g * g
                P[k] -= lr * g / np.sqrt(G[k])
            G["E"][uniq] += gE * gE
            P["E"][uniq] -= lr * gE / np.sqrt(G["E"][uniq])
        acc_r, acc_c, acc_name = evaluate(P, val)
        print(f"epoch {ep + 1}: loss {loss_sum / len(train):.3f}  val role acc {acc_r:.4f}  cat acc {acc_c:.4f}  name-word recall {acc_name:.4f}  ({time.time() - t0:.0f}s)")

    scale = float(np.abs(P["E"]).max() / 127)
    q = np.clip(np.round(P["E"] / scale), -127, 127).astype(np.int8)
    acc_r, acc_c, acc_name = evaluate({**P, "E": q.astype(np.float32) * scale}, val)
    print(f"int8: role acc {acc_r:.4f}  cat acc {acc_c:.4f}  name-word recall {acc_name:.4f}")
    out = {
        "buckets": B, "dim": D, "emb": base64.b64encode(q.tobytes()).decode(), "scale": scale,
        "roleW": [round(float(v), 5) for v in P["Wr"].ravel()], "roleB": [round(float(v), 5) for v in P["br"]],
        "catW": [round(float(v), 5) for v in P["Wc"].ravel()], "catB": [round(float(v), 5) for v in P["bc"]],
        "report": {"examples": len(train), "valRoleAcc": round(acc_r, 4), "valCatAcc": round(acc_c, 4), "valNameRecall": round(acc_name, 4)},
    }
    json.dump(out, open(dst, "w"), separators=(",", ":"))
    print("wrote", dst)


def evaluate(P, val):
    F, owner, tok_ex, roles, cats, ntok, T = pack(val)
    _, _, _, pr, pc = forward(P, F, owner, tok_ex, ntok, T, len(val))
    pred = pr.argmax(1)
    name = roles == 0
    return float((pred == roles).mean()), float((pc.argmax(1) == cats).mean()), float((pred[name] == 0).mean())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
