"""Second batch of experiments, read on the engine's scale. Each effect is a within-vacancy (or within-cell) difference in callback /
invitation rate, from a linear probability model with the vacancy (or job cell) absorbed and errors clustered by it, then put on the
probit scale at the study's base rate: d_probit = d_p / phi(Phi^-1(base)). That is how the engine's parts are expressed.

  research-data/.venv/bin/python scripts/research/more_effects_2.py

Data (research-data/more-data/, git-ignored):
  Thijssen et al. / GEMM NL full file  studies/thijssen-2021-jimi-nl/NL_26112018.dta   Netherlands, 4,331 with an outcome
  Phillips 2019 (Washington DC)        sweep/phillips-commutes-dc-2019/phillips_jhr_cleandata.dta
  L'Horty et al. 2023 (France)         gaps/lhorty-2023-volunteering/data_year_2010/2012.sas7bdat
  Pan & Zhang 2021 (China)             gaps/pan-zhang-2021/ResumeAudit.tab
  Hollister (Canada)                   sweep/hollister-mobility-canada/data.dta
"""
import os, json, warnings
import numpy as np, pandas as pd
from scipy.stats import norm

warnings.filterwarnings("ignore")
RD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "research-data", "more-data")
OUT = []


def within(df, y, xs, cell):
    """Linear probability with the cell absorbed (demeaned), cluster-robust SEs by cell. Returns {x: (beta, se)} and the base rate."""
    df = df.dropna(subset=[y, cell] + xs).copy()
    keep = df.groupby(cell)[y].transform("count") >= 2
    df = df[keep]
    Y = df[y].astype(float).values
    X = df[xs].astype(float).values
    g = df[cell].astype(str).values
    Yd = Y - pd.Series(Y).groupby(g).transform("mean").values
    Xd = X - pd.DataFrame(X).groupby(g).transform("mean").values
    XtX = Xd.T @ Xd
    inv = np.linalg.pinv(XtX)
    b = inv @ Xd.T @ Yd
    e = Yd - Xd @ b
    meat = np.zeros_like(XtX)
    for cl in np.unique(g):
        m = g == cl
        s = Xd[m].T @ e[m]
        meat += np.outer(s, s)
    G = len(np.unique(g))
    V = inv @ meat @ inv * G / max(G - 1, 1)
    return {x: (b[i], np.sqrt(V[i, i])) for i, x in enumerate(xs)}, float(Y.mean()), len(df), G


def report(study, df, y, xs, cell, labels, engine=None, note=""):
    est, base, n, G = within(df, y, xs, cell)
    dens = norm.pdf(norm.ppf(np.clip(base, 0.01, 0.99)))
    print(f"\n== {study}: n {n:,}, {G:,} cells, base rate {base:.3f}{(' - ' + note) if note else ''}")
    for x in xs:
        bp, se = est[x]
        pr, prse = bp / dens, se / dens
        eng = (engine or {}).get(x)
        print(f"  {labels.get(x, x):48s} {bp * 100:+6.2f} pp (se {se * 100:4.2f})  probit {pr:+.3f} (se {prse:.3f})" + (f"   engine: {eng}" if eng else ""))
        OUT.append({"study": study, "factor": labels.get(x, x), "pp": bp * 100, "pp_se": se * 100, "probit": pr, "probit_se": prse, "n": n, "cells": G, "base": base, "engine": eng})


# ---------------------------------------------------------------- 1. Netherlands: the full GEMM NL file
d = pd.read_stata(os.path.join(RD, "studies/thijssen-2021-jimi-nl/NL_26112018.dta"))
d = d[d.invitation.notna()].copy()
d["inv"] = (d.invitation == "Invitation").astype(int)
d["interest"] = (d.anyinterest == "Employer interested").astype(int)
d["grade_good"] = (d.grade == "Good").astype(int)
d["perf"] = (d.treat_perf == "Yes").astype(int)
d["warmth"] = (d.treat_warmth == "Yes").astype(int)
d["dutch_stated"] = (d.dutchproficiency == "Yes").astype(int)
d["comm"] = (d.communicationskills == "Yes").astype(int)
d["over"] = (d.qualmismatch == "Overqualified").astype(int)
d["under"] = (d.qualmismatch == "Underqualified").astype(int)
d["first_gen"] = (d.migrationstatus == "First generation immigrant").astype(int)
d["second_gen"] = (d.migrationstatus == "Second generation immigrant").astype(int)
d["female"] = (d.gender == "Female").astype(int)
d["cell"] = d.occupation.astype(str) + "|" + d.wp_nuts2.astype(str)
L = {"grade_good": "good school grade stated", "perf": "performance signal (praise from employer)", "warmth": "warmth signal", "dutch_stated": "Dutch proficiency stated (immigrants)",
     "comm": "communication skills stated", "over": "overqualified (vs fit)", "under": "underqualified (vs fit)", "first_gen": "first-generation immigrant (vs native)",
     "second_gen": "second-generation immigrant (vs native)", "female": "female"}
ENG = {"over": "overqualified -0.053", "under": "underqualified about -0.21 (GEMM)", "first_gen": "nonEu -0.293 / euNonNative", "second_gen": "(engine: name only)"}
report("GEMM NL full file (Thijssen et al.)", d, "inv", ["grade_good", "perf", "warmth", "comm", "over", "under", "first_gen", "second_gen", "female"], "cell", L, ENG,
       "invitation to interview; cells = occupation x region")
mig = d[d.migrationstatus != "Native"]
report("GEMM NL, immigrants only: stating Dutch proficiency", mig, "inv", ["dutch_stated"], "cell", L, {"dutch_stated": "dutch parts: basic -0.170 vs fluent"})
report("GEMM NL, any interest (wider outcome)", d, "interest", ["grade_good", "perf", "warmth", "comm"], "cell", L)
for occ in ["Software Developer", "Payroll Clerk", "Sales Representative"]:
    report(f"GEMM NL, {occ}", d[d.occupation == occ], "inv", ["grade_good", "perf", "over", "under", "first_gen"], "wp_nuts2", L)

# ---------------------------------------------------------------- 1b. All five GEMM countries (the same design; 19k applications)
g = pd.read_csv(os.path.join(RD, "..", "gemm", "GEMM_v3_5.csv"), sep=None, engine="python")
g = g[g.invitation.notna()].copy()
g["inv"] = (g.invitation == "Invitation").astype(int)
g["grade_good"] = (g.grade == "Good").astype(int)
g["perf"] = (g.treat_perf == "Yes").astype(int)
g["warmth"] = (g.treat_warmth == "Yes").astype(int)
g["over"] = (g.qualmismatch == "Overqualified").astype(int)
g["under"] = (g.qualmismatch == "Underqualified").astype(int)
g["first_gen"] = (g.migrationstatus == "First generation immigrant").astype(int)
g["second_gen"] = (g.migrationstatus == "Second generation immigrant").astype(int)
g["female"] = (g.gender == "Female").astype(int)
g["cell"] = g.country.astype(str) + "|" + g.occupation.astype(str) + "|" + g.wp_nuts2.astype(str)
XS = ["grade_good", "perf", "warmth", "over", "under", "first_gen", "second_gen", "female"]
report("GEMM all five countries", g, "inv", XS, "cell", L, ENG, "invitation; cells = country x occupation x region")
for c in sorted(g.country.unique()):
    report(f"GEMM {c}", g[g.country == c], "inv", ["grade_good", "perf", "warmth", "over", "under", "first_gen"], "cell", L)

# ---------------------------------------------------------------- 2. Phillips: years of experience and a work gap, within a vacancy
p = pd.read_stata(os.path.join(RD, "sweep/phillips-commutes-dc-2019/phillips_jhr_cleandata.dta"))
p["yrs_upto5"] = np.minimum(p.work_experience, 5)
p["yrs_over5"] = np.maximum(p.work_experience - 5, 0)
p["gap_any"] = (p.work_gap > 0).astype(int) if p.work_gap.max() <= 1 else (p.work_gap > p.work_gap.median()).astype(int)
report("Phillips 2019, Washington DC", p, "interview", ["yrs_upto5", "yrs_over5"], "jobnum",
       {"yrs_upto5": "per year of experience, up to 5", "yrs_over5": "per year of experience beyond 5"},
       {"yrs_upto5": "years +0.055 per year beyond the ask (cap 3)"}, "interview; within vacancy")

# ---------------------------------------------------------------- 3. L'Horty: activities, volunteering, skills, and experience against what the ad asks
frames = []
for yr in (2010, 2012):
    f = os.path.join(RD, f"gaps/lhorty-2023-volunteering/data_year_{yr}.sas7bdat")
    if os.path.exists(f):
        x = pd.read_sas(f)
        x["year"] = yr
        frames.append(x)
lh = pd.concat(frames, ignore_index=True)
for c in lh.columns:
    if lh[c].dtype == object:
        lh[c] = lh[c].apply(lambda v: v.decode("latin-1") if isinstance(v, bytes) else v)
print("\nL'Horty columns check:", {c: lh[c].dropna().unique()[:6].tolist() for c in ["REPRECRUT", "BENEVOLAT", "ACTIVITEEXTRA", "COMPETENCE", "EXTRAPRO", "EXPE", "EXPEXIGEE"]})
json.dump({c: [str(v) for v in lh[c].dropna().unique()[:20]] for c in lh.columns}, open(os.path.join(RD, "gaps/lhorty-2023-volunteering/values.json"), "w"), indent=1)

for c in ["BENEVOLAT", "ACTIVITEEXTRA", "COMPETENCE"]:
    lh[c] = pd.to_numeric(lh[c], errors="coerce")
lh["resp_blank0"] = (lh.REPRECRUT == "1").astype(int)                      # a blank outcome read as no answer
lh["resp_coded"] = lh.REPRECRUT.map({"1": 1, "0": 0})                       # only rows with an outcome written down
LL = {"BENEVOLAT": "volunteering on the CV", "ACTIVITEEXTRA": "extra-curricular activity", "COMPETENCE": "a skills line"}
report("L'Horty et al. 2023, France (blank outcome = no answer)", lh, "resp_blank0", ["BENEVOLAT", "ACTIVITEEXTRA", "COMPETENCE"], "NUMOFFRE", LL, None,
       "outcome coding unclear (8,776 of 12,866 blank): indicative only")
report("L'Horty et al. 2023, France (coded outcomes only)", lh, "resp_coded", ["BENEVOLAT", "ACTIVITEEXTRA", "COMPETENCE"], "NUMOFFRE", LL)

# ---------------------------------------------------------------- 4. Pan & Zhang: university tier and skills, within a vacancy
pz = pd.read_csv(os.path.join(RD, "gaps/pan-zhang-2021/ResumeAudit.tab"), sep="\t")
skills = [c for c in ["cpluplus", "javascript", "linux", "php", "python", "sql"] if c in pz]
report("Pan & Zhang 2021, China", pz, "callback", ["high_tier", "merit"] + skills, "job_identifier",
       {"high_tier": "top-50 university (vs 51-100)", "merit": "top-5% GPA rank (vs top-45%)", **{s: f"skill listed: {s}" for s in skills}},
       {"high_tier": "prestige: shipped +0.06 (0.40 x study value)"}, "callback; within vacancy")

# ---------------------------------------------------------------- 5. Hollister: job mobility and company size
h = pd.read_stata(os.path.join(RD, "sweep/hollister-mobility-canada/data.dta"))
print("\nHollister values:", {c: h[c].value_counts().head(6).to_dict() for c in ["rtype", "rtypex", "csize", "rcsize", "positive", "jobtype3"]})

pd.DataFrame(OUT).to_csv(os.path.join(RD, "more_effects_2.csv"), index=False)
print(f"\nwrote {len(OUT)} effects to research-data/more-data/more_effects_2.csv")
