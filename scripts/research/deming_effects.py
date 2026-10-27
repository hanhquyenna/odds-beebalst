"""Deming, Yuchtman, Abulafi, Goldin & Katz (AER 2016) audit: what it says about the engine's school and degree parts.

10,484 fictitious applications to online job ads in 5 US cities (business and health jobs); the school on the resume was randomised
(for-profit online, for-profit brick, public selective, public non-selective), as were degree level, race and gender.
Data: research-data/deming/data/Postsecondary_Credentials_Replication/DYAGK_audit_data.dta (Harvard Dataverse doi:10.7910/DVN/P8ETJ0,
CC0; the guestbook must be answered once). Run: research-data/.venv/bin/python scripts/research/deming_effects.py

Estimates follow the authors' do-file: linear probability of any callback on school type with job fixed effects, standard errors
clustered by job. Printed as percentage points and as a lift on the mean callback rate, with a 90% interval.
"""
import warnings
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

warnings.filterwarnings("ignore")
d = pd.read_stata("research-data/deming/data/Postsecondary_Credentials_Replication/DYAGK_audit_data.dta", convert_categoricals=False)
print(f"{len(d)} applications; callback {d.any_call.mean():.1%} (business {d[d.occ == 'business'].any_call.mean():.1%}, health {d[d.occ == 'health'].any_call.mean():.1%})")


def report(name, sub, formula, terms):
    m = smf.ols(formula, data=sub).fit(cov_type="cluster", cov_kwds={"groups": sub["jobID"]})
    base = sub.any_call.mean()
    print(f"\n{name}: n={len(sub)}, mean callback {base:.1%}")
    for t in terms:
        b, se = m.params[t], m.bse[t]
        print(f"  {t:9s} {b * 100:+.2f} pp (se {se * 100:.2f})  lift x{(base + b) / base:.2f}  [{(base + b - 1.645 * se) / base:.2f}, {(base + b + 1.645 * se) / base:.2f}]")


ba = d[(d.occ == "business") & (d.ba == 1)]
report("Business jobs asking for a BA, against a for-profit online BA", ba, "any_call ~ fp_brick + pub_NS + pub_S + C(jobID)", ["fp_brick", "pub_NS", "pub_S"])
report("Same jobs, public schools only: selective against non-selective", ba[ba.pub == 1], "any_call ~ pub_S + C(jobID)", ["pub_S"])
aa = d[(d.occ == "business") & (d.aa == 1)]
report("Business jobs asking for no BA: degree type against no degree", aa, "any_call ~ fp + fp_ba + pub + C(jobID)", ["fp", "fp_ba", "pub"])
