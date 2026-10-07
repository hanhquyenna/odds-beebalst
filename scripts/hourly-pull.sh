#!/bin/sh
# One round of finding more jobs, run by launchd every 30 minutes (see scripts/launchd/com.odds.pull.plist). No login, no Apify:
#   1. LinkedIn's public job pages, 25 new jobs at most, a different slice of the search words each run
#   2. the job field named by the counting model, or by plain title words where it is not sure
# Industries are left for a person where an employer is unknown. Log: ~/Library/Logs/odds-pull.log
cd "$(dirname "$0")/.." || exit 1
export PATH="/Users/ad/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin"
set -a; . ./.env.local; . ./.env.secrets; set +a
STATE="$HOME/.odds-pull-state"
N=$(cat "$STATE" 2>/dev/null || echo 0)
WORDS="internship|stage|stagiair|afstudeerstage|werkstudent|working student|traineeship|graduate programme|junior|entry level|management trainee|marketing intern|finance intern|data analyst junior|software engineer intern|business analyst graduate|supply chain intern|HR intern|sales internship|consultant junior|research intern|legal intern|operations analyst|product manager intern|UX design intern|sustainability intern|engineering internship|audit associate|risk analyst|project coordinator junior"
TOTAL=$(echo "$WORDS" | tr '|' '\n' | wc -l | tr -d ' ')
PICK=""
for i in 0 1 2 3; do
  K=$(( (N * 4 + i) % TOTAL + 1 ))
  W=$(echo "$WORDS" | tr '|' '\n' | sed -n "${K}p")
  PICK="${PICK:+$PICK,}$W"
done
echo $((N + 1)) > "$STATE"
echo "=== $(date '+%Y-%m-%d %H:%M') words: $PICK"
bun scripts/pull-linkedin-public.ts --max 25 --pages 3 --days 14 --queries "$PICK" 2>&1 | grep -vE '^  \+ ' | tail -8
T=$(mktemp -d)
bun scripts/classify-new.ts > "$T/plan.json" 2>/dev/null && python3 scripts/name_by_title.py "$T/plan.json" > "$T/family.json" && python3 scripts/apply_classification.py "$T/plan.json" --family "$T/family.json" 2>&1 | head -1
rm -rf "$T"
