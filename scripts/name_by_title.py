#!/usr/bin/env python3
"""Names the job field (one of the 16 in family-model.json) for postings the counting model was not sure of, from plain words in the title.
  python3 scripts/name_by_title.py plan.json > family.json      (plan.json is what scripts/classify-new.ts prints)
Only titles that match a rule are named; the rest stay empty and are listed by scripts/apply_classification.py for a person. The rules are keyword guesses, checked by eye on 99 jobs on 7 Oct 2026."""
import json, re, sys

RULES = [
    (r"supplier portal|technische bedrijfskunde|management trainee|managementtrainee|management traineeship|inkoop|logist|supply|productieplanner|werkvoorbereid|operations|facility|facilit", "Operations & supply chain"),
    (r"tax|belasting|fiscal|accountan|audit|finance|financ|financi|samenstel|loonheffing|quantitative|controll|beleggen|vermogens|aangifte|debiteur|macro analyst|capital|boekhoud", "Finance & accounting"),
    (r"legal|juridisch|recht|compliance|risk|kyc|cdd|fraud|integriteit|advocaat|\blaw\b|bestuursrecht|^working student$", "Risk, compliance & legal"),
    (r"marketing|pr stag|communicat|brand|content|social media|performance market|crm|loyalty|copywrit|community", "Marketing & communications"),
    (r"design|animatie|\bux\b|video|vormgev", "Design & UX"),
    (r"\bhr\b|hr-|hrm|human resources|talent acquisition|recruit|employer branding|personeel|leren & ontwikkelen", "HR & recruiting"),
    (r"consult|strategy|advies|adviseur|innovatie", "Consulting & strategy"),
    (r"data|analytics|\bbi\b|machine learning|\bai\b|actuari", "Data, analytics & AI"),
    (r"software|developer|development|\bit\b|ict|security|network|netwerk|cloud|devops|iot", "IT, cloud & security"),
    (r"sales|verkoop|account ?manager|business develop|klantcontact|customer|winkel|store|retail|commercie|buitendienst", "Sales & account management"),
    (r"bim|civiel|bouwkunde|werktuigbouw|mechanical|engineer|technisch|techniek|installatie|cad|monteur|maintenance|process development|composite|productontwikkeling|pipelines|environmental|duurzaam|sustainab|elektro|tekenaar|planontwikkel|geotechniek", "Hardware & engineering"),
    (r"research|researcher|onderzoek|phd|afstudeeropdracht|innovatie scout", "Research & academia"),
    (r"project|proces|bedrijfsvoering|bedrijfskunde|office|business support|young professional|werkstudent|working student|traineeship|trainee", "Product & project management"),
]
plan = json.load(open(sys.argv[1]))
named = {}
for x in plan:
    if x["family"] or x["had"]["family"]:
        continue
    title = x["title"].lower()
    for rx, fam in RULES:
        if re.search(rx, title):
            named[x["id"]] = fam
            break
json.dump(named, sys.stdout)
