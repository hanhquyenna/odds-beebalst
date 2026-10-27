/**
 * What can be read out of a posting or a CV, by fixed rules: a name, whether it
 * is a tool or a skill, and the words that mean it. Each rule is written to
 * match the thing itself, not a common word that happens to be near it, so a
 * requirement is only reported when the posting really names it.
 */
export type SkillKind = "tool" | "skill"

const RULES: Array<[string, SkillKind, RegExp]> = [
  // tools: software, systems and languages you work in
  ["excel", "tool", /\b(ms |microsoft )?excel\b(?! (in|at|as|under)\b)/],
  ["vba", "tool", /\bvba\b/], ["power bi", "tool", /\bpower ?bi\b/], ["tableau", "tool", /\btableau\b/], ["looker", "tool", /\blooker( studio)?\b/],
  ["alteryx", "tool", /\balteryx\b/], ["sql", "tool", /\bsql\b/], ["python", "tool", /\bpython\b/], ["sas", "tool", /\bsas\b(?= (programming|software|code|and|,)|\s*,)/],
  ["sap", "tool", /\bsap\b/], ["oracle", "tool", /\boracle\b/], ["netsuite", "tool", /\bnetsuite\b/], ["workday", "tool", /\bworkday (hcm|extend|financials|adaptive|prism|studio|integration|reporting)\b/],
  ["salesforce", "tool", /\bsalesforce\b/], ["hubspot", "tool", /\bhubspot\b/], ["jira", "tool", /\bjira\b/], ["confluence", "tool", /\bconfluence\b/],
  ["sharepoint", "tool", /\bsharepoint\b/], ["power automate", "tool", /\bpower (automate|apps)\b/], ["figma", "tool", /\bfigma\b/], ["photoshop", "tool", /\bphotoshop\b/],
  ["powerpoint", "tool", /\bpowerpoint\b/], ["crm", "tool", /\bcrm\b/], ["erp", "tool", /\berp\b/], ["google analytics", "tool", /\bgoogle analytics\b/],
  ["java", "tool", /\bjava\b/], ["kotlin", "tool", /\bkotlin\b/], ["scala", "tool", /\bscala\b/], ["javascript", "tool", /\bjavascript\b/], ["typescript", "tool", /\btypescript\b/],
  ["react", "tool", /\breact(\.js|js)?\b(?!\s+(to|quickly|fast|swiftly|well|appropriately|positively))/], ["node.js", "tool", /\bnode\.js\b|\bnodejs\b/], ["vue", "tool", /\bvue(\.js)?\b/],
  ["angular", "tool", /\bangular\b/], ["rust", "tool", /\brust\b/], ["c++", "tool", /\bc\+\+/], ["c#", "tool", /\bc#/], [".net", "tool", /\.net\b/], ["php", "tool", /\bphp\b/],
  ["ruby on rails", "tool", /\bruby on rails\b/], ["android", "tool", /\bandroid (development|sdk|apps?)\b|\bkotlin\b/], ["ios", "tool", /\bios (development|apps?|sdk)\b|\bswiftui\b/],
  ["aws", "tool", /\baws\b|\bamazon web services\b/], ["azure", "tool", /\bazure\b/], ["gcp", "tool", /\bgcp\b|\bgoogle cloud\b/], ["kubernetes", "tool", /\bkubernetes\b|\bk8s\b/],
  ["docker", "tool", /\bdocker\b/], ["terraform", "tool", /\bterraform\b/], ["git", "tool", /\bgit(hub|lab)?\b/], ["linux", "tool", /\blinux\b/], ["snowflake", "tool", /\bsnowflake\b/],
  ["dbt", "tool", /\bdbt\b/], ["databricks", "tool", /\bdatabricks\b/], ["spark", "tool", /\b(apache |py)spark\b/], ["kafka", "tool", /\bkafka\b/], ["airflow", "tool", /\bairflow\b/],
  ["pytorch", "tool", /\bpytorch\b/], ["tensorflow", "tool", /\btensorflow\b/], ["matlab", "tool", /\bmatlab\b/], ["cad", "tool", /\b(autocad|solidworks|catia)\b|\bcad (software|design|tools)\b/],
  ["plc", "tool", /\bplc (programming|systems)\b|\bscada\b/],
  // skills: things you know how to do
  ["ifrs", "skill", /\bifrs\b/], ["us gaap", "skill", /\b(us|u\.s\.) ?gaap\b|\bgaap\b/], ["dutch gaap", "skill", /\b(dutch|nl) gaap\b/], ["audit", "skill", /\baudit(ing)?\b/], ["tax", "skill", /\btax (law|advice|compliance|reporting|planning)\b|\bcorporate tax\b|\bvat\b/],
  ["transfer pricing", "skill", /\btransfer pricing\b/], ["treasury", "skill", /\btreasury\b/], ["consolidation", "skill", /\b(financial |group )?consolidation\b/], ["reconciliation", "skill", /\breconciliation/],
  ["budgeting", "skill", /\bbudgeting\b/], ["forecasting", "skill", /\bforecasting\b/], ["fp&a", "skill", /\bfp&a\b/], ["financial modelling", "skill", /\bfinancial model(l)?ing\b/],
  ["financial reporting", "skill", /\bfinancial reporting\b|\bmanagement reporting\b/], ["internal controls", "skill", /\binternal controls?\b/], ["risk management", "skill", /\brisk management\b/],
  ["valuation", "skill", /\bvaluation\b/], ["due diligence", "skill", /\bdue diligence\b/], ["m&a", "skill", /\bm&a\b|\bmergers and acquisitions\b/], ["kyc/aml", "skill", /\b(kyc|aml)\b/],
  ["regulatory reporting", "skill", /\bregulatory reporting\b/], ["cpa/aca/acca", "skill", /\b(cpa|aca|acca|cima)\b/], ["cfa", "skill", /\bcfa\b/],
  ["machine learning", "skill", /\bmachine learning\b/], ["deep learning", "skill", /\bdeep learning\b/], ["nlp", "skill", /\bnlp\b|\bnatural language processing\b/],
  ["data analysis", "skill", /\bdata analy(sis|tics)\b/], ["statistics", "skill", /\bstatistical (analysis|modelling|methods)\b|\bstatistics\b/], ["a/b testing", "skill", /\ba\/b test/],
  ["etl", "skill", /\betl\b|\bdata pipelines?\b/], ["data modelling", "skill", /\bdata model(l)?ing\b/], ["data engineering", "skill", /\bdata engineering\b/], ["data science", "skill", /\bdata science\b/],
  ["ci/cd", "skill", /\bci\/cd\b/], ["rest apis", "skill", /\b(rest(ful)?|web) apis?\b/], ["microservices", "skill", /\bmicroservices?\b/], ["cybersecurity", "skill", /\bcyber ?security\b|\binformation security\b/],
  ["devops", "skill", /\bdevops\b/], ["systems engineering", "skill", /\bsystems engineering\b/], ["embedded systems", "skill", /\bembedded (systems|software)\b|\bfirmware\b/],
  ["project management", "skill", /\bproject manag/], ["program management", "skill", /\bprogram(me)? manag/], ["product management", "skill", /\bproduct manag/], ["agile/scrum", "skill", /\b(agile|scrum|kanban)\b/],
  ["prince2", "skill", /\bprince ?2\b|\bpmp\b/], ["six sigma", "skill", /\bsix sigma\b/], ["process improvement", "skill", /\bprocess improvement\b|\bcontinuous improvement\b/],
  ["stakeholder management", "skill", /\bstakeholder (management|engagement|communication)\b|\bmanag(e|ing) stakeholders\b/], ["business analysis", "skill", /\bbusiness analy(sis|st)\b/],
  ["requirements gathering", "skill", /\brequirements? (gathering|analysis|elicitation)\b/], ["change management", "skill", /\bchange management\b/], ["vendor management", "skill", /\bvendor management\b|\bsupplier management\b/],
  ["negotiation", "skill", /\bnegotiation\b|\bnegotiating\b/], ["business development", "skill", /\bbusiness development\b/], ["account management", "skill", /\baccount manag/],
  ["lead generation", "skill", /\blead generation\b/], ["customer success", "skill", /\bcustomer success\b/], ["procurement", "skill", /\bprocurement\b|\bpurchasing\b/], ["supply chain", "skill", /\bsupply chain\b/],
  ["inventory management", "skill", /\binventory (management|control)\b/], ["demand planning", "skill", /\bdemand planning\b|\bs&op\b/], ["quality management", "skill", /\biso ?9001\b|\bquality management\b/],
  ["seo", "skill", /\bseo\b/], ["sem", "skill", /\bsem\b|\bgoogle ads\b|\bppc\b/], ["social media", "skill", /\bsocial media\b/], ["content marketing", "skill", /\bcontent (marketing|creation|strategy)\b/],
  ["copywriting", "skill", /\bcopywriting\b/], ["email marketing", "skill", /\bemail marketing\b/], ["marketing automation", "skill", /\bmarketing automation\b/], ["brand management", "skill", /\bbrand (management|strategy)\b/],
  ["market research", "skill", /\bmarket research\b/], ["recruitment", "skill", /\btalent acquisition\b|\brecruitment (specialist|consultant|marketing|experience in)\b/], ["payroll", "skill", /\bpayroll\b/],
  ["hris", "skill", /\bhris\b/], ["employee relations", "skill", /\bemployee relations\b/], ["learning and development", "skill", /\blearning (and|&) development\b/], ["labour law", "skill", /\blabou?r law\b|\bemployment law\b/],
  ["gdpr", "skill", /\bgdpr\b/], ["communication skills", "skill", /\bcommunication skills\b/], ["analytical skills", "skill", /\banalytical (skills|mindset|thinking)\b/], ["presentation skills", "skill", /\bpresentation skills\b/],
]

export const SKILLS: Record<string, RegExp> = Object.fromEntries(RULES.map(([name, , pattern]) => [name, pattern]))
export const SKILL_KIND: Record<string, SkillKind> = Object.fromEntries(RULES.map(([name, kind]) => [name, kind]))

/** The tools and skills whose own words appear in this text, in dictionary order. */
export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase()

  return RULES.filter(([, , pattern]) => pattern.test(lower)).map(([name]) => name)
}

const SHOWN_AS: Record<string, string> = {
  "power bi": "Power BI", "power automate": "Power Automate", sql: "SQL", sas: "SAS", sap: "SAP", crm: "CRM", erp: "ERP", aws: "AWS", gcp: "GCP", ios: "iOS", cad: "CAD", plc: "PLC", dbt: "dbt",
  ifrs: "IFRS", "us gaap": "US GAAP", "dutch gaap": "Dutch GAAP", "fp&a": "FP&A", "m&a": "M&A", "kyc/aml": "KYC/AML", "cpa/aca/acca": "CPA/ACA/ACCA", cfa: "CFA", nlp: "NLP", etl: "ETL", "ci/cd": "CI/CD",
  "a/b testing": "A/B testing", "rest apis": "REST APIs", "agile/scrum": "Agile/Scrum", prince2: "PRINCE2", vba: "VBA", php: "PHP", "node.js": "Node.js", ".net": ".NET", "c++": "C++", "c#": "C#", javascript: "JavaScript", typescript: "TypeScript",
  powerpoint: "PowerPoint", sharepoint: "SharePoint", hubspot: "HubSpot", netsuite: "NetSuite", pytorch: "PyTorch", tensorflow: "TensorFlow", matlab: "MATLAB", devops: "DevOps", "ruby on rails": "Ruby on Rails", "google analytics": "Google Analytics",
}

/** A skill as a person would write it: "Power BI", "SQL", "Financial modelling". The rule names above are lowercase for matching. */
export function skillLabel(name: string): string {
  return SHOWN_AS[name] ?? name.charAt(0).toUpperCase() + name.slice(1)
}
