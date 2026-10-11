"""Predicted against actual, from the people who used odds (outcome loop, docs/ENGINE_DATA_PLAN.md E3).

Reads chance_snapshots that have an outcome (interview / rejected / no_reply), prints the calibration by predicted-chance bucket with
a 90% Wilson interval, the Brier score and the log loss against a constant at the observed rate, and writes
research-data/backtest/outcomes_parts.jsonl in the format of parts.jsonl (ds "odds_users") so learn.py can read it.

  python3 scripts/research/outcomes_report.py            # reads the live database through the Supabase CLI (needs `supabase login`)
  python3 scripts/research/outcomes_report.py rows.json  # reads rows from a file: [{chance, outcome, snapshot:{parts, post}}, ...]

Answers are self-reported and not a random sample (people who hear back answer sooner): treat small numbers as a smoke test, not as
a measurement. Below MIN_ANSWERED answers the report says so and the multipliers in learned_multipliers.json must not be touched.
"""
import json, math, os, subprocess, sys

MIN_ANSWERED = 200
BUCKETS = [(0, 0.01, "0-1%"), (0.01, 0.02, "1-2%"), (0.02, 0.05, "2-5%"), (0.05, 0.10, "5-10%"), (0.10, 0.20, "10-20%"), (0.20, 0.40, "20-40%"), (0.40, 1.01, "40%+")]


def load_rows():
    if len(sys.argv) > 1:
        return json.load(open(sys.argv[1]))
    sql = "select chance, outcome, model, snapshot from public.chance_snapshots where outcome is not null"
    out = subprocess.run(["supabase", "db", "query", "--linked", "--project-ref", "ukpmpyfcnbhngkgbnkxi", "-o", "json", sql], capture_output=True, text=True)
    raw = out.stdout
    return json.JSONDecoder().raw_decode(raw[raw.find("{"):])[0]["rows"]


def wilson(k, n, z=1.645):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


rows = load_rows()
n = len(rows)
print(f"answered applications: {n}")
if n == 0:
    print("Nothing to report yet: nobody has answered. (Applications are asked about 14 days after they are marked applied.)")
    sys.exit(0)

y = [1 if r["outcome"] == "interview" else 0 for r in rows]
p = [min(0.999, max(0.001, float(r["chance"]))) for r in rows]
base = sum(y) / n
brier = sum((pi - yi) ** 2 for pi, yi in zip(p, y)) / n
brier_const = sum((base - yi) ** 2 for yi in y) / n
ll = -sum(yi * math.log(pi) + (1 - yi) * math.log(1 - pi) for pi, yi in zip(p, y)) / n
b = min(0.999, max(0.001, base))
ll_const = -sum(yi * math.log(b) + (1 - yi) * math.log(1 - b) for yi in y) / n
print(f"interview rate {base:.1%}; mean predicted {sum(p) / n:.1%}")
print(f"Brier {brier:.4f} (a constant at the observed rate: {brier_const:.4f});  log loss {ll:.4f} (constant: {ll_const:.4f})")
print(f"{'bucket':8s} {'n':>5s} {'predicted':>10s} {'actual':>8s}   90% interval")
for lo, hi, name in BUCKETS:
    idx = [i for i, pi in enumerate(p) if lo <= pi < hi]
    if not idx:
        continue
    k = sum(y[i] for i in idx)
    a, c = wilson(k, len(idx))
    print(f"{name:8s} {len(idx):5d} {sum(p[i] for i in idx) / len(idx):10.1%} {k / len(idx):8.1%}   {a:.1%} - {c:.1%}")
if n < MIN_ANSWERED:
    print(f"\nOnly {n} answers: below {MIN_ANSWERED}, read this as a smoke test. Do not change learned_multipliers.json from it.")

os.makedirs("research-data/backtest", exist_ok=True)
with open("research-data/backtest/outcomes_parts.jsonl", "w") as f:
    for r, yi in zip(rows, y):
        s = r.get("snapshot") or {}
        post = s.get("post") or {}
        f.write(json.dumps({"ds": "odds_users", "group": f"NL|{post.get('family') or 'unknown'}", "job": None, "split": "test", "y": yi, "parts": s.get("parts") or {}, "chance": r["chance"], "old": None}) + "\n")
print(f"wrote research-data/backtest/outcomes_parts.jsonl ({n} rows)")
