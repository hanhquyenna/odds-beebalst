"""External check of the engine on the Swiss correspondence test (Zenodo 6675500, CC-BY, 2,366 applications, German-speaking Switzerland,
2017-18; Swiss, German, French, Turkish, Kosovar and Cameroonian names; jobs: sales assistant, electrician, nurse, HR clerk).

Needs research-data/more-data/swiss_parts.jsonl (bun scripts/research/export_swiss.ts, after research-data/more-data/swiss/c_DataLong.xls and
swiss_rows.json exist) and research-data/.venv. Run from the repo root: research-data/.venv/bin/python scripts/research/swiss_check.py

Probit of "invited or called" on the engine's summed strength with job intercepts, standard errors clustered by pair: slope 1 means the
engine's scale is right. Never used for training: learn.py can read it (PARTS=...), see docs/ENGINE_DATA_PLAN.md C4.
"""
import warnings
import pandas as pd
import statsmodels.formula.api as smf
from sklearn.metrics import roc_auc_score

warnings.filterwarnings("ignore")
d = pd.read_json("research-data/more-data/swiss_parts.jsonl", lines=True)
P = pd.json_normalize(d.z).fillna(0.0)
S = pd.json_normalize(d.parts).fillna(0.0)
d["zz"] = P.sum(axis=1)
d["zs"] = S.sum(axis=1)
m = smf.probit("y ~ C(group) + zz", d).fit(disp=0, cov_type="cluster", cov_kwds={"groups": d.Id})
ms = smf.probit("y ~ C(group) + zs", d).fit(disp=0, cov_type="cluster", cov_kwds={"groups": d.Id})
print(f"{len(d)} applications, positive {d.y.mean():.1%}")
print(f"engine strength, probit slope within job: {m.params['zz']:.2f} (se {m.bse['zz']:.2f}); study values only: {ms.params['zs']:.2f} (se {ms.bse['zs']:.2f}); 1.0 = right scale")
tot = win = 0
for g, x in d.groupby("group"):
    if x.y.nunique() > 1:
        win += roc_auc_score(x.y, x.zz) * len(x)
        tot += len(x)
print(f"within-job AUC {win / tot:.3f}")
mm = smf.probit('y ~ C(group) + C(f_mm, Treatment("Majority")) + C(f_fit, Treatment("Good"))', d).fit(disp=0, cov_type="cluster", cov_kwds={"groups": d.Id})
print("observed effects (probit units, engine-implied in brackets):")
for k, eng in [('C(f_mm, Treatment("Majority"))[T.Minority]', d[d.f_mm == "Minority"].zz.mean() - d[d.f_mm == "Majority"].zz.mean()), ('C(f_fit, Treatment("Good"))[T.Okay]', d[d.f_fit == "Okay"].zz.mean() - d[d.f_fit == "Good"].zz.mean()), ('C(f_fit, Treatment("Good"))[T.Overqualified]', d[d.f_fit == "Overqualified"].zz.mean() - d[d.f_fit == "Good"].zz.mean())]:
    print(f"  {k.split('[T.')[1][:-1]:14s} {mm.params[k]:+.2f} (se {mm.bse[k]:.2f})   engine {eng:+.2f}")
