"""What three more experiments say about the engine's parts (observed effects in probit units, against what the engine ships).

Data (free openICPSR logins, all under research-data/more-data/):
  Eriksson & Rooth 2014, AER: 8,466 applications in Sweden: years of experience, current and past unemployment, ethnic-minority name,
    "more education than required" (112740, Dataset_Hiringexperiment.dta)
  Bertrand & Mullainathan 2004, AER: 4,870 resumes, US: years of experience, honours, volunteering, military, employment holes, computer and
    special skills, white or Black name (116023, lakisha_aer.dta)
  Kessler, Low & Sullivan 2019, AER: 6,320 resumes rated by employers (Penn 2,880, Pitt 3,440): top-employer first job, second internship,
    work-for-money job, technical skills, GPA (231422, IRRData_*.dta). A rating of 1-10 for "would hire", not a callback: ordered probit.
Run from the repo root: research-data/.venv/bin/python scripts/research/new_data_effects.py

Probit coefficients are on the same scale as the engine's strength parts (p = Phi(z - T), noise 1), so "observed" and "engine" can be read
side by side; what the engine ships is step(effect) x learned multiplier (src/lib/odds-v2.ts). Standard errors are robust (clustered by
posting where the data has one).
"""
import warnings
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.miscmodels.ordinal_model import OrderedModel

warnings.filterwarnings("ignore")
D = "research-data/more-data/"


def row(label, b, se, engine):
    e = "" if engine is None else f"   engine {engine:+.3f}"
    print(f"  {label:44s} {b:+.3f} (se {se:.3f}){e}")


print("== Eriksson & Rooth 2014 (Sweden, callbacks)")
e = pd.read_stata(D + "112740/AER_2012_1097_Data/Dataset_Hiringexperiment.dta", convert_categoricals=False)
occ = [c for c in ["ddata", "dred", "dsjuk", "dsvso", "dmano", "dgym", "dftg", "dbutik", "dmaskin", "dbygg", "dfordon", "dlokal", "drest"] if c in e]
e["unemp_now_9m"] = (e.nuarblos == 3).astype(int)
e["unemp_now_any"] = (e.nuarblos >= 1).astype(int)
e["exp_extra"] = np.clip(e.erfar - 2, 0, 3)  # the engine counts years beyond the 2 it assumes are asked, up to 3
f = "callback ~ exp_extra + unemp_now_any + unemp_now_9m + scarce + parbetslos + min + doverutb + sommarjobb + dsthlm + dgbg + " + " + ".join(occ)
m = smf.probit(f, e).fit(disp=0, cov_type="HC1")
print(f"  {len(e)} applications, callback {e.callback.mean():.1%}")
row("per year of experience beyond 2 (cap 3)", m.params["exp_extra"], m.bse["exp_extra"], 0.08 * 0.69)
row("ethnic-minority name (vs native)", m.params["min"], m.bse["min"], -0.293)
row("more education than required", m.params["doverutb"], m.bse["doverutb"], -0.053)
row("unemployed now, any length", m.params["unemp_now_any"], m.bse["unemp_now_any"], None)
row("unemployed now, 9 months (extra)", m.params["unemp_now_9m"], m.bse["unemp_now_9m"], None)
row("summer jobs", m.params["sommarjobb"], m.bse["sommarjobb"], None)

print("\n== Bertrand & Mullainathan 2004 (US, callbacks)")
b = pd.read_stata(D + "116023/lakisha_aer.dta", convert_categoricals=False)
b["black"] = (b.race.astype(str).str.lower().str.startswith("b")).astype(int)
b["exp_extra"] = np.clip(b.yearsexp - 2, 0, 3)
for c in ["honors", "volunteer", "military", "empholes", "workinschool", "computerskills", "specialskills", "email"]:
    b[c] = pd.to_numeric(b[c], errors="coerce").fillna(0)
f = "call ~ exp_extra + honors + volunteer + military + empholes + workinschool + computerskills + specialskills + C(education) + black + C(city) + C(occupbroad)"
m = smf.probit(f, b).fit(disp=0, cov_type="cluster", cov_kwds={"groups": b.adid})
print(f"  {len(b)} resumes, callback {b.call.mean():.1%}")
row("per year of experience beyond 2 (cap 3)", m.params["exp_extra"], m.bse["exp_extra"], 0.08 * 0.69)
row("skills: computer skills", m.params["computerskills"], m.bse["computerskills"], None)
row("skills: special skills", m.params["specialskills"], m.bse["specialskills"], None)
row("honours", m.params["honors"], m.bse["honors"], None)
row("employment holes", m.params["empholes"], m.bse["empholes"], None)
row("volunteering / military", m.params["volunteer"], m.bse["volunteer"], None)
row("Black-sounding name (US race, not origin)", m.params["black"], m.bse["black"], None)
print("  (the engine's skills part moves strength by at most +-0.2 and is an assumption; here both skill blocks are measured)")

print("\n== Kessler, Low & Sullivan 2019 (US, employer ratings 1-10, ordered probit)")
k = pd.concat([pd.read_stata(D + f"231422/data/Data/Raw/IRRData_{s}.dta", convert_categoricals=False).assign(site=s) for s in ("Penn", "Pitt")], ignore_index=True)
k = k.dropna(subset=["rating_hire", "randgpa", "topemp", "secondint", "wfm", "techskills"])
k["female"] = (k.randfirstname_gender == "female").astype(int)
k["white"] = (k.rand_eth == 4).astype(int)
X = pd.get_dummies(k[["randgpa", "topemp", "secondint", "wfm", "techskills", "female", "white", "major_type"]].assign(major_type=lambda x: (x.major_type == 2).astype(int)), drop_first=False).astype(float)
res = OrderedModel(k.rating_hire.astype(int), X, distr="probit").fit(method="bfgs", disp=0, maxiter=300)
print(f"  {len(k)} resumes rated, mean rating {k.rating_hire.mean():.2f}")
row("top employer on the first job", res.params["topemp"], res.bse["topemp"], 0.15 * 0.4)
row("a second internship", res.params["secondint"], res.bse["secondint"], 0.079)
row("work-for-money job", res.params["wfm"], res.bse["wfm"], None)
row("technical skills", res.params["techskills"], res.bse["techskills"], None)
row("+1 GPA point (3.0 to 4.0)", res.params["randgpa"], res.bse["randgpa"], None)
row("female name", res.params["female"], res.bse["female"], None)

print("\n== Kline, Rose & Walters 2022/2024 (US, 83,643 applications to 108 large employers; openICPSR 198284, CC-BY-NC)")
n = pd.read_stata(D + "198284/replication/data/data.dta", convert_categoricals=False)
n["assoc"] = n.associates
m = smf.probit("cb ~ black + female + over40 + assoc + C(firm_id)", n).fit(disp=0, cov_type="cluster", cov_kwds={"groups": n.job_id})
print(f"  {len(n)} applications, callback {n.cb.mean():.1%}; callback rate by employer: median {n.groupby('firm_id').cb.mean().median():.1%}, "
      f"10th-90th percentile {n.groupby('firm_id').cb.mean().quantile(.1):.1%}-{n.groupby('firm_id').cb.mean().quantile(.9):.1%}")
row("Black-sounding name (US race, not origin)", m.params["black"], m.bse["black"], None)
row("aged over 40 on the resume", m.params["over40"], m.bse["over40"], None)
row("associate's degree", m.params["assoc"], m.bse["assoc"], None)
row("female name", m.params["female"], m.bse["female"], None)
print("  (the engine has no age part, on purpose; the race gap says nothing about a Dutch origin gap, but the spread of callback rates")
print("   between employers (5% to 45% from the 10th to the 90th percentile, 9-fold) is the pile-size problem the engine handles with employer tiers, 60 to 600 applicants)")
