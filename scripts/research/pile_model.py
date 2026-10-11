"""How well does the engine guess the size of the pile when a posting shows no applicant count, and can a model learned from our own
Dutch postings do better?

Rows: research-data/pile/pile_rows.jsonl (scripts/research/export_pile.ts): our postings that show LinkedIn's applicant count, with the
engine's fallback for the same posting (pileFor's employer-tier number) and facts about the posting and the employer.
Target: the count projected to the end of the posting's life, exactly as the engine projects a count it sees (projectedApplicants), on a
log scale. LinkedIn caps what it shows: "Be among the first 25" (the true count is at most 25) and "Over 200" (at least 200). Training uses
the shown number; scoring uses exact rows for error and every row for "on the right side of a cap".
Cross-validation is grouped by employer: no employer is in both the training and the scored part.

  research-data/.venv/bin/python scripts/research/pile_model.py
"""
import json, os, warnings
import numpy as np, pandas as pd
from scipy.stats import spearmanr
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import GroupKFold
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")
RD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "research-data")
d = pd.read_json(os.path.join(RD, "pile/pile_rows.jsonl"), lines=True)
d = d[d.projected > 0].reset_index(drop=True)
y = np.log(d.projected.values.astype(float))

city = d.region.fillna("").str.split(",").str[0].str.strip().str.lower()
top = city.value_counts().index[:12]
d["city"] = np.where(city.isin(top), city, "other")
d["log_emp"] = np.log1p(d.employees.fillna(0))
d["has_emp"] = d.employees.notna().astype(int)
d["log_fol"] = np.log1p(d.followers.fillna(0))
d["log_gdrev"] = np.log1p(d.gd_reviews.fillna(0))
d["gd"] = d.gd_rating.fillna(d.gd_rating.median())
d["log_emp_posts"] = np.log1p(d.employer_postings.fillna(1))
d["yrs"] = d.years_min.fillna(-1)
for c in ["level_view", "family", "company_type", "workplace", "job_type", "ats", "degree_asked", "tier", "cat"]:
    d[c] = d[c].fillna("none").astype(str)
for c in ["english", "ind_sponsor", "pay_stated", "intern"]:
    d[c] = d[c].fillna(False).astype(int)
NUM = ["log_emp", "has_emp", "log_fol", "log_gdrev", "gd", "log_emp_posts", "yrs", "english", "ind_sponsor", "pay_stated", "intern"]
CAT = ["level_view", "family", "company_type", "workplace", "job_type", "ats", "degree_asked", "tier", "city", "cat"]
d["title_text"] = d.title.fillna("").str.lower()
X = d[NUM + CAT + ["title_text"]]
groups = d.employer.values
exact = (d.censor == "exact").values


def prep():
    return ColumnTransformer([("num", StandardScaler(), NUM), ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=5, sparse_output=False), CAT)])


def prep_text():
    return ColumnTransformer([("num", StandardScaler(), NUM), ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=5, sparse_output=False), CAT),
                              ("title", TfidfVectorizer(min_df=3, ngram_range=(1, 2), sublinear_tf=True), "title_text")])


models = {
    "ridge (linear)": lambda: make_pipeline(prep(), RidgeCV(alphas=np.logspace(-2, 3, 20))),
    "ridge + title words (TF-IDF)": lambda: make_pipeline(prep_text(), RidgeCV(alphas=np.logspace(-2, 3, 20))),
    "gradient boosting": lambda: make_pipeline(prep(), HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, random_state=1)),
    "neural network (MLP)": lambda: make_pipeline(prep(), MLPRegressor(hidden_layer_sizes=(32, 16), alpha=1e-2, early_stopping=True, max_iter=1000, random_state=1)),
}
pred = {"engine fallback (tier constants)": np.log(d.engine_typical.values.astype(float))}
pred["one number (training median)"] = np.zeros(len(d))
pred["tier constants re-fitted"] = np.zeros(len(d))
pred["employer's other postings (median)"] = np.full(len(d), np.nan)
for k in models:
    pred[k] = np.zeros(len(d))

for tr, te in GroupKFold(n_splits=5).split(X, y, groups):
    pred["one number (training median)"][te] = np.median(y[tr])
    tm = pd.Series(y[tr]).groupby(d.tier.values[tr]).median()
    pred["tier constants re-fitted"][te] = [tm.get(t, np.median(y[tr])) for t in d.tier.values[te]]
    for k, mk in models.items():
        m = mk().fit(X.iloc[tr], y[tr])
        pred[k][te] = m.predict(X.iloc[te])
# The engine's second source: the employer's average over its other postings (leave this posting out). Only where the employer has others.
s = pd.Series(y)
for i, e in enumerate(groups):
    others = s[(groups == e) & (np.arange(len(d)) != i)]
    if len(others):
        pred["employer's other postings (median)"][i] = others.median()


def score(p, rows):
    p, t, c = p[rows], y[rows], d.censor.values[rows]
    ok = ~np.isnan(p)
    p, t, c = p[ok], t[ok], c[ok]
    ex = c == "exact"
    err = np.abs(p[ex] - t[ex])
    side = np.where(c == "below", p <= t + 0.05, np.where(c == "above", p >= t - 0.05, np.abs(p - t) <= np.log(2)))
    return {"n": int(ok.sum()), "MAE log (exact rows)": err.mean(), "typical factor off": float(np.exp(np.median(err))), "within x2 (exact)": float((err <= np.log(2)).mean()),
            "right side of caps / within x2 (all)": float(side.mean()), "bias (mean log pred/true, exact)": float((p[ex] - t[ex]).mean()), "Spearman (exact)": float(spearmanr(p[ex], t[ex]).correlation)}


allrows = np.ones(len(d), bool)
res = pd.DataFrame({k: score(v, allrows) for k, v in pred.items()}).T
pd.set_option("display.width", 220)
print(f"{len(d)} postings, {d.employer.nunique()} employers, exact counts {exact.sum()}, median projected pile {np.exp(np.median(y)):.0f}")
print(res.round(3).to_string())
interns = (d.intern == 1).values
print("\nInternships and graduate jobs only:")
print(pd.DataFrame({k: score(v, interns) for k, v in pred.items()}).T.round(3).to_string())
print("\nMedian projected pile by engine tier (what the constants should be, from our postings):")
print(d.assign(p=d.projected).groupby("tier").p.agg(["count", "median", lambda x: x.quantile(0.25), lambda x: x.quantile(0.75)]).round(0).rename(columns={"<lambda_0>": "p25", "<lambda_1>": "p75"}).to_string())
print(d.assign(p=d.projected).groupby("intern").p.agg(["count", "median"]).round(0).to_string())
res.to_csv(os.path.join(RD, "pile/pile_model_results.csv"))
