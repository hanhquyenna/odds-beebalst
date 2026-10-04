#!/usr/bin/env python3
"""Reads each company's LinkedIn page and stores the facts in employer_facts (and the headcount in employer_headcount).
  APIFY_TOKEN=... SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/fetch_employer_facts.py companies.json [--top 150]
companies.json: [{"display": "Picnic", "keys": ["Picnic", "Picnic Technologies"], "n": 30}, ...] (the employers in the default list, most jobs first).
Costs $0.004 a company. A result is stored only when the page's name matches the employer's name, so a search that lands on the wrong company is dropped,
not saved. Companies already in employer_facts are skipped. Keys come from the environment only."""
import json, os, re, sys, urllib.request, difflib, concurrent.futures as cf
TOK = os.environ["APIFY_TOKEN"]; PAT = os.environ["SUPABASE_ACCESS_TOKEN"]; REF = "ukpmpyfcnbhngkgbnkxi"
top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 150
companies = json.load(open(sys.argv[1]))[:top]

def sql(q):
    rq = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(), headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "odds"})
    return json.loads(urllib.request.urlopen(rq, timeout=120).read())
def lit(v):
    if v is None: return "null"
    if isinstance(v, (int, float)): return str(v)
    return "$q$" + str(v) + "$q$"
def jsn(v): return "null" if v is None else "$q$" + json.dumps(v, ensure_ascii=False) + "$q$::jsonb"

norm = lambda s: re.sub(r"[^a-z0-9]", "", re.sub(r"&amp;", "&", (s or "").lower()))
def same(a, b):
    a, b = norm(a), norm(b)
    return bool(a and b) and (a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8)

have = {r["employer"] for r in sql("select employer from employer_facts")}
todo = [c for c in companies if not all(k in have for k in c["keys"])]
print(len(todo), "companies to read", flush=True)

def read(c):
    body = json.dumps({"searches": [c["display"].replace("&amp;", "&")]}).encode()
    rq = urllib.request.Request(f"https://api.apify.com/v2/acts/harvestapi~linkedin-company/run-sync-get-dataset-items?token={TOK}", data=body, headers={"Content-Type": "application/json"})
    try: return c, json.load(urllib.request.urlopen(rq, timeout=170))
    except Exception as e: return c, str(e)

def stat(x, title):
    for s in x.get("peopleStats") or []:
        if s.get("statTitle") == title: return [{"title": v["title"], "count": v["count"]} for v in s.get("values", [])[:6]]
    return None

stored = skipped = 0; wrong = []
with cf.ThreadPoolExecutor(4) as ex:
    for c, items in ex.map(read, todo):
        if isinstance(items, str) or not items: wrong.append((c["display"], "no result")); continue
        x = items[0]
        if not same(c["display"], x.get("name")): wrong.append((c["display"], "got " + str(x.get("name")))); continue
        hq = next((l for l in (x.get("locations") or []) if l.get("headquarter")), None)
        hq_text = (hq or {}).get("parsed", {}).get("text") if hq else None
        founded = (x.get("foundedOn") or {}).get("year") if isinstance(x.get("foundedOn"), dict) else None
        inds = ", ".join(i.get("name") for i in (x.get("industries") or []) if i.get("name"))
        for k in c["keys"]:
            sql(f"""insert into employer_facts (employer, linkedin_url, name, tagline, description, website, founded_year, employees, employee_range, followers, company_type, headquarters, locations, linkedin_industry, specialities, top_locations, top_schools, top_functions, top_fields)
              values ({lit(k)},{lit(x.get('linkedinUrl'))},{lit(x.get('name'))},{lit(x.get('tagline'))},{lit(x.get('description'))},{lit(x.get('website'))},{lit(founded)},{lit(x.get('employeeCount'))},{lit((lambda r: f"{r['start']}-{r['end']}" if r and r.get('end') else (f"{r['start']}+" if r else None))(x.get('employeeCountRange')))},{lit(x.get('followerCount'))},{lit(x.get('companyType'))},{lit(hq_text)},{jsn([{'city': (l.get('parsed') or {}).get('city'), 'country': (l.get('parsed') or {}).get('country')} for l in (x.get('locations') or [])][:12])},{lit(inds or None)},{('array[' + ','.join(lit(s) for s in (x.get('specialities') or [])[:12]) + ']::text[]') if x.get('specialities') else 'null'},{jsn(stat(x,'Locations'))},{jsn(stat(x,'School'))},{jsn(stat(x,'Current Function'))},{jsn(stat(x,'Field of Study'))})
              on conflict (employer) do update set linkedin_url=excluded.linkedin_url, name=excluded.name, tagline=excluded.tagline, description=excluded.description, website=excluded.website, founded_year=excluded.founded_year, employees=excluded.employees, employee_range=excluded.employee_range, followers=excluded.followers, company_type=excluded.company_type, headquarters=excluded.headquarters, locations=excluded.locations, linkedin_industry=excluded.linkedin_industry, specialities=excluded.specialities, top_locations=excluded.top_locations, top_schools=excluded.top_schools, top_functions=excluded.top_functions, top_fields=excluded.top_fields, fetched_at=current_date""")
            if x.get("employeeCount"):
                sql(f"insert into employer_headcount (employer, read_on, employees) values ({lit(k)}, current_date, {int(x['employeeCount'])}) on conflict do nothing")
        stored += 1
        if stored % 20 == 0: print(stored, "stored", flush=True)
print(f"stored {stored} companies; not matched: {len(wrong)}")
for w in wrong: print("  ", w)
