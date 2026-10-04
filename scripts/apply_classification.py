#!/usr/bin/env python3
"""Writes the job field (family) and the employer industry for open postings that lack them, from the plan scripts/classify-new.ts prints.
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/apply_classification.py plan.json [--family family.json] [--industry industry.json]
plan.json:     what classify-new.ts found. It already holds the counting model's field and the known employer industry where there is one.
family.json:   {"<posting id>": "<one of the 16 job fields>"}            for jobs the model was not sure of (named by a person)
industry.json: {"<employer key>": "<one of the 23 industries>"}          for employers with no industry yet
Only empty values are filled; nothing already set is changed. Prints what is still unnamed, so the list is never silently short."""
import json, os, sys, urllib.request

PAT = os.environ["SUPABASE_ACCESS_TOKEN"]; REF = "ukpmpyfcnbhngkgbnkxi"
arg = lambda f: json.load(open(sys.argv[sys.argv.index(f) + 1])) if f in sys.argv else {}
plan = json.load(open(sys.argv[1])); fam_by_hand = arg("--family"); ind_by_hand = arg("--industry")
q = lambda s: "$q$" + s + "$q$"

def run(sql):
    rq = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": sql}).encode(), headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "odds"})
    return urllib.request.urlopen(rq, timeout=120).read().decode()

fam = []; ind = {}; unnamed_f = []; unnamed_i = {}
for x in plan:
    f = x["family"] or fam_by_hand.get(x["id"])
    if x["had"]["family"]: pass
    elif f: fam.append(f"({q(x['id'])},{q(f)})")
    else: unnamed_f.append(f"{x['id']} | {x['title']} | {x['display']}")
    if not x["had"]["industry"]:
        i = x["industry"] or ind_by_hand.get(x["employer"])
        if i: ind[x["employer"]] = i
        else: unnamed_i[x["employer"]] = x["display"]
a = run("update postings p set family=v.f, read_by=coalesce(read_by,'claude') from (values " + ",".join(fam) + ") v(i,f) where p.id=v.i and p.family is null returning p.id") if fam else "[]"
b = run("update postings p set industry=v.i from (values " + ",".join(f"({q(e)},{q(i)})" for e, i in ind.items()) + ") v(e,i) where p.employer=v.e and p.industry is null and p.closed_at is null returning p.id") if ind else "[]"
n = lambda r: r.count('"id"')
print(f"field set on {n(a)} postings, industry set on {n(b)} postings")
if unnamed_f: print("STILL WITHOUT A FIELD (name them in family.json):\n  " + "\n  ".join(unnamed_f))
if unnamed_i: print("STILL WITHOUT AN INDUSTRY (name them in industry.json):\n  " + "\n  ".join(f"{e}  ({d})" for e, d in unnamed_i.items()))
