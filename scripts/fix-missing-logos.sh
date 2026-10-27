#!/bin/sh
# Gives every active job's employer a logo: lists the employers with none, reads each one's logo from one of its job pages, adds it to
# src/lib/company-logos.json and cuts the background out (scripts/make_logos.py). Run it after new jobs are added:
#   set -a; . ./.env.local; set +a; sh scripts/fix-missing-logos.sh
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
bun scripts/list-missing-logos.ts > "$T/missing.json"
python3 -c "import json;print(len(json.load(open('$T/missing.json'))),'employers without a logo')"
python3 scripts/fetch-employer-logos.py "$T/missing.json" "$T/found.json"
python3 - "$T" <<'PY'
import json,sys,subprocess
T=sys.argv[1]
found=json.load(open(T+'/found.json')); m=json.load(open('src/lib/company-logos.json'))
added=[e for e,v in found.items() if v['logo'] and e not in m]
for e in added: m[e]=found[e]['logo']
json.dump(m,open('src/lib/company-logos.json','w'),indent=1,ensure_ascii=False)
print('added',len(added),'logos')
if added: subprocess.run(['python3','scripts/make_logos.py',*added],check=True)
PY
