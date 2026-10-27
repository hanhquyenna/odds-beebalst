"""Is the engine's additive probit leaving anything on the table? Five models on the same rows, the same held-out sets.

Rows: research-data/backtest/parts.jsonl (GEMM 5 countries, Oreopoulos, Sweden) + more-data/more_parts.jsonl (Eriksson-Rooth, Bertrand-
Mullainathan white names) + more-data/swiss_parts.jsonl (Swiss test). Each row: the engine's parts (study values per factor) and the outcome.

Models (all get a free level per group = dataset x occupation, which is the job side the engine sets from the pile):
  engine     sum(part x shipped multiplier)                        no fitting of the strength side
  probit     sum(part x free coefficient)                          what learn.py does, without its prior
  interact   logistic on the parts and all their pairwise products the interactions the engine assumes away
  gbm        histogram gradient boosting on the parts (+ group)    any non-linearity and interaction
  mlp        neural network, 2 hidden layers (32, 16), early stop  the "deep learning" check
Scored by within-group AUC (the ranking the engine is responsible for; group levels cancel), log loss and calibration slope.

Held-out designs:
  given    the export's own train / test split
  nl       every GEMM Netherlands row held out: nothing Dutch is trained on (the product's case)
  lodo     each dataset family held out in turn

  research-data/.venv/bin/python scripts/research/model_compare.py
Writes research-data/backtest/model_compare.csv.
"""
import json, os, re, sys, warnings, functools
print = functools.partial(print, flush=True)
import numpy as np, pandas as pd
from scipy.stats import norm
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import OneHotEncoder, PolynomialFeatures, StandardScaler
import statsmodels.api as sm

warnings.filterwarnings("ignore")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
RD = os.path.join(ROOT, "research-data")
frames = [pd.read_json(os.path.join(RD, p), lines=True) for p in ("backtest/parts.jsonl", "more-data/more_parts.jsonl", "more-data/swiss_parts.jsonl") if os.path.exists(os.path.join(RD, p))]
d = pd.concat(frames, ignore_index=True)
P = pd.json_normalize(d.parts).fillna(0.0)
KEYS = list(P.columns)
X = P.values
y = d.y.values.astype(int)
fam = d.ds.str.replace(r"_(Netherlands|Germany|Spain|Norway|UK)$", "", regex=True).str.replace(r"^gemm.*", "gemm", regex=True)
d["family"] = fam
d["grp"] = np.where(d.ds == "oreopoulos", d.job.fillna(-1).astype(int).astype(str) + "|" + d.group, d.group)

src = open(os.path.join(ROOT, "src/lib/odds-v2.ts")).read()
block = src[src.index("export const LEARNED"):]
block = block[: block.index("}")]
SHIP = {k: float(v) for k, v in re.findall(r"(\w+): ([0-9.]+)", block)}
M_SHIP = np.array([SHIP.get(k, 1.0) for k in KEYS])
print(f"{len(d):,} rows, {d.ds.nunique()} datasets, parts: {', '.join(KEYS)}")


def within_auc(score, yy, grp):
    """Share of (interviewed, not interviewed) pairs within the same group that the score orders right; ties count half.
    Mann-Whitney per group from ranks, so it is exact and fast."""
    from scipy.stats import rankdata
    df = pd.DataFrame({"s": score, "y": yy, "g": grp})
    win = tot = 0.0
    for _, t in df.groupby("g", sort=False):
        npos = int(t.y.sum()); nneg = len(t) - npos
        if npos == 0 or nneg == 0:
            continue
        r = rankdata(t.s.values)
        win += r[t.y.values == 1].sum() - npos * (npos + 1) / 2
        tot += npos * nneg
    return win / tot if tot else np.nan


def logloss(p, yy):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(yy * np.log(p) + (1 - yy) * np.log(1 - p)))


def calib_slope(p, yy):
    z = norm.ppf(np.clip(p, 1e-6, 1 - 1e-6))
    if np.ptp(z) < 1e-9:
        return np.nan
    try:
        return float(sm.GLM(yy, sm.add_constant(z), family=sm.families.Binomial(link=sm.families.links.Probit())).fit().params[1])
    except Exception:
        return np.nan


def group_levels(score, tr, te_groups, grp):
    """The job-side level per group: probit offset fitted on training rows of the group; unseen groups get it from a 20% slice of their own rows
    (the 'first local data' fix learn.py uses for Norway), so every model is compared with the same job-side information."""
    lev = {}
    for g in np.unique(grp):
        r = tr & (grp == g)
        if r.sum() >= 5 and 0 < y[r].mean() < 1:
            lev[g] = norm.ppf(np.clip(y[r].mean(), 0.005, 0.995)) - score[r].mean()
    return lev


def evaluate(name, score, p, te, grp):
    out = {}
    for ds in sorted(d.ds[te].unique()):
        s = te & (d.ds == ds).values
        out[ds] = {"model": name, "dataset": ds, "n": int(s.sum()), "auc": within_auc(score[s], y[s], grp[s]), "logloss": logloss(p[s], y[s]), "slope": calib_slope(p[s], y[s])}
    s = te
    out["ALL"] = {"model": name, "dataset": "ALL held out", "n": int(s.sum()), "auc": within_auc(score[s], y[s], grp[s]), "logloss": logloss(p[s], y[s]), "slope": calib_slope(p[s], y[s])}
    return list(out.values())


def run(design, tr, te):
    grp = d.grp.values
    # Unseen groups: 20% of their rows set the level (never the weights), the rest is scored.
    rng = np.random.default_rng(7)
    seen = set(grp[tr])
    slice_rows = te & ~np.isin(grp, list(seen)) & (rng.random(len(d)) < 0.2)
    te = te & ~slice_rows
    lev_rows = tr | slice_rows
    oh = OneHotEncoder(handle_unknown="ignore", sparse_output=False).fit(grp[lev_rows].reshape(-1, 1))
    Gm = oh.transform(grp.reshape(-1, 1))
    res = []

    def with_levels(score):
        lev = group_levels(score, lev_rows, None, grp)
        base = np.array([lev.get(g, norm.ppf(np.clip(y[lev_rows].mean(), .005, .995)) - score[lev_rows].mean()) for g in grp])
        return norm.cdf(score + base)

    # 1. engine as shipped
    s_eng = X @ M_SHIP
    res += evaluate("engine (shipped)", s_eng, with_levels(s_eng), te, grp)
    # 2. free coefficients on the same parts + group dummies (logistic, lightly regularised; fitted on training rows only)
    lrf = LogisticRegression(C=10.0, max_iter=5000).fit(np.hstack([X[tr], Gm[tr]]), y[tr])
    coef = lrf.coef_[0][: X.shape[1]] * 0.6   # logit to probit scale
    s_pr = X @ coef
    res += evaluate("free coefficients", s_pr, with_levels(s_pr), te, grp)
    # 3. logistic with pairwise interactions
    poly = PolynomialFeatures(2, interaction_only=True, include_bias=False).fit(X[tr])
    XI = poly.transform(X)
    sc = StandardScaler().fit(XI[tr])
    lr = LogisticRegression(C=1.0, max_iter=3000).fit(np.hstack([sc.transform(XI[tr]), Gm[tr]]), y[tr])
    s_int = sc.transform(XI) @ lr.coef_[0][: XI.shape[1]]
    res += evaluate("logistic + interactions", s_int, with_levels(s_int * 0.6), te, grp)  # 0.6: logit to probit scale
    # 4. gradient boosting on parts (+ group level added the same way afterwards)
    gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, early_stopping=True, random_state=1)
    gb.fit(np.hstack([X[tr], Gm[tr]]), y[tr])
    # strength score = the model's log-odds with every group dummy at zero (the group side is set by with_levels, as for the others)
    s_gb = gb.decision_function(np.hstack([X, np.zeros_like(Gm)]))
    res += evaluate("gradient boosting", s_gb, with_levels(s_gb * 0.6), te, grp)
    # 5. neural network
    scx = StandardScaler().fit(X[tr])
    mlp = MLPClassifier(hidden_layer_sizes=(32, 16), alpha=1e-3, early_stopping=True, max_iter=400, random_state=1)
    mlp.fit(np.hstack([scx.transform(X[tr]), Gm[tr]]), y[tr])
    pz = np.clip(mlp.predict_proba(np.hstack([scx.transform(X), np.zeros_like(Gm)]))[:, 1], 1e-6, 1 - 1e-6)
    s_mlp = np.log(pz / (1 - pz))
    res += evaluate("neural network (MLP)", s_mlp, with_levels(s_mlp * 0.6), te, grp)
    for r in res:
        r["design"] = design
    return res, coef


all_rows = []
# given split
tr = (d.split == "train").values
te = (d.split == "test").values | (d.split == "external").values
r, coef = run("given split", tr, te)
all_rows += r
if coef is not None:
    print("\nFree probit coefficient per part (training rows) vs shipped multiplier (both on the study value):")
    for k, c, m in zip(KEYS, coef, M_SHIP):
        print(f"  {k:24s} free {c:6.2f}   shipped {m:5.2f}")
# Netherlands held out entirely
nl = (d.ds == "gemm_Netherlands").values
r, _ = run("NL held out", (~nl) & (d.split != "external").values, nl)
all_rows += r
# leave one family out
for f in sorted(d.family.unique()):
    out = (d.family == f).values
    r, _ = run(f"lodo {f}", ~out & (d.split != "external").values, out)
    all_rows += [x for x in r if x["dataset"] == "ALL held out"]

res = pd.DataFrame(all_rows)
res.to_csv(os.path.join(RD, "backtest/model_compare.csv"), index=False)
pd.set_option("display.width", 220)
for design in res.design.unique():
    t = res[res.design == design]
    t = t[t.dataset.isin(["ALL held out", "gemm_Netherlands"]) | (design == "given split")]
    print(f"\n== {design}")
    print(t.pivot_table(index="dataset", columns="model", values="auc").round(4).to_string())
    if design in ("given split", "NL held out"):
        print("log loss:")
        print(t.pivot_table(index="dataset", columns="model", values="logloss").round(4).to_string())
        print("calibration slope:")
        print(t.pivot_table(index="dataset", columns="model", values="slope").round(2).to_string())
