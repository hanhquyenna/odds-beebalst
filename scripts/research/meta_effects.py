"""One number per engine part from every experiment that measured it: a random-effects meta-analysis (DerSimonian-Laird) of the
study estimates, all in probit units (the engine's scale), next to what the engine ships.

Only callback / invitation experiments enter the pooled value. Ratings of hypothetical candidates (Kessler, Paths2Include) are listed for
comparison but kept out of the pool: they measure what a reviewer says, not who gets called.

Sources of each estimate (all computed on this computer, scripts in scripts/research/):
  new_data_effects.py   Eriksson-Rooth, Bertrand-Mullainathan (within ad), Swiss check, Kline, Paths2Include, Kessler
  more_effects_2.py     GEMM NL full file (Thijssen), Phillips, Pan & Zhang, L'Horty
  deming_effects.py     Deming 2016
  shipped values        src/lib/odds-v2.ts EFFECTS x LEARNED (step at the stated base rate)

  research-data/.venv/bin/python scripts/research/meta_effects.py
"""
import numpy as np
from scipy.stats import norm


def step(odds_ratio, at):
    """The engine's step: probit(base x odds ratio) - probit(base), as odds-v2.ts step() does."""
    o = at / (1 - at) * odds_ratio
    return norm.ppf(o / (1 + o)) - norm.ppf(at)


SHIP = {
    "underqualified (vs fit)": step(0.53, 0.46) * 0.67,          # x (0.4 + 0.8 x how far short): -0.11 to -0.32
    "overqualified (vs fit)": step(0.85, 0.12) * 0.63,
    "non-EU / first-generation minority": step(0.66, 0.30) * 1.19,
    "years of experience, per year (first few)": 0.055,
    "elite / top school or employer (callbacks)": 0.06,
    "skills listed on the CV": 0.0,
    "grades / GPA stated": 0.0,
    "volunteering / extra-curricular": 0.0,
    "performance / warmth signals in the letter": 0.0,
}

# (study, estimate, se, kind) kind: "callback" enters the pool, "rating" is shown only
E = {
    "underqualified (vs fit)": [
        ("GEMM Netherlands, invitation (the engine's own source)", -0.338, 0.070, "callback"),
        ("GEMM other four countries: DE -0.003, ES -0.037, NO -0.056, UK -0.094 (pooled here)", -0.040, 0.040, "callback"),
        ("Swiss test, okay fit instead of good", -0.48, 0.08, "callback"),
    ],
    "overqualified (vs fit)": [
        ("GEMM all five countries, invitation (NL +0.031, se 0.061)", 0.084, 0.028, "callback"),
        ("Eriksson-Rooth, more education than required", -0.009, 0.036, "callback"),
        ("Swiss test, overqualified (186 rows, mapping assumed)", -0.22, 0.15, "callback"),
    ],
    "non-EU / first-generation minority": [
        ("GEMM NL full file, first generation", -0.310, 0.048, "callback"),
        ("Eriksson-Rooth, minority name", -0.378, 0.034, "callback"),
        ("Swiss test, minority name", -0.17, 0.03, "callback"),
        ("Paths2Include, Ukrainian (rating)", -0.336, 0.03, "rating"),
    ],
    "years of experience, per year (first few)": [
        ("Eriksson-Rooth, per year beyond 2 (cap 3)", 0.039, 0.015, "callback"),
        ("Phillips 2019, per year up to 5", 0.073, 0.041, "callback"),
        ("Bertrand-Mullainathan, per year within ad (+0.83 pp on 8%)", 0.054, 0.039, "callback"),
    ],
    "elite / top school or employer (callbacks)": [
        ("Pan & Zhang 2021, top-50 university", 0.123, 0.018, "callback"),
        ("Deming 2016, selective public school", -0.01, 0.07, "callback"),
        ("Oreopoulos, very large firm", 0.046, 0.04, "callback"),
        ("Kessler, top employer (rating)", 0.215, 0.027, "rating"),
    ],
    "skills listed on the CV": [
        ("Pan & Zhang, a programming skill (mean of 6)", 0.0, 0.009, "callback"),
        ("Bertrand-Mullainathan, special skills within ad", 0.030, 0.06, "callback"),
        ("GEMM NL full file, communication skills", 0.048, 0.043, "callback"),
        ("L'Horty, a skills line (indicative)", 0.017, 0.031, "callback"),
    ],
    "grades / GPA stated": [
        ("GEMM all five countries, good school grade", -0.018, 0.019, "callback"),
        ("Pan & Zhang, top-5% GPA rank", 0.014, 0.018, "callback"),
        ("Kessler, +1 GPA point (rating)", 0.438, 0.041, "rating"),
    ],
    "performance / warmth signals in the letter": [
        ("GEMM all five countries, praise from a former employer", 0.028, 0.019, "callback"),
        ("GEMM all five countries, warmth", 0.028, 0.019, "callback"),
    ],
    "volunteering / extra-curricular": [
        ("L'Horty, volunteering (indicative)", 0.052, 0.032, "callback"),
        ("L'Horty, extra-curricular (indicative)", 0.017, 0.039, "callback"),
    ],
}


def dersimonian_laird(b, se):
    b, v = np.asarray(b, float), np.asarray(se, float) ** 2
    w = 1 / v
    fixed = (w * b).sum() / w.sum()
    q = (w * (b - fixed) ** 2).sum()
    df = len(b) - 1
    c = w.sum() - (w ** 2).sum() / w.sum()
    tau2 = max(0.0, (q - df) / c) if df > 0 else 0.0
    ws = 1 / (v + tau2)
    mu = (ws * b).sum() / ws.sum()
    se_mu = np.sqrt(1 / ws.sum())
    i2 = max(0.0, (q - df) / q) if q > 0 and df > 0 else 0.0
    return mu, se_mu, np.sqrt(tau2), i2


print(f"{'part':46s} {'pooled':>8s} {'90% CI':>17s} {'tau':>6s} {'I2':>5s} {'ships':>7s}  verdict")
for part, rows in E.items():
    cb = [(s, b, se) for s, b, se, k in rows if k == "callback"]
    mu, se_mu, tau, i2 = dersimonian_laird([b for _, b, _ in cb], [se for _, _, se in cb])
    lo, hi = mu - 1.645 * np.sqrt(se_mu ** 2), mu + 1.645 * np.sqrt(se_mu ** 2)
    ship = SHIP.get(part)
    if ship is None:
        verdict = ""
    elif lo <= ship <= hi:
        verdict = "ships inside the 90% interval: keep"
    else:
        verdict = f"ships OUTSIDE the 90% interval ({'too low' if ship < lo else 'too high'})"
    print(f"{part:46s} {mu:+8.3f} [{lo:+.3f}, {hi:+.3f}] {tau:6.3f} {i2:5.0%} {ship:+7.3f}  {verdict}")
    for s, b, se, k in rows:
        print(f"    {'(rating) ' if k == 'rating' else ''}{s:62s} {b:+.3f} ({se:.3f})")
