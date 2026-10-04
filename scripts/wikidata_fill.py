#!/usr/bin/env python3
"""Fills the founding year in employer_facts from Wikidata where LinkedIn had none. Free. Strict: the entity's label must be the same name as the company and its description must
call it a company or an organisation, and it must state an inception year. The year's source is stored in founded_source so the page can say where it came from.
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/wikidata_fill.py [--write]      (without --write it only prints what it would do)"""
import json, os, re, sys, time, urllib.parse, urllib.request
PAT = os.environ["SUPABASE_ACCESS_TOKEN"]; REF = "ukpmpyfcnbhngkgbnkxi"; WRITE = "--write" in sys.argv
UA = {"User-Agent": "odds-research/0.1 (company facts; not for training)"}
def sql(q):
    rq = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(), headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "odds"})
    return json.loads(urllib.request.urlopen(rq, timeout=120).read())
def get(url):
    try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40))
    except Exception: return None
norm = lambda s: re.sub(r"[^a-z0-9]", "", re.sub(r"&amp;", "&", (s or "").lower()))
BIZ = re.compile(r"\b(company|corporation|bank|retailer|manufacturer|firm|multinational|brand|university|organi[sz]ation|agency|startup|supermarket|airline|insurer|insurance|consultancy|conglomerate|group|chain|business|enterprise|platform|developer|producer|maker|institute|foundation)\b", re.I)
sql("alter table employer_facts add column if not exists founded_source text")
rows = sql("select employer, name from employer_facts where founded_year is null")
print(len(rows), "companies without a founding year", flush=True)
done = []
for r in rows:
    name = (r["name"] or r["employer"]).replace("&amp;", "&")
    d = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&type=item&limit=5&format=json&search=" + urllib.parse.quote(name))
    time.sleep(0.4)
    for c in (d or {}).get("search", []):
        if norm(c.get("label")) != norm(name) or not BIZ.search(c.get("description") or ""): continue
        e = get(f"https://www.wikidata.org/wiki/Special:EntityData/{c['id']}.json")
        time.sleep(0.4)
        claims = ((e or {}).get("entities", {}).get(c["id"], {}) or {}).get("claims", {})
        for x in claims.get("P571", []):
            t = (x.get("mainsnak", {}).get("datavalue", {}) or {}).get("value", {}).get("time", "")
            m = re.match(r"\+(\d{4})-", t)
            if m and 1500 < int(m.group(1)) <= 2026:
                done.append((r["employer"], name, int(m.group(1)), c["id"], c.get("description")))
                break
        else: continue
        break
for d in done: print(f"  {d[1]}: {d[2]}  ({d[3]}: {d[4]})")
print(len(done), "founding years found on Wikidata")
if WRITE and done:
    vals = ",".join(f"($q${e}$q$,{y})" for e, _, y, _, _ in done)
    n = sql(f"update employer_facts f set founded_year=v.y, founded_source='wikidata' from (values {vals}) v(e,y) where f.employer=v.e and f.founded_year is null returning f.employer")
    print("written:", len(n))
