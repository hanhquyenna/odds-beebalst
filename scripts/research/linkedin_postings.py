"""
LinkedIn Job Postings 2023-24 (OpenML 45952, copy of Kaggle arshkon postings.csv, CC BY-SA): how many apply, and how the count
grows with a posting's age. Standard library only (no pandas on this machine). Plan: docs/ENGINE_DATA_PLAN.md, step B.

Run:  python3 scripts/research/linkedin_postings.py research-data/linkedin-postings/Linkedin_Job_Postings.arff
Writes research-data/linkedin-postings/summary.json and prints the same.

Notes on the data:
- `applies` is LinkedIn's count when the posting was scraped; `views` likewise. There is no scrape time per row, so the scrape
  moment is taken as the latest `listed_time` in the file (the batch was read within days of it). Age at read = that moment minus
  `original_listed_time` (UTC date-times). Postings re-listed later keep their original time, which is what we want.
- `application_type`: SimpleOnsiteApply = Easy Apply (count = applications); OffsiteApply = goes to the company site (count =
  clicks on Apply); ComplexOnsiteApply = LinkedIn form with extra questions.
- Cross-section, not panels: each posting is read once, so the growth curve is read from postings of different ages. Postings
  that closed early are missing from the old ages (survivorship), so the curve at old ages leans towards slower-filling postings.
"""
import csv
import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone

csv.field_size_limit(sys.maxsize)
DAY = 86_400_000


def rows(path):
    names = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            s = line.strip()
            if s.upper().startswith("@ATTRIBUTE"):
                names.append(s.split()[1])
            elif s.upper().startswith("@DATA"):
                break
        reader = csv.reader(f, quotechar="'", escapechar="\\", skipinitialspace=True)
        for rec in reader:
            if not rec or len(rec) != len(names):
                continue
            yield dict(zip(names, rec))


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def when(x):
    """'2024-04-17 23:45:08' (UTC) or epoch ms, as epoch ms; None when missing."""
    if not x or x == "?":
        return None
    v = num(x)
    if v is not None:
        return v
    try:
        return datetime.strptime(x[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp() * 1000
    except ValueError:
        return None


def pct(values, q):
    if not values:
        return None
    v = sorted(values)
    k = (len(v) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def describe(values):
    return {"n": len(values), "median": pct(values, 0.5), "p25": pct(values, 0.25), "p75": pct(values, 0.75), "p90": pct(values, 0.9), "mean": statistics.fmean(values) if values else None}


def main(path):
    data = list(rows(path))
    listed = [when(r["listed_time"]) for r in data]
    read_at = max(v for v in listed if v)
    out = {"rows": len(data), "read_at_ms": read_at, "with_applies": 0}

    level_of = lambda r: ("None" if r.get("formatted_experience_level") in (None, "?") else r["formatted_experience_level"]).strip("'")
    kind_of = lambda r: (r.get("application_type") or "UnknownApply").strip("'")

    by_level, by_kind, by_level_kind = defaultdict(list), defaultdict(list), defaultdict(list)
    ages = []  # (age_days, applies, level, kind, views)
    for r in data:
        a = num(r["applies"])
        if a is None:
            continue
        out["with_applies"] += 1
        lvl, kind = level_of(r), kind_of(r)
        by_level[lvl].append(a)
        by_kind[kind].append(a)
        by_level_kind[f"{lvl} / {kind}"].append(a)
        t0 = when(r["original_listed_time"])
        if t0:
            age = (read_at - t0) / DAY
            if 0 <= age <= 120:
                ages.append((age, a, lvl, kind, num(r["views"])))

    out["applies_by_level"] = {k: describe(v) for k, v in sorted(by_level.items())}
    out["applies_by_application_type"] = {k: describe(v) for k, v in sorted(by_kind.items())}
    out["applies_by_level_and_type"] = {k: describe(v) for k, v in sorted(by_level_kind.items()) if len(v) >= 30}

    # Growth with age: median applies per age bucket, for all and for entry/intern.
    buckets = [(0, 1), (1, 2), (2, 3), (3, 5), (5, 7), (7, 10), (10, 14), (14, 21), (21, 30), (30, 45), (45, 60), (60, 120)]

    def curve(sel):
        res = []
        for lo, hi in buckets:
            vals = [a for (age, a, *_rest) in sel if lo <= age < hi]
            res.append({"age_days": f"{lo}-{hi}", "n": len(vals), "median_applies": pct(vals, 0.5), "mean_applies": statistics.fmean(vals) if vals else None})
        return res

    early = [x for x in ages if x[2] in ("Entry level", "Internship")]
    out["applies_by_age_all"] = curve(ages)
    out["applies_by_age_entry_intern"] = curve(early)

    # Fit applies ≈ c · age^a on medians by bucket (log-log least squares over buckets with n ≥ 30 and age ≤ 30).
    def fit(sel):
        pts = []
        for b in curve(sel):
            lo, hi = map(float, b["age_days"].split("-"))
            if b["n"] >= 30 and b["median_applies"] and hi <= 30:
                pts.append((math.log((lo + hi) / 2), math.log(b["median_applies"])))
        if len(pts) < 3:
            return None
        mx = statistics.fmean(p[0] for p in pts)
        my = statistics.fmean(p[1] for p in pts)
        a = sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts)
        return {"exponent_a": a, "points": len(pts)}

    out["power_fit_all"] = fit(ages)
    out["power_fit_entry_intern"] = fit(early)

    # Applies per view by application type: how much of the interest a count captures on each kind of apply.
    ratio = defaultdict(list)
    for (_age, a, _lvl, kind, views) in ages:
        if views and views >= 10:
            ratio[kind].append(a / views)
    out["applies_per_view_by_type"] = {k: describe(v) for k, v in ratio.items()}
    return out


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "research-data/linkedin-postings/Linkedin_Job_Postings.arff"
    result = main(path)
    with open("research-data/linkedin-postings/summary.json", "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))
