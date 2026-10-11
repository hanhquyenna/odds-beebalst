"""
How many people apply on one site to a posting like this one: a prior per field, level and employer size, learned from our own LinkedIn readings
(research-data/pile-prior/counts.csv, from scripts/research/export_pile_counts.ts).

The reading is censored: "Be among the first 25 applicants" means fewer than 25, "Over 200 applicants" means at least 200. A lognormal on the log
count with a ridge-penalised mean (field + level + employer tier + log age) is fitted by interval-censored maximum likelihood. The ridge strength
is picked by 5-fold cross-validated log-likelihood, and the result is compared with a pooled mean so a field that has few postings borrows from the rest.
Writes src/lib/pile-prior.json: per-feature effects, sigma, and the cross-validation numbers. Run with research-data/.venv/bin/python.
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import minimize
from scipy.special import log_ndtr
from scipy.stats import norm

df = pd.read_csv("research-data/pile-prior/counts.csv")
df["family"] = df["family"].fillna("").replace("", "Unknown")
df["age"] = df["age_days"].fillna(df["age_days"].median()).clip(0, 60)
df["logage"] = np.log1p(df["age"])
levels = sorted(df["level"].unique())
fams = sorted(df["family"].unique())
tiers = sorted(df["tier"].unique())

def design(d):
    cols = [np.ones(len(d)), d["logage"].values]
    names = ["intercept", "logage"]
    for f in fams: cols.append((d["family"] == f).values.astype(float)); names.append("family:" + f)
    for l in levels: cols.append((d["level"] == l).values.astype(float)); names.append("level:" + l)
    for t in tiers: cols.append((d["tier"] == t).values.astype(float)); names.append("tier:" + t)
    return np.column_stack(cols), names

def nll(theta, X, kind, y, lam):
    beta, logsig = theta[:-1], theta[-1]
    sig = np.exp(logsig)
    mu = X @ beta
    ly = np.log(y)
    ll = np.where(kind == "exact", norm.logpdf(ly, mu, sig) - np.log(y),
         np.where(kind == "lt", log_ndtr((np.log(25) - mu) / sig),
                  log_ndtr(-(np.log(200) - mu) / sig)))
    pen = lam * np.sum(beta[2:] ** 2)  # intercept and age slope are free
    return -ll.sum() + pen

def fit(d, lam):
    X, _ = design(d)
    th0 = np.zeros(X.shape[1] + 1); th0[0] = np.log(40); th0[-1] = 0.0
    r = minimize(nll, th0, args=(X, d["kind"].values, d["count"].values.astype(float), lam), method="L-BFGS-B")
    return r.x

def heldout(theta, d):
    X, _ = design(d)
    beta, sig = theta[:-1], np.exp(theta[-1])
    mu = X @ beta; y = d["count"].values.astype(float); kind = d["kind"].values
    ly = np.log(y)
    ll = np.where(kind == "exact", norm.logpdf(ly, mu, sig) - np.log(y),
         np.where(kind == "lt", log_ndtr((np.log(25) - mu) / sig), log_ndtr(-(np.log(200) - mu) / sig)))
    return ll.sum()

rng = np.random.default_rng(1)
idx = rng.permutation(len(df)); folds = np.array_split(idx, 5)
print("rows", len(df), df["kind"].value_counts().to_dict())
best = None
for lam in [0.3, 1, 3, 10, 30, 1000]:
    tot = 0
    for k in range(5):
        test = df.iloc[folds[k]]; train = df.drop(df.index[folds[k]])
        tot += heldout(fit(train, lam), test)
    print(f"lambda {lam:7}: held-out log-lik {tot:9.1f}")
    if best is None or tot > best[1]: best = (lam, tot)
# the pooled model is the lambda -> infinity limit
lam = best[0]
theta = fit(df, lam)
_, names = design(df)
eff = dict(zip(names, np.round(theta[:-1], 3)))
sigma = float(np.exp(theta[-1]))
print("lambda", lam, "sigma", round(sigma, 2))
for n, v in eff.items(): print(f"{n:42s} {v:7.3f}")
out = {"lambda": lam, "sigma": round(sigma, 3), "effects": {k: float(v) for k, v in eff.items()},
       "cv": {"chosen": lam, "heldout_loglik": round(best[1], 1), "pooled_loglik": None}}
# pooled reference
tot = 0
for k in range(5):
    test = df.iloc[folds[k]]; train = df.drop(df.index[folds[k]])
    tot += heldout(fit(train, 1e6), test)
out["cv"]["pooled_loglik"] = round(tot, 1)
print("pooled held-out log-lik", round(tot, 1), " learned", round(best[1], 1))
json.dump(out, open("src/lib/pile-prior.json", "w"), indent=1)
