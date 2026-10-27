#!/usr/bin/env python3
"""Reads each employer's logo address (and website) from one of its job pages, for employers the app has no logo for.
  bun scripts/list-missing-logos.ts > missing-logos.json ; python3 scripts/fetch-employer-logos.py missing-logos.json out.json
The job page's own structured data names the employer's logo (hiringOrganization.logo) and site (sameAs). One page per employer, 2 seconds apart,
the AcademicTransfer one 10.5 seconds apart (its robots.txt asks for 10). Writes {employer: {logo, site, name}} and nothing else."""
import sys,json,re,subprocess,time,urllib.parse
src,dst=sys.argv[1],sys.argv[2]
rows=json.load(open(src)); out={}
def ld(body):
    m=re.search(r'"@type"\s*:\s*"JobPosting"',body)
    if not m: return None
    s=body.rfind('{',0,m.start())
    while s>=0:
        try:
            o,_=json.JSONDecoder().raw_decode(body[s:])
            if isinstance(o,dict) and o.get('@type')=='JobPosting': return o
        except ValueError: pass
        s=body.rfind('{',0,s)
for i,r in enumerate(rows,1):
    if not r.get('url'): continue
    body=subprocess.run(["curl","-s","-m","40","-A","career-sim-research/0.1","-L",r['url']],capture_output=True,text=True).stdout
    o=ld(body) or {}
    org=o.get('hiringOrganization') if isinstance(o.get('hiringOrganization'),dict) else {}
    out[r['employer']]={'name':r['display'],'logo':org.get('logo') if isinstance(org.get('logo'),str) else (org.get('logo') or {}).get('url') if isinstance(org.get('logo'),dict) else None,'site':org.get('sameAs') if isinstance(org.get('sameAs'),str) else None}
    if i%20==0: print(i,'/',len(rows),flush=True)
    time.sleep(10.5 if r.get('ats')=='academictransfer' else 2)
json.dump(out,open(dst,'w'),indent=1,ensure_ascii=False); print('done',len(out),'with logo:',sum(1 for v in out.values() if v['logo']))
