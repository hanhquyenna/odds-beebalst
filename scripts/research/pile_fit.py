"""The pile model that goes into the app: a ridge regression of log(projected LinkedIn count) on what the app knows about a posting when it
works out a chance (title, level, line of work, the employer's industry, kind of job, where it is done, city, the site it came from, years
and degree asked, the employer's tier read from its name). Cross-validated by employer. Writes src/lib/pile-model.json.

The model gives the SHAPE of the pile (which postings draw more people than others), not its level: LinkedIn shows a count only on one site,
often as a bound ("first 25", "over 200") and early in a posting's life, so the absolute level of these counts cannot be trusted. The app
keeps the level it had (a geometric mean of ANCHOR applicants) and moves each posting up or down by what this model says.

  research-data/.venv/bin/python scripts/research/pile_fit.py
"""
import json, os, re, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import GroupKFold

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
d = pd.read_json(os.path.join(ROOT, "research-data/pile/pile_rows.jsonl"), lines=True)
d = d[d.projected > 0].reset_index(drop=True)
y = np.log(d.projected.values.astype(float))

def city(r):
    return str(r or "").split(",")[0].strip().lower()
d["city"] = d.region.map(city)
TOP_CITY = list(d.city.value_counts().index[:12])
d["city"] = np.where(d.city.isin(TOP_CITY), d.city, "other")
d["intern"] = d.title.fillna("").str.contains(r"intern|stage|stagiair", case=False).astype(int)
d["years"] = d.years_min.fillna(-1).clip(-1, 8)
d["pay"] = d.pay_stated.fillna(False).astype(int)
d["sponsor"] = d.ind_sponsor.fillna(False).astype(int)
TOP_IND = list(d.industry.fillna("none").value_counts().index[:18])
d["industry"] = np.where(d.industry.fillna("none").isin(TOP_IND), d.industry.fillna("none"), "other")
for c in ["level_view", "family", "workplace", "job_type", "ats", "degree_asked", "tier"]:
    d[c] = d[c].fillna("none").astype(str)
NUM = ["intern", "years", "pay", "sponsor"]
# "ats" (the site a posting came from) is left out: every count is a LinkedIn one, so it would only teach the model where the data came from.
CAT = ["level_view", "family", "industry", "workplace", "job_type", "degree_asked", "tier", "city"]
TIER_RAW = d.tier.copy()
# Rare values are folded into "other" so that every value in the table was seen enough times.
VOCAB = {}
for c in CAT:
    vc = d[c].value_counts()
    keep = list(vc[vc >= 12].index)
    VOCAB[c] = keep
    d[c] = np.where(d[c].isin(keep), d[c], "other")
cols = []
X = pd.DataFrame(index=d.index)
mu = {n: float(d[n].mean()) for n in NUM}; sd = {n: float(d[n].std() or 1.0) for n in NUM}
for n in NUM:
    X[n] = (d[n] - mu[n]) / sd[n]
for c in CAT:
    # A missing value ("none") is the baseline, not a group of its own: a posting that was not read for this field is not a kind of posting.
    for v in sorted(set(d[c]) - {"none"}):
        X[f"{c}={v}"] = (d[c] == v).astype(float)
groups = d.employer.values

alphas = np.logspace(0, 3, 25)
pred = np.zeros(len(d))
for tr, te in GroupKFold(5).split(X, y, groups):
    m = RidgeCV(alphas=alphas).fit(X.iloc[tr], y[tr]); pred[te] = m.predict(X.iloc[te])
base = np.zeros(len(d))
for tr, te in GroupKFold(5).split(X, y, groups):
    base[te] = np.median(y[tr])
tierc = np.log(TIER_RAW.map({"elite": 600, "large": 220, "mid": 150, "small": 60, "unknown": 180}).values)
ex = (d.censor == "exact").values
def line(name, p):  # error on exact counts only; rank on exact counts only
    e = np.abs(p[ex] - y[ex])
    rho = spearmanr(p[ex], y[ex]).correlation
    print(f"  {name:38s} MAE log {e.mean():.3f}  typical factor off x{np.exp(np.median(e)):.2f}  Spearman {rho:+.3f}")
print(f"{len(d)} postings, {d.employer.nunique()} employers, {int(ex.sum())} exact counts; cross-validated by employer")
line("one number", base); line("the tier constants the engine has", tierc); line("ridge on what the app knows", pred)
m = RidgeCV(alphas=alphas).fit(X, y)
print("alpha", round(float(m.alpha_), 1))
coef = pd.Series(m.coef_, index=X.columns)
print("largest effects (log pile):"); print(coef.reindex(coef.abs().sort_values(ascending=False).index).head(14).round(3).to_string())
fitted = m.predict(X)
out = {"intercept": float(m.intercept_), "numeric": {n: {"mean": mu[n], "sd": sd[n], "coef": float(coef[n])} for n in NUM},
       "categorical": {c: {v: float(coef[f"{c}={v}"]) for v in sorted(set(d[c]) - {"none"})} for c in CAT}, "vocab": VOCAB,
       "mean_fitted": float(np.mean(fitted)), "rows": int(len(d)), "employers": int(d.employer.nunique()), "cv_spearman": float(spearmanr(pred[ex], y[ex]).correlation)}
def rounded(x):
    if isinstance(x, float):
        return round(x, 3)
    if isinstance(x, dict):
        return {k: rounded(v) for k, v in x.items()}
    if isinstance(x, list):
        return [rounded(v) for v in x]
    return x
# Rounded to three decimals and written compactly: the file is part of the first page.
json.dump(rounded(out), open(os.path.join(ROOT, "src/lib/pile-model.json"), "w"), separators=(",", ":"), sort_keys=True)
print("wrote src/lib/pile-model.json")
