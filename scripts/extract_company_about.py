#!/usr/bin/env python3
"""Finds each employer's own description of itself in the job postings we hold, and writes it as SQL for the table employer_about.
  SB_URL=https://<ref>.supabase.co SB_ANON=<anon key> python3 scripts/extract_company_about.py > about.json
Reads every open posting's text, looks for the paragraph under a heading like "About us", "About <Company>", "Who we are", "Over ons", and keeps the best
one per employer: English, 120 to 700 characters, cut at a sentence end. Nothing is written or invented: the words are the employer's own."""
import json, os, re, sys, urllib.request, html

URL = os.environ["SB_URL"].rstrip("/"); KEY = os.environ["SB_ANON"]
def get(path):
    rq = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    return json.load(urllib.request.urlopen(rq, timeout=120))

# A heading about the COMPANY (not the role, the team or the job).
ABOUT = re.compile(r"^(about( us| the company| the organi[sz]ation| our company| the firm| the business| [a-z0-9&.'’\- ]{2,40})?|who we are|who are we|our company|company (overview|profile|description|introduction)|the company|our story|our mission|over ons|over (het bedrijf|de organisatie|ons bedrijf)|wie zijn wij|het bedrijf)[:!?]?$", re.I)
NOT_COMPANY = re.compile(r"\b(role|job|position|internship|traineeship|vacancy|team|department|function|you|the opportunity|assignment|project|programme|program)\b", re.I)
HEADING_END = re.compile(r"[.!?;,]$")
DUTCH = re.compile(r"\b(wij|jij|je|voor|een|het|van|met|bij|ons|onze|als|zijn|dat|deze|worden)\b", re.I)

def lines(text):
    text = html.unescape(re.sub(r"<[^>]+>", "\n", text or ""))
    return [re.sub(r"\s+", " ", l).strip() for l in text.replace("\r", "").split("\n")]

def is_heading(l):
    return 0 < len(l) <= 60 and not HEADING_END.search(l.rstrip(":")) and len(l.split()) <= 8

def company_paragraph(text, employer):
    L = lines(text); out = []
    name = re.sub(r"[^a-z0-9]+", "", employer.lower())
    for i, l in enumerate(L):
        if not is_heading(l): continue
        h = l.rstrip(":").strip()
        if not ABOUT.match(h): continue
        mid = re.sub(r"^about\s+", "", h, flags=re.I)
        # "About the role" and its kin are not about the company, unless the heading names the employer itself.
        if NOT_COMPANY.search(mid) and name not in re.sub(r"[^a-z0-9]+", "", mid.lower()): continue
        para = []
        for nxt in L[i + 1:]:
            if not nxt:
                if para: break
                continue
            if is_heading(nxt) and para: break
            if nxt.startswith(("-", "•", "*")) and para: break
            para.append(nxt)
            if sum(len(p) for p in para) > 900: break
        out.append(" ".join(para))
    return out

def intro_paragraph(text, employer):
    """No heading: a paragraph near the top that starts "<Company> is a …" or "At <Company>, …" and reads as a description of the company."""
    name = re.escape(employer.split(" (")[0].strip())
    rx = re.compile(rf"^(?:{name}(?:\s[A-Z][\w&.\-]*){{0,3}}\s(?:is|are|was|has been)\s(?:a|an|the|one|part|among|active|world|europe|global|leading)\b|at\s{name}\b.{{0,40}}\bwe\s(?:are|build|help|make|create|believe|work))", re.I)
    out = []
    for l in [x for x in lines(text) if len(x) >= 120][:6]:
        if rx.search(l): out.append(l)
    return out

def trim(p, limit=700):
    p = p.strip()
    if len(p) <= limit: return p
    cut = p[:limit]
    m = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return (cut[: m + 1] if m > 200 else cut.rsplit(" ", 1)[0] + "…").strip()

rows = []
for off in range(0, 6000, 500):
    part = get(f"postings?select=id,employer,employer_display,body&closed_at=is.null&order=id&offset={off}&limit=500")
    rows += part
    if len(part) < 500: break
best = {}
for r in rows:
    found = company_paragraph(r.get("body") or "", r["employer_display"] or r["employer"]) or intro_paragraph(r.get("body") or "", r["employer_display"] or r["employer"])
    for p in found:
        p = trim(p)
        if len(p) < 120 or len(DUTCH.findall(p)) >= 4: continue
        cur = best.get(r["employer"])
        # prefer a length near 350 characters, and one that names the company
        score = -abs(len(p) - 350) + (60 if re.sub(r"[^a-z0-9]", "", (r["employer_display"] or "").lower())[:6] in re.sub(r"[^a-z0-9]", "", p.lower()) else 0)
        if cur is None or score > cur["score"]:
            best[r["employer"]] = {"employer": r["employer"], "display": r["employer_display"], "about": p, "posting_id": r["id"], "score": score}
emps = {r["employer"] for r in rows}
json.dump(list(best.values()), sys.stdout, ensure_ascii=False)
print(f"{len(best)} of {len(emps)} employers with open postings have a description of themselves", file=sys.stderr)
