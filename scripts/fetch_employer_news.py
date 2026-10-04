#!/usr/bin/env python3
"""Latest news headlines per employer from GDELT (open news index, free): up to three from the last year, English or Dutch, whose headline names the company.
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/fetch_employer_news.py [--top 150]
Stored in employer_news with the headline, the link, the site and the date: nothing is summarised or reworded. A company with no matching headline gets no row."""
import json, os, re, sys, time, urllib.parse, urllib.request
PAT = os.environ["SUPABASE_ACCESS_TOKEN"]; REF = "ukpmpyfcnbhngkgbnkxi"
TOP = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 150
def sql(q):
    rq = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(), headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "odds"})
    return json.loads(urllib.request.urlopen(rq, timeout=120).read())
norm = lambda s: re.sub(r"[^a-z0-9]", "", re.sub(r"&amp;", "&", (s or "").lower()))
sql("""create table if not exists employer_news (employer text not null, title text not null, url text not null, site text, published date, read_on date not null default current_date, primary key (employer, url));
alter table employer_news enable row level security; drop policy if exists employer_news_read on employer_news; create policy employer_news_read on employer_news for select using (true); grant select on employer_news to anon, authenticated; notify pgrst, 'reload schema';""")
rows = sql(f"select employer, min(employer_display) name, count(*) jobs from active_jobs group by 1 order by 3 desc limit {TOP}")
q = lambda s: "$q$" + s + "$q$"
saved = tried = 0
for r in rows:
    name = (r["name"] or "").replace("&amp;", "&").split(" (")[0].strip()
    if len(norm(name)) < 3: continue
    url = "https://api.gdeltproject.org/api/v2/doc/doc?mode=ArtList&format=json&maxrecords=12&sort=DateDesc&timespan=12months&query=" + urllib.parse.quote(f'"{name}" (sourcelang:english OR sourcelang:dutch)')
    tried += 1
    d = None
    for attempt in range(3):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "odds-research/0.1"}), timeout=40).read().decode("utf-8", "replace")); break
        except Exception: time.sleep(6)
    time.sleep(5.5)
    keep = []
    for a in (d or {}).get("articles", []) or []:
        title = (a.get("title") or "").strip()
        if norm(name) in norm(title) and a.get("url") and len(title) > 20 and a["url"] not in [k["url"] for k in keep]:
            m = re.match(r"(\d{4})(\d{2})(\d{2})", a.get("seendate") or "")
            keep.append({"title": title, "url": a["url"], "site": a.get("domain"), "date": f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None})
    keep = keep[:3]
    if keep:
        vals = ",".join(f"({q(r['employer'])},{q(k['title'])},{q(k['url'])},{q(k['site'] or '')},{q(k['date']) + '::date' if k['date'] else 'null'})" for k in keep)
        sql(f"insert into employer_news (employer, title, url, site, published) values {vals} on conflict (employer, url) do nothing")
        saved += 1
    if tried % 20 == 0: print(tried, "tried,", saved, "with news", flush=True)
print(f"done: {tried} employers tried, {saved} have news")
