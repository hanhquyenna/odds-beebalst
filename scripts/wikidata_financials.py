#!/usr/bin/env python3
"""Reads each employer's money facts from Wikidata (free, sourced, dated) into employer_money: revenue, net profit, market value, with currency and the year each was reported.
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/wikidata_financials.py [--top 200] [--write]     (without --write it only prints what it found)
Strict matching: the entity's label must be the company's name and its description must call it a company or organisation. A figure is stored only with its currency, its
year and the Wikidata item it came from. Nothing is converted or estimated. Companies that publish nothing have no row, and the page shows nothing for them."""
import json, os, re, sys, time, urllib.parse, urllib.request
PAT = os.environ["SUPABASE_ACCESS_TOKEN"]; REF = "ukpmpyfcnbhngkgbnkxi"; WRITE = "--write" in sys.argv
TOP = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 200
UA = {"User-Agent": "odds-research/0.1 (company facts; not for model training)"}
CUR = {"Q4916": "EUR", "Q4917": "USD", "Q25224": "GBP", "Q25344": "CHF", "Q8146": "JPY", "Q39099": "CNY", "Q122922": "SEK", "Q25417": "DKK", "Q25344": "CHF", "Q131723": "NOK", "Q1104069": "CAD", "Q25334": "AUD"}
PROPS = {"revenue": "P2139", "net_profit": "P2295", "market_value": "P2226", "total_assets": "P2403"}
BIZ = re.compile(r"\b(company|corporation|bank|retailer|manufacturer|firm|multinational|brand|university|organi[sz]ation|agency|startup|supermarket|airline|insurer|insurance|consultancy|conglomerate|group|chain|business|enterprise|platform|developer|producer|maker|institute|foundation|exchange|trading)\b", re.I)
norm = lambda s: re.sub(r"[^a-z0-9]", "", re.sub(r"&amp;", "&", (s or "").lower()))
def sql(q):
    rq = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(), headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "odds"})
    return json.loads(urllib.request.urlopen(rq, timeout=120).read())
def get(url):
    for _ in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40))
        except Exception: time.sleep(1.5)
    return None
sql("""create table if not exists employer_money (employer text not null, kind text not null check (kind in ('revenue','net_profit','market_value','total_assets')), amount numeric not null, currency text not null, year int not null, wikidata_id text not null, source text not null default 'wikidata', read_on date not null default current_date, primary key (employer, kind));
alter table employer_money enable row level security; drop policy if exists employer_money_read on employer_money; create policy employer_money_read on employer_money for select using (true); grant select on employer_money to anon, authenticated; notify pgrst, 'reload schema';""")
rows = sql(f"""select a.employer, coalesce(f.name, a.display) name, f.website, a.jobs from (select employer, min(employer_display) display, count(*) jobs from active_jobs group by 1) a left join employer_facts f on f.employer=a.employer order by a.jobs desc limit {TOP}""")
def by_website(site):
    """The Wikidata item whose official website is this address: far surer than a name. Tries http/https and with/without www and a closing slash."""
    host = re.sub(r"^https?://(www\.)?", "", (site or "").strip()).split("/")[0].lower()
    if not host or "." not in host: return None
    forms = " ".join(f"<{sch}://{w}{host}{sl}>" for sch in ("http", "https") for w in ("", "www.") for sl in ("", "/"))
    q = "SELECT ?item WHERE { VALUES ?u { " + forms + " } ?item wdt:P856 ?u } LIMIT 2"
    d = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q)); time.sleep(0.6)
    items = [b["item"]["value"].rsplit("/", 1)[-1] for b in ((d or {}).get("results", {}) or {}).get("bindings", [])]

    return items[0] if len(items) == 1 else None

found = []; seen_q = {}
for r in rows:
    name = (r["name"] or "").replace("&amp;", "&")
    if name in seen_q: qid = seen_q[name]
    elif r.get("website") and (qid := by_website(r["website"])):
        seen_q[name] = qid
    else:
        d = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&type=item&limit=6&format=json&search=" + urllib.parse.quote(name)); time.sleep(0.3)
        qid = next((c["id"] for c in (d or {}).get("search", []) if norm(c.get("label")) == norm(name) and BIZ.search(c.get("description") or "")), None)
        seen_q[name] = qid
    if not qid: continue
    e = get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"); time.sleep(0.3)
    claims = ((e or {}).get("entities", {}).get(qid, {}) or {}).get("claims", {})
    for kind, prop in PROPS.items():
        best = None
        for x in claims.get(prop, []):
            v = (x.get("mainsnak", {}).get("datavalue", {}) or {}).get("value", {})
            unit = (v.get("unit") or "").rsplit("/", 1)[-1]
            when = ((x.get("qualifiers", {}).get("P585") or [{}])[0].get("datavalue", {}) or {}).get("value", {}).get("time", "")
            m = re.match(r"\+(\d{4})-", when)
            if not v.get("amount") or unit not in CUR or not m: continue
            if best is None or int(m.group(1)) > best[1]: best = (float(v["amount"]), int(m.group(1)), CUR[unit])
        if best and best[1] >= 2018: found.append((r["employer"], name, kind, best[0], best[2], best[1], qid))
by = {}
for f in found: by.setdefault(f[0], []).append(f)
print(f"{len(rows)} employers tried; {len(by)} have at least one money fact on Wikidata ({sum(1 for k in by if any(x[2]=='revenue' for x in by[k]))} with revenue)")
for emp, fs in list(by.items())[:14]:
    print("  ", fs[0][1], "|", "; ".join(f"{x[2]} {x[3]:,.0f} {x[4]} ({x[5]})" for x in fs))
if WRITE and found:
    q = lambda s: "$q$" + s + "$q$"
    vals = ",".join(f"({q(e)},{q(k)},{a},{q(c)},{y},{q(w)})" for e, _, k, a, c, y, w in found)
    sql(f"insert into employer_money (employer, kind, amount, currency, year, wikidata_id) values {vals} on conflict (employer, kind) do update set amount=excluded.amount, currency=excluded.currency, year=excluded.year, wikidata_id=excluded.wikidata_id, read_on=current_date")
    print("written:", len(found), "figures")
