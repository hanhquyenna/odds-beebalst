"""Asks LinkedIn (through the Apify actor scrapingmonkey~linkedin-job-details-scraper) whether each listed job is still open.

  APIFY_TOKEN=... python3 scripts/research/apify_open_check.py research-data/coverage/month_linkedin_jobs.jsonl

Input: JSON lines with id and url. Output: research-data/coverage/apify_check.jsonl, one line per job: id, job_status (open / closed / null), status
(success / failed), applicants, checked_at. About $0.001-0.003 per job; batches of 40, a failed batch is retried once. The token comes from the
environment and is never written to a file.
"""
import json, os, re, sys, time, urllib.request, urllib.error, datetime as dt

token = os.environ["APIFY_TOKEN"]
rows = [json.loads(l) for l in open(sys.argv[1])]
out_path = "research-data/coverage/apify_check.jsonl"
done = {json.loads(l)["id"] for l in open(out_path)} if os.path.exists(out_path) else set()
todo = [r for r in rows if r["id"] not in done]
print(f"{len(rows)} jobs, {len(done)} already checked, {len(todo)} to go")
URL = "https://api.apify.com/v2/acts/scrapingmonkey~linkedin-job-details-scraper/run-sync-get-dataset-items?token=" + token
BATCH = 40
spent_items = 0
with open(out_path, "a") as out:
    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        body = json.dumps({"inputList": [r["url"] for r in batch]}).encode()
        items = None
        for attempt in (1, 2):
            try:
                req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
                items = json.load(urllib.request.urlopen(req, timeout=290))
                break
            except urllib.error.HTTPError as e:
                print(f"batch {i // BATCH}: HTTP {e.code} {e.read()[:120]!r}")
                if e.code in (401, 402, 403):  # token or credit: stop, do not burn more calls
                    sys.exit(1)
            except Exception as e:  # timeout etc.
                print(f"batch {i // BATCH}: {type(e).__name__}")
            time.sleep(5)
        if items is None:
            continue
        by_id = {str(it.get("id")): it for it in items}
        spent_items += len(items)
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        for r in batch:
            it = by_id.get(re.findall(r"\d{8,}", r["url"])[-1])
            out.write(json.dumps({"id": r["id"], "job_status": (it or {}).get("job_status"), "status": (it or {}).get("status", "missing"), "applicants": (it or {}).get("applicants"), "checked_at": now}) + "\n")
        out.flush()
        print(f"batch {i // BATCH + 1}/{(len(todo) + BATCH - 1) // BATCH}: {len(items)} results")
print(f"done; about ${spent_items * 0.003:.2f} at the free-tier price")
