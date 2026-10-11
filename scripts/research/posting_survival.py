"""Kaplan-Meier survival of postings (days from posted_on to closed_at; still-open postings are censored at today).

Input: research-data/posting-life/postings.jsonl, one JSON per posting {posted, closed, ats, source, level}, exported from
Supabase (see docs/ENGINE_DATA_PLAN.md D4). Output: research-data/posting-life/survival.json with S(t) at chosen ages, overall and by
level, and a bootstrap 90% band. Stdlib only.

Caveat that matters: closed_at is when OUR checker noticed the close, so lives are upper bounds (by the check interval), and a
posting that left the page after the employer filled it counts as closed, while one left up after filling counts as open.
"""
import json, random, sys, datetime as dt
from collections import defaultdict

TODAY = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today()
rows = [json.loads(l) for l in open("research-data/posting-life/postings.jsonl")]

SKIP_DAYS = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()

def spells(rs):
    """(entry age, exit age, closed?) in days. Entry = the age when we first saw it: before that we could not have seen it close
    (left truncation), and ignoring it makes old postings look like they live longer than they do."""
    out = []
    for r in rs:
        p = dt.date.fromisoformat(r["posted"])
        f = dt.date.fromisoformat(r["first_seen"]) if r.get("first_seen") else p
        entry = max(0, (f - p).days)
        if r["closed"]:
            c = dt.date.fromisoformat(r["closed"])
            if r["closed"] in SKIP_DAYS:  # a day the checker swept many dead postings at once: not a real close date
                continue
            exit_ = max(entry, (c - p).days)
            out.append((entry, exit_, 1))
        else:
            out.append((entry, max(entry, (TODAY - p).days), 0))
    return out

def km(sp, ages):
    """Kaplan-Meier with delayed entry. S(t) at each age in `ages` (days)."""
    ev = defaultdict(int)
    for en, ex, e in sp:
        if e:
            ev[ex] += 1
    cur = 1.0
    curve = []
    for t in sorted(ev):
        # at risk at age t: watched from an age <= t, not yet left before t
        risk = sum(1 for en, ex, e in sp if en <= t <= ex)
        if risk:
            cur *= 1 - ev[t] / risk
        curve.append((t, cur, risk))
    def at(a):
        v = 1.0
        for t, c, _ in curve:
            if t <= a:
                v = c
            else:
                break
        return v
    return {a: at(a) for a in ages}, len(sp)

AGES = [0, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 84]
groups = {"all": rows}
for lv in ("internship", "entry"):
    groups[lv] = [r for r in rows if (r.get("level") or "").lower() == lv]

out = {"today": str(TODAY), "ages": AGES, "note": "closed_at is when our checker noticed the close (upper bound on life)"}
random.seed(7)
for name, rs in groups.items():
    sp = spells(rs)
    point, n = km(sp, AGES)
    boots = []
    for _ in range(200):
        b = [random.choice(sp) for _ in sp]
        boots.append(km(b, AGES)[0])
    band = {a: [sorted(x[a] for x in boots)[10], sorted(x[a] for x in boots)[189]] for a in AGES}
    closed = sum(e for _, _, e in sp)
    median = next((a for a in range(0, 200) if km(sp, [a])[0][a] <= 0.5), None)
    watched = sum(1 for en, ex, e in sp if en <= 28 <= ex)
    out[name] = {"n": n, "closed": closed, "censored": n - closed, "median_life_days": median, "watched_at_28d": watched, "S": {str(a): round(point[a], 3) for a in AGES}, "S90": {str(a): [round(band[a][0], 3), round(band[a][1], 3)] for a in AGES}}
json.dump(out, open("research-data/posting-life/survival.json", "w"), indent=1)
for name in groups:
    g = out[name]
    print(f"{name}: n={g['n']} closed={g['closed']} median life={g['median_life_days']} still watched at 28d={g['watched_at_28d']}")
    print("   S(t):", " ".join(f"{a}d={g['S'][str(a)]}" for a in AGES))
