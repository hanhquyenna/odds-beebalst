// src/lib/months.ts
var TABLE = {
  0: ["jan", "ene", "gen", "oca"],
  1: ["feb", "fev", "sub"],
  2: ["mar", "mrt", "mor", "mrz"],
  3: ["apr", "abr", "avr", "nis"],
  4: ["may", "mei", "mai", "mag"],
  5: ["jun", "giu", "haz"],
  6: ["jul", "tem", "lug"],
  7: ["aug", "ago", "aou", "agu"],
  8: ["sep", "set", "eyl"],
  9: ["oct", "okt", "out", "ott", "eki"],
  10: ["nov", "kas"],
  11: ["dec", "dez", "dic", "ara"]
};
var BY_WORD = new Map(Object.entries(TABLE).flatMap(([i, words]) => words.map((w) => [w, Number(i)])));
var MONTH_PREFIXES = [...BY_WORD.keys(), "jui"];
var MONTH_PATTERN = `(?:${MONTH_PREFIXES.join("|")})[\\p{L}]{0,8}\\.?`;
// src/lib/family-model.json
var family_model_default = {
  families: ["Consulting & strategy", "Customer support & service", "Data, analytics & AI", "Design & UX", "Finance & accounting", "HR & recruiting", "Hardware & engineering", "Healthcare & life sciences", "IT, cloud & security", "Marketing & communications", "Operations & supply chain", "Product & project management", "Research & academia", "Risk, compliance & legal", "Sales & account management", "Software engineering"],
  totals: [560, 114, 1728, 53, 1946, 197, 369, 139, 667, 311, 477, 628, 1063, 897, 760, 1511],
  vocab: { "2026": [0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], "2027": [0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 4, 0, 0, 2, 0, 0], solution: [1, 0, 8, 0, 0, 0, 0, 0, 9, 0, 0, 1, 1, 0, 6, 1], architect: [2, 0, 9, 2, 0, 0, 3, 0, 10, 0, 0, 0, 0, 0, 0, 2], "skill:excel": [26, 5, 50, 0, 94, 7, 1, 2, 9, 11, 21, 18, 3, 20, 10, 13], "skill:sql": [4, 0, 104, 0, 16, 0, 0, 0, 5, 2, 1, 12, 0, 16, 0, 40], "skill:python": [6, 1, 152, 0, 21, 0, 26, 1, 23, 0, 1, 4, 58, 24, 2, 77], "skill:compliance": [12, 6, 25, 0, 96, 11, 10, 16, 36, 2, 27, 26, 3, 87, 20, 36], "skill:aws": [0, 1, 29, 0, 0, 0, 0, 0, 23, 1, 0, 5, 0, 2, 7, 44], "skill:gcp": [0, 0, 29, 0, 0, 0, 0, 8, 12, 1, 0, 4, 0, 0, 7, 17], "skill:azure": [1, 1, 46, 0, 1, 0, 0, 1, 24, 1, 0, 7, 0, 3, 5, 41], "skill:spark": [0, 1, 30, 0, 0, 0, 0, 0, 0, 1, 0, 1, 4, 2, 2, 4], "skill:machine learning": [9, 0, 69, 0, 9, 2, 4, 0, 4, 1, 0, 5, 35, 9, 1, 18], "skill:snowflake": [0, 0, 17, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 2], "skill:databricks": [0, 1, 49, 1, 0, 0, 0, 0, 7, 0, 0, 4, 0, 4, 7, 11], "skill:product management": [0, 3, 11, 4, 0, 0, 6, 2, 1, 4, 0, 45, 0, 3, 3, 18], "skill:communication skills": [49, 11, 70, 3, 91, 12, 23, 10, 31, 39, 32, 31, 78, 42, 41, 42], financial: [4, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0], analyst: [7, 0, 40, 0, 50, 3, 0, 1, 5, 0, 0, 20, 0, 8, 1, 0], busines: [15, 0, 13, 0, 17, 3, 0, 0, 3, 0, 3, 28, 2, 3, 27, 1], model: [0, 0, 1, 0, 3, 0, 2, 0, 0, 0, 0, 0, 7, 5, 0, 0], innovation: [1, 0, 0, 2, 3, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], "skill:us gaap": [0, 0, 1, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:sap": [16, 4, 9, 0, 51, 2, 0, 0, 7, 1, 15, 5, 0, 2, 3, 5], "skill:reconciliation": [0, 0, 5, 0, 56, 2, 0, 1, 0, 0, 0, 3, 0, 2, 0, 5], "skill:payments": [4, 8, 9, 0, 53, 4, 6, 6, 7, 7, 14, 16, 0, 24, 24, 29], security: [0, 0, 1, 0, 0, 0, 0, 0, 33, 1, 0, 1, 0, 3, 1, 0], detection: [0, 0, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0], "skill:budgeting": [37, 0, 46, 1, 100, 4, 26, 7, 21, 12, 12, 27, 19, 37, 19, 39], "skill:audit": [1, 1, 2, 0, 110, 7, 3, 8, 16, 2, 6, 3, 1, 49, 1, 5], "skill:stakeholder management": [60, 8, 122, 9, 141, 28, 22, 13, 64, 34, 54, 84, 40, 84, 98, 53], "skill:risk management": [1, 0, 9, 0, 35, 3, 7, 2, 14, 1, 4, 6, 1, 62, 4, 15], engine: [2, 3, 49, 0, 0, 0, 46, 0, 30, 0, 2, 0, 0, 1, 9, 126], phd: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 127, 0, 0, 0], position: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 70, 0, 0, 0], software: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 99], clinical: [0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 1, 0, 0, 1], care: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1], research: [1, 0, 12, 0, 0, 0, 6, 3, 0, 1, 0, 1, 25, 0, 1, 2], "skill:typescript": [0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 32], "skill:c#": [0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 32], "skill:.net": [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 3, 1, 20], "skill:agile/scrum": [6, 0, 25, 3, 8, 1, 1, 1, 15, 3, 6, 23, 0, 8, 9, 58], consultant: [51, 0, 12, 2, 8, 6, 0, 2, 14, 3, 1, 0, 0, 18, 1, 1], data: [4, 0, 107, 0, 3, 0, 0, 0, 2, 0, 1, 0, 4, 2, 0, 1], "skill:financial modelling": [0, 0, 0, 0, 14, 1, 0, 0, 0, 0, 1, 0, 0, 4, 0, 1], "skill:forecasting": [13, 0, 19, 0, 68, 0, 1, 2, 4, 1, 9, 6, 3, 2, 48, 1], science: [1, 0, 10, 0, 0, 0, 0, 2, 0, 1, 0, 0, 5, 0, 0, 2], engineer: [0, 0, 14, 0, 0, 0, 6, 0, 1, 0, 1, 0, 0, 0, 0, 11], manag: [27, 0, 8, 0, 28, 5, 3, 3, 14, 13, 15, 58, 0, 16, 54, 9], finance: [11, 0, 2, 0, 58, 0, 0, 0, 5, 0, 0, 0, 2, 6, 0, 0], administration: [0, 0, 1, 0, 2, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], insight: [0, 0, 4, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], report: [0, 0, 2, 0, 9, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0], "skill:consolidation": [3, 0, 8, 0, 30, 1, 1, 0, 6, 1, 6, 1, 1, 2, 0, 4], "skill:java": [0, 1, 8, 0, 1, 0, 0, 0, 8, 0, 0, 1, 1, 3, 2, 58], "skill:kotlin": [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 11], "skill:linux": [0, 0, 4, 0, 0, 0, 1, 0, 11, 0, 0, 1, 0, 0, 1, 25], "skill:c++": [0, 0, 8, 0, 3, 0, 6, 0, 2, 0, 0, 0, 8, 5, 0, 42], "skill:android": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5], scientist: [0, 2, 22, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1], "skill:docker": [0, 0, 19, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 38], "skill:ci/cd": [0, 0, 29, 0, 0, 0, 1, 0, 12, 0, 0, 8, 0, 3, 0, 47], director: [0, 0, 1, 0, 4, 3, 2, 4, 2, 3, 1, 4, 0, 1, 8, 1], product: [1, 0, 4, 6, 1, 0, 0, 0, 1, 3, 0, 44, 0, 2, 0, 1], analysi: [0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 1, 5, 0, 0, 0], indirect: [0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], tax: [0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:tax": [5, 0, 4, 0, 73, 9, 1, 1, 4, 0, 3, 6, 71, 9, 2, 4], "skill:vat": [0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], advisory: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], associate: [7, 0, 3, 0, 15, 3, 1, 3, 2, 1, 2, 1, 5, 1, 7, 0], esg: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], assurance: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1], assistant: [0, 0, 1, 0, 3, 0, 0, 0, 0, 1, 1, 0, 17, 2, 11, 0], dond: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], centre: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], cognition: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], system: [0, 0, 0, 0, 0, 1, 9, 0, 4, 0, 1, 0, 11, 1, 1, 1], development: [0, 0, 0, 0, 1, 0, 1, 2, 0, 0, 3, 0, 3, 1, 24, 6], executive: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0], project: [1, 0, 0, 0, 3, 0, 1, 0, 0, 0, 3, 21, 5, 3, 1, 0], group: [3, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 2, 1, 0, 0, 0], controll: [0, 0, 0, 0, 55, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:ifrs": [0, 0, 2, 0, 39, 0, 0, 0, 2, 0, 0, 1, 0, 11, 0, 0], "skill:fp&a": [5, 0, 2, 0, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:treasury": [0, 0, 4, 0, 26, 0, 0, 0, 1, 0, 0, 2, 0, 8, 1, 2], sal: [0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 33, 0], representative: [0, 4, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 13, 0], bsc: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1, 0, 1, 0, 0, 0], msc: [0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0], mechanical: [0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 1, 0, 1, 0, 0, 0], procurement: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0], "skill:power bi": [2, 0, 55, 0, 31, 1, 0, 1, 1, 1, 7, 4, 0, 11, 0, 1], sap: [12, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1, 0, 0, 0, 2], excellence: [0, 0, 4, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0], sustainability: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1], mechanic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], material: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 5, 0, 4, 0, 0, 0], machine: [0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], learn: [0, 0, 7, 0, 0, 2, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], "skill:node.js": [0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 6], "skill:pytorch": [0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 1], brand: [0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 1, 0, 0, 0, 0, 0], design: [0, 0, 4, 10, 0, 0, 5, 0, 1, 1, 1, 0, 10, 0, 0, 1], international: [0, 0, 1, 0, 0, 5, 2, 0, 0, 0, 0, 0, 1, 1, 3, 0], key: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], account: [0, 0, 0, 0, 27, 0, 1, 0, 0, 0, 0, 0, 0, 0, 63, 0], custom: [0, 5, 4, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 8, 0], support: [0, 4, 0, 0, 2, 1, 0, 0, 5, 0, 0, 0, 1, 0, 1, 0], develop: [0, 0, 8, 0, 0, 0, 1, 0, 2, 2, 0, 3, 1, 1, 5, 37], "skill:airflow": [0, 0, 11, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1], "skill:dbt": [0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], quantum: [0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 7, 0, 0, 2], measurement: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 1], investment: [1, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], bank: [1, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 0, 2, 1, 0, 0], succes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], equity: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], accountant: [0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:netsuite": [0, 0, 1, 0, 10, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1], workday: [8, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], candidate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 15, 0, 0, 0], spatial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], statistic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], field: [0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 1, 0], sensor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1], team: [0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 7, 2, 0, 2, 1, 3], talent: [0, 0, 0, 0, 2, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], retail: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0], ecosystem: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], from: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0], health: [0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 3, 1, 2, 0], governance: [0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1], affair: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0], market: [0, 0, 3, 0, 2, 1, 0, 0, 1, 49, 0, 0, 0, 2, 3, 0], communication: [0, 0, 0, 0, 0, 1, 0, 0, 0, 11, 0, 0, 2, 0, 0, 0], photonic: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0], integrated: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 4, 0, 1, 0], circuit: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], plant: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0], interaction: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], strategy: [17, 0, 1, 0, 0, 0, 1, 2, 0, 0, 1, 0, 1, 2, 0, 0], school: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], management: [8, 3, 0, 0, 2, 4, 0, 1, 4, 1, 19, 5, 1, 7, 0, 0], food: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 1, 0, 0], "skill:oracle": [3, 0, 3, 0, 5, 0, 0, 0, 1, 1, 3, 0, 0, 0, 1, 5], "skill:php": [0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 2], strategic: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 8, 0], consult: [4, 0, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0], staff: [0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 3, 0, 0, 0, 11], applied: [0, 0, 5, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0], physic: [0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 0, 0, 4, 0, 0, 0], enterprise: [3, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 11, 0], student: [0, 0, 1, 0, 7, 0, 1, 0, 0, 2, 2, 2, 3, 1, 0, 0], "skill:javascript": [0, 1, 5, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 22], "skill:react": [0, 0, 2, 0, 1, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 30], "skill:swift": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 0, 1, 1, 8], hse: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0], advisor: [2, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 1, 0], direct: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:cpa/aca/acca": [0, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], proces: [0, 0, 1, 0, 3, 0, 3, 0, 0, 0, 1, 0, 1, 1, 0, 0], integration: [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0], "skill:tableau": [4, 0, 23, 0, 6, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0], area: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0], experienced: [1, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], risk: [0, 0, 2, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 48, 1, 0], technical: [0, 1, 1, 0, 1, 0, 1, 1, 4, 0, 1, 12, 2, 1, 2, 2], technology: [4, 0, 0, 0, 0, 0, 1, 0, 2, 0, 3, 1, 1, 1, 1, 0], printed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], footwear: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], cent: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], test: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 1], operation: [0, 1, 2, 0, 2, 2, 2, 0, 1, 1, 16, 1, 0, 0, 0, 1], analytic: [3, 0, 19, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], tech: [1, 0, 3, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], corporate: [0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 2, 0, 0, 1, 1, 0], control: [0, 0, 2, 0, 4, 0, 1, 0, 0, 0, 1, 0, 11, 8, 1, 1], "skill:kubernetes": [0, 0, 11, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 3, 1, 51], "skill:terraform": [0, 0, 8, 0, 0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0, 9], postdoc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0], optical: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 7, 0, 0, 0], professor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14, 0, 0, 0], process: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], transformation: [10, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], performance: [5, 0, 3, 0, 0, 3, 0, 0, 0, 0, 1, 1, 2, 0, 0, 1], knowledge: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], recruit: [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], event: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 1, 0, 0, 0], phase: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], metrology: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], devop: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 10], audit: [0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], servic: [1, 1, 0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], dynamic: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0], light: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], net: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], credit: [0, 0, 1, 0, 5, 0, 0, 0, 0, 0, 0, 1, 0, 9, 0, 0], commerce: [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0], specialist: [0, 0, 3, 1, 8, 2, 1, 3, 13, 9, 4, 2, 0, 14, 1, 0], digital: [3, 0, 0, 0, 2, 1, 3, 0, 1, 10, 0, 2, 4, 3, 3, 0], "skill:cfa": [0, 0, 2, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 1], regional: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], "skill:tensorflow": [0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2], content: [0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0, 1, 0, 0, 0], compliance: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 1, 0, 13, 0, 0], automation: [0, 0, 3, 0, 0, 1, 1, 0, 3, 1, 0, 0, 0, 0, 0, 1], trade: [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0], medior: [1, 0, 3, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 3], "skill:rust": [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 7], leadership: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0], nike: [3, 0, 0, 1, 2, 0, 0, 0, 0, 4, 2, 0, 0, 0, 1, 0], inc: [2, 0, 0, 1, 2, 0, 0, 0, 0, 4, 1, 0, 0, 0, 1, 0], creation: [2, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0], "skill:kyc/aml": [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 12, 0, 1], experience: [0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], quality: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 4, 1, 2], logistic: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0], optimiz: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], modell: [0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 12, 1, 0, 0], tool: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1, 0, 1], regulatory: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 3, 0, 0], chemical: [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0], legal: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0], offic: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 10, 0, 0], expert: [0, 1, 1, 0, 2, 2, 1, 0, 0, 1, 3, 0, 0, 12, 1, 1], delivery: [3, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0], synthetic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], postdoctoral: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], decision: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], enablement: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0], plann: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 1, 0, 0, 0], graduation: [0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 2, 0, 3], general: [0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0], production: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 1, 0, 0, 0], experimental: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], matt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], "4hana": [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], supply: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0], chain: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0], mgr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], neuroscience: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0], backend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15], proposal: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0], ship: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0], quant: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], driven: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1], steel: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], transaction: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], monitor: [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 2, 4, 0, 0], scenario: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], application: [0, 2, 0, 0, 0, 0, 1, 0, 5, 0, 1, 0, 1, 0, 1, 1], facility: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], employee: [0, 0, 0, 0, 0, 3, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0], ocean: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], beverage: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], french: [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], language: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], assignment: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2], hbo: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], own: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], crowdstrike: [0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0], large: [0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 1, 0, 1, 0], growth: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0], safety: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 4, 0, 0], duty: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], collection: [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], industrial: [0, 0, 2, 3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], parthenon: [4, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], electrical: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 0, 0], due: [2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], diligence: [2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], commercial: [3, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0], work: [0, 0, 1, 0, 7, 0, 0, 0, 0, 2, 2, 1, 0, 1, 0, 0], trad: [1, 0, 1, 0, 10, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 2], "skill:scala": [0, 1, 6, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9], treasury: [0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], off: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], cycle: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], resourc: [0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], writ: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0], sourc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0], cybersecurity: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], partn: [0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 0, 0, 0, 1, 4, 1], engagement: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 4, 0], forward: [0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], deployed: [0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], farm: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], emission: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], iii: [0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], magnetic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], igt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], cloud: [0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0], track: [0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 3, 2, 0, 0], euv: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], install: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], social: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0], based: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 6, 0, 0, 0], recycl: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], "skill:kafka": [0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 16], operational: [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 1, 2, 0, 0], category: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0], cyb: [0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0], circular: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], quantitative: [0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], computational: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], manufactur: [3, 0, 1, 0, 1, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0], industry: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0], generative: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], scientific: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], contract: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0], operator: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 1, 0], economic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], domain: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], lead: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 1, 1, 1], java: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], "skill:ios": [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 6], generation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], consultancy: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], framework: [0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], theory: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], auditor: [0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], counsel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0], mobility: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], transition: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], acros: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], python: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], diagnostic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], platform: [0, 0, 2, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 6], cost: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], asset: [1, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], paid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0], network: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1], infrastructure: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 2], internal: [0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], improvement: [1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], advanced: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0], acces: [0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 1, 0, 0, 0], op: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], repair: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], warehouse: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], gtm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0], coe: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], law: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0], adaptive: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], building: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], study: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], macro: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], physical: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], identity: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], office: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 0], vie: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], benelux: [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0], intelligence: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0], vice: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], president: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], unit: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0], comput: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1], high: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 0, 0, 0], handl: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], aw: [0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], service: [0, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 0], impact: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], speak: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0], front: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], end: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], future: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], medical: [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0], msca: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 6, 0, 0, 0], motion: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], external: [0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], canc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], non: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0], hardware: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0, 0, 0], space: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], mid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1], implementation: [0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], relation: [0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0], foundation: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0], imag: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0], radar: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], flow: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], value: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], stack: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9], acquisition: [0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], expertise: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], search: [0, 0, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0], offshore: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], client: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0], single: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], functional: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 1], optic: [0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], campaign: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0], frontend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], mufg: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], twin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], sustainable: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0], marine: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0], gene: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], suppli: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0], continuou: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], site: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], mast: [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], thesi: [1, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], clock: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], investigation: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0], energy: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 1, 0], assembl: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], multi: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], steer: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], io: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], two: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], cell: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], subcontract: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0], analist: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], unreal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], payroll: [0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], build: [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0], optimization: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], change: [2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0] }
};

// src/lib/fit.ts
var NOT_THE_WORK = new Set([
  "the",
  "and",
  "for",
  "with",
  "all",
  "genders",
  "gender",
  "senior",
  "junior",
  "sr",
  "jr",
  "lead",
  "head",
  "principal",
  "intern",
  "internship",
  "stage",
  "stagiair",
  "graduate",
  "trainee",
  "traineeship",
  "entry",
  "level",
  "programme",
  "program",
  "emea",
  "europe",
  "european",
  "global",
  "nl",
  "netherlands",
  "dutch",
  "remote",
  "hybrid",
  "amsterdam",
  "rotterdam",
  "utrecht",
  "eindhoven",
  "the hague",
  "months",
  "month",
  "year",
  "full",
  "part",
  "time",
  "fulltime",
  "parttime",
  "english",
  "speaking",
  "start",
  "starting",
  "new",
  "open"
]);
function words(text) {
  return text.toLowerCase().replace(/&amp;/g, "&").split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^[.]+|[.]+$/g, "")).filter((w) => w.length >= 3 && !NOT_THE_WORK.has(w));
}
var stem = (w) => w.replace(/(ing|ers|er|ies|es|s)$/, "");
var lastStems = new Set;

// src/lib/field.ts
var M = family_model_default;
var V = Object.keys(M.vocab).length;
var ALPHA = 0.5;
function familyPosterior(tokens) {
  const known = tokens.filter((t) => M.vocab[t] !== undefined);
  if (known.length === 0) {
    return null;
  }
  const logits = M.families.map((_, f) => known.reduce((sum2, t) => sum2 + Math.log((M.vocab[t][f] + ALPHA) / (M.totals[f] + ALPHA * V)), 0));
  const damp = known.length ** 0.25;
  const scaled = logits.map((l) => l / damp);
  const top = Math.max(...scaled);
  const exp = scaled.map((l) => Math.exp(l - top));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}
var titleTokens = (text) => words(text).map(stem);
var skillTokens = (skills) => [...skills].map((s) => `skill:${s.toLowerCase()}`);
var cache = new WeakMap;
var FAMILIES = M.families;
function guessFamily(title, skills) {
  const post = familyPosterior([...titleTokens(title), ...skillTokens(skills)]);
  if (!post) {
    return null;
  }
  const best = Math.max(...post);
  return best >= 0.6 ? M.families[post.indexOf(best)] : null;
}

// src/lib/languages.ts
var LANGUAGES = ["german", "french", "spanish", "italian", "portuguese", "polish", "czech", "greek", "swedish", "norwegian", "danish", "finnish", "turkish", "arabic", "russian", "japanese", "chinese", "mandarin", "korean", "hungarian", "romanian", "bulgarian", "ukrainian", "hebrew", "hindi", "thai", "vietnamese", "indonesian"];
var ONE = `(?:${LANGUAGES.join("|")})`;
var LIST = new RegExp(`\\b(${ONE}(?:\\s*(?:&|and|/|,|or)\\s*${ONE})*)[\\s-]*(?:speaking|speaker|speakers|language skills)`, "gi");
var NATIVE = new RegExp(`\\b(?:native|fluent|bilingual)\\s+(?:in\\s+)?(${ONE})\\b`, "gi");

// src/lib/skills.ts
var RULES = [
  ["excel", "tool", /\b(ms |microsoft )?excel\b(?! (in|at|as|under)\b)/],
  ["vba", "tool", /\bvba\b/],
  ["power bi", "tool", /\bpower ?bi\b/],
  ["tableau", "tool", /\btableau\b/],
  ["looker", "tool", /\blooker( studio)?\b/],
  ["alteryx", "tool", /\balteryx\b/],
  ["sql", "tool", /\bsql\b/],
  ["python", "tool", /\bpython\b/],
  ["sas", "tool", /\bsas\b(?= (programming|software|code|and|,)|\s*,)/],
  ["sap", "tool", /\bsap\b/],
  ["oracle", "tool", /\boracle\b/],
  ["netsuite", "tool", /\bnetsuite\b/],
  ["workday", "tool", /\bworkday (hcm|extend|financials|adaptive|prism|studio|integration|reporting)\b/],
  ["salesforce", "tool", /\bsalesforce\b/],
  ["hubspot", "tool", /\bhubspot\b/],
  ["jira", "tool", /\bjira\b/],
  ["confluence", "tool", /\bconfluence\b/],
  ["sharepoint", "tool", /\bsharepoint\b/],
  ["power automate", "tool", /\bpower (automate|apps)\b/],
  ["figma", "tool", /\bfigma\b/],
  ["photoshop", "tool", /\bphotoshop\b/],
  ["powerpoint", "tool", /\bpowerpoint\b/],
  ["crm", "tool", /\bcrm\b/],
  ["erp", "tool", /\berp\b/],
  ["google analytics", "tool", /\bgoogle analytics\b/],
  ["java", "tool", /\bjava\b/],
  ["kotlin", "tool", /\bkotlin\b/],
  ["scala", "tool", /\bscala\b/],
  ["javascript", "tool", /\bjavascript\b/],
  ["typescript", "tool", /\btypescript\b/],
  ["react", "tool", /\breact(\.js|js)?\b(?!\s+(to|quickly|fast|swiftly|well|appropriately|positively))/],
  ["node.js", "tool", /\bnode\.js\b|\bnodejs\b/],
  ["vue", "tool", /\bvue(\.js)?\b/],
  ["angular", "tool", /\bangular\b/],
  ["rust", "tool", /\brust\b/],
  ["c++", "tool", /\bc\+\+/],
  ["c#", "tool", /\bc#/],
  [".net", "tool", /\.net\b/],
  ["php", "tool", /\bphp\b/],
  ["ruby on rails", "tool", /\bruby on rails\b/],
  ["android", "tool", /\bandroid (development|sdk|apps?)\b|\bkotlin\b/],
  ["ios", "tool", /\bios (development|apps?|sdk)\b|\bswiftui\b/],
  ["aws", "tool", /\baws\b|\bamazon web services\b/],
  ["azure", "tool", /\bazure\b/],
  ["gcp", "tool", /\bgcp\b|\bgoogle cloud\b/],
  ["kubernetes", "tool", /\bkubernetes\b|\bk8s\b/],
  ["docker", "tool", /\bdocker\b/],
  ["terraform", "tool", /\bterraform\b/],
  ["git", "tool", /\bgit(hub|lab)?\b/],
  ["linux", "tool", /\blinux\b/],
  ["snowflake", "tool", /\bsnowflake\b/],
  ["dbt", "tool", /\bdbt\b/],
  ["databricks", "tool", /\bdatabricks\b/],
  ["spark", "tool", /\b(apache |py)spark\b/],
  ["kafka", "tool", /\bkafka\b/],
  ["airflow", "tool", /\bairflow\b/],
  ["pytorch", "tool", /\bpytorch\b/],
  ["tensorflow", "tool", /\btensorflow\b/],
  ["matlab", "tool", /\bmatlab\b/],
  ["cad", "tool", /\b(autocad|solidworks|catia)\b|\bcad (software|design|tools)\b/],
  ["plc", "tool", /\bplc (programming|systems)\b|\bscada\b/],
  ["ifrs", "skill", /\bifrs\b/],
  ["us gaap", "skill", /\b(us|u\.s\.) ?gaap\b|\bgaap\b/],
  ["dutch gaap", "skill", /\b(dutch|nl) gaap\b/],
  ["audit", "skill", /\baudit(ing)?\b/],
  ["tax", "skill", /\btax (law|advice|compliance|reporting|planning)\b|\bcorporate tax\b|\bvat\b/],
  ["transfer pricing", "skill", /\btransfer pricing\b/],
  ["treasury", "skill", /\btreasury\b/],
  ["consolidation", "skill", /\b(financial |group )?consolidation\b/],
  ["reconciliation", "skill", /\breconciliation/],
  ["budgeting", "skill", /\bbudgeting\b/],
  ["forecasting", "skill", /\bforecasting\b/],
  ["fp&a", "skill", /\bfp&a\b/],
  ["financial modelling", "skill", /\bfinancial model(l)?ing\b/],
  ["financial reporting", "skill", /\bfinancial reporting\b|\bmanagement reporting\b/],
  ["internal controls", "skill", /\binternal controls?\b/],
  ["risk management", "skill", /\brisk management\b/],
  ["valuation", "skill", /\bvaluation\b/],
  ["due diligence", "skill", /\bdue diligence\b/],
  ["m&a", "skill", /\bm&a\b|\bmergers and acquisitions\b/],
  ["kyc/aml", "skill", /\b(kyc|aml)\b/],
  ["regulatory reporting", "skill", /\bregulatory reporting\b/],
  ["cpa/aca/acca", "skill", /\b(cpa|aca|acca|cima)\b/],
  ["cfa", "skill", /\bcfa\b/],
  ["machine learning", "skill", /\bmachine learning\b/],
  ["deep learning", "skill", /\bdeep learning\b/],
  ["nlp", "skill", /\bnlp\b|\bnatural language processing\b/],
  ["data analysis", "skill", /\bdata analy(sis|tics)\b/],
  ["statistics", "skill", /\bstatistical (analysis|modelling|methods)\b|\bstatistics\b/],
  ["a/b testing", "skill", /\ba\/b test/],
  ["etl", "skill", /\betl\b|\bdata pipelines?\b/],
  ["data modelling", "skill", /\bdata model(l)?ing\b/],
  ["data engineering", "skill", /\bdata engineering\b/],
  ["data science", "skill", /\bdata science\b/],
  ["ci/cd", "skill", /\bci\/cd\b/],
  ["rest apis", "skill", /\b(rest(ful)?|web) apis?\b/],
  ["microservices", "skill", /\bmicroservices?\b/],
  ["cybersecurity", "skill", /\bcyber ?security\b|\binformation security\b/],
  ["devops", "skill", /\bdevops\b/],
  ["systems engineering", "skill", /\bsystems engineering\b/],
  ["embedded systems", "skill", /\bembedded (systems|software)\b|\bfirmware\b/],
  ["project management", "skill", /\bproject manag/],
  ["program management", "skill", /\bprogram(me)? manag/],
  ["product management", "skill", /\bproduct manag/],
  ["agile/scrum", "skill", /\b(agile|scrum|kanban)\b/],
  ["prince2", "skill", /\bprince ?2\b|\bpmp\b/],
  ["six sigma", "skill", /\bsix sigma\b/],
  ["process improvement", "skill", /\bprocess improvement\b|\bcontinuous improvement\b/],
  ["stakeholder management", "skill", /\bstakeholder (management|engagement|communication)\b|\bmanag(e|ing) stakeholders\b/],
  ["business analysis", "skill", /\bbusiness analy(sis|st)\b/],
  ["requirements gathering", "skill", /\brequirements? (gathering|analysis|elicitation)\b/],
  ["change management", "skill", /\bchange management\b/],
  ["vendor management", "skill", /\bvendor management\b|\bsupplier management\b/],
  ["negotiation", "skill", /\bnegotiation\b|\bnegotiating\b/],
  ["business development", "skill", /\bbusiness development\b/],
  ["account management", "skill", /\baccount manag/],
  ["lead generation", "skill", /\blead generation\b/],
  ["customer success", "skill", /\bcustomer success\b/],
  ["procurement", "skill", /\bprocurement\b|\bpurchasing\b/],
  ["supply chain", "skill", /\bsupply chain\b/],
  ["inventory management", "skill", /\binventory (management|control)\b/],
  ["demand planning", "skill", /\bdemand planning\b|\bs&op\b/],
  ["quality management", "skill", /\biso ?9001\b|\bquality management\b/],
  ["seo", "skill", /\bseo\b/],
  ["sem", "skill", /\bsem\b|\bgoogle ads\b|\bppc\b/],
  ["social media", "skill", /\bsocial media\b/],
  ["content marketing", "skill", /\bcontent (marketing|creation|strategy)\b/],
  ["copywriting", "skill", /\bcopywriting\b/],
  ["email marketing", "skill", /\bemail marketing\b/],
  ["marketing automation", "skill", /\bmarketing automation\b/],
  ["brand management", "skill", /\bbrand (management|strategy)\b/],
  ["market research", "skill", /\bmarket research\b/],
  ["recruitment", "skill", /\btalent acquisition\b|\brecruitment (specialist|consultant|marketing|experience in)\b/],
  ["payroll", "skill", /\bpayroll\b/],
  ["hris", "skill", /\bhris\b/],
  ["employee relations", "skill", /\bemployee relations\b/],
  ["learning and development", "skill", /\blearning (and|&) development\b/],
  ["labour law", "skill", /\blabou?r law\b|\bemployment law\b/],
  ["gdpr", "skill", /\bgdpr\b/],
  ["communication skills", "skill", /\bcommunication skills\b/],
  ["analytical skills", "skill", /\banalytical (skills|mindset|thinking)\b/],
  ["presentation skills", "skill", /\bpresentation skills\b/]
];
var SKILLS = Object.fromEntries(RULES.map(([name, , pattern]) => [name, pattern]));
var SKILL_KIND = Object.fromEntries(RULES.map(([name, kind]) => [name, kind]));

// src/lib/engine.ts
var EURO_FORMAT = new Intl.NumberFormat("en-NL");
var derivedCache = new WeakMap;
var LEVELS = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director", "Not stated"];
var ROLE_MANAGER = /\b(account|product|project|program(me)?|brand|customer|client|relationship|partner(ship)?|community|content|social media|marketing|campaign|category|channel|sales|business development|change|release|delivery|service|vendor|procurement|implementation|onboarding|portfolio|risk|compliance|quality|solutions?|technical account|engagement)\s+(\w+\s+)?manager\b/i;
function levelFromYearsAndLabel(p) {
  const y = p.years_min;
  if (p.seniority === "Mid-Senior level") {
    return (y ?? 0) >= 5 ? "Senior" : "Mid";
  }
  if (p.seniority === "Internship") {
    return "Internship";
  }
  if (p.seniority === "Entry level" || p.seniority === "Associate") {
    return "Entry";
  }
  if (p.seniority === "Director" || p.seniority === "Executive") {
    return "Director";
  }
  if (y != null) {
    return y <= 2 ? "Entry" : y <= 4 ? "Mid" : "Senior";
  }
  return "Not stated";
}
var JEV_LEVEL = { internship: "Internship", entry: "Entry", mid: "Mid", senior: "Senior", manager: "Manager", director: "Director" };
function isInternship(p) {
  if (p.role_kind) {
    return p.role_kind === "internship" || p.role_kind === "working_student";
  }
  return /\b(intern|internship|stagiair\w*|stage|meewerkstage|werkstudent|working student|student assistant)\b/i.test(p.title) || p.seniority === "Internship" || p.level_view === "Internship";
}
var LEVEL_NAMES = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director", "Not stated"];
function levelOf(p) {
  if (p.level_view && LEVEL_NAMES.includes(p.level_view)) {
    return p.level_view;
  }
  const read = p.level_jev ? JEV_LEVEL[p.level_jev] : undefined;
  if (read && (p.level_conf ?? 0) >= 0.8) {
    return read;
  }
  const t = p.title;
  if (/\b(director|vice president|vp\b|svp|evp|head of|head,|managing director|general manager|country manager|chief)\b/i.test(t)) {
    return "Director";
  }
  if (isInternship(p) || /\b(werkstudent|working student)\b/i.test(t)) {
    return "Internship";
  }
  if (/\b(trainee|traineeship)\b/i.test(t)) {
    return "Entry";
  }
  if (/\b(development|graduates?|leadership|talent|rotational|early careers?|future leaders?|young professionals?|fast ?track)\s+(programme|program|track|scheme)\b/i.test(t)) {
    return "Entry";
  }
  if (/\b(senior|sr\.?|staff|principal|architect)\b/i.test(t)) {
    return "Senior";
  }
  if (/\b(team ?lead|tech lead|lead |manager\b|supervisor|teamleider)/i.test(t)) {
    if (ROLE_MANAGER.test(t) && !/team ?lead/i.test(t)) {
      return levelFromYearsAndLabel(p);
    }
    return "Manager";
  }
  if (/\b(junior|jr\.?|graduate|starter|entry|associate|assistant|young professional)\b/i.test(t)) {
    return "Entry";
  }
  return levelFromYearsAndLabel(p);
}
// src/lib/industries.json
var industries_default = {
  "216": "Financial services",
  "'s Heeren Loo": "Health & life sciences",
  "12Build": "Software & internet",
  "4most": "Financial services",
  "9292 REISinformatiegroep bv": "IT services",
  "9altitudes Netherlands": "IT services",
  ABF: "Retail & e-commerce",
  "ABN AMRO Bank N.V.": "Banking",
  "ACCA Careers": "Accounting",
  "ADC Consulting": "Consulting",
  "AFAS Software": "Software & internet",
  "AFS Energy": "Energy & utilities",
  "AFS Group": "Financial services",
  "AIT Worldwide Logistics": "Transport & logistics",
  "AS Watson Benelux": "Retail & e-commerce",
  ASML: "Semiconductors",
  "AT7T9 werving &amp; selectie": "Staffing & recruiting",
  AURELIUS: "Financial services",
  "AXA XL": "Insurance",
  Abbott: "Health & life sciences",
  "Abroad Experience International Recruitment": "Manufacturing",
  "Accenture the Netherlands": "Consulting",
  Achmea: "Financial services",
  "Actemium Nederland": "Manufacturing",
  ActuCore: "Financial services",
  Acture: "Banking",
  "Ad Idem Consulting": "Manufacturing",
  Adyen: "Financial services",
  Aiden: "IT services",
  "Albert Heijn": "Retail & e-commerce",
  Alistar: "IT services",
  Alliander: "Construction",
  "Allison Red": "Manufacturing",
  Allseas: "Construction",
  "Almeerse Scholen Groep": "Education",
  "Alpina Group": "Financial services",
  "Alvarez &amp; Marsal": "Consulting",
  Amega: "Software & internet",
  "American Express": "Financial services",
  "Amoria Bond": "IT services",
  "Analytics Academy": "Government & non-profit",
  Andaz: "Hospitality & travel",
  "Angove Partners": "Insurance",
  Antler: "Financial services",
  Aon: "Financial services",
  Apolix: "IT services",
  "Applied Medical": "Health & life sciences",
  Arup: "Semiconductors",
  Atos: "Software & internet",
  "Ava Global Logistics": "Transport & logistics",
  Avanade: "IT services",
  "Avant groep": "Financial services",
  "Avery Dennison": "Manufacturing",
  Avisi: "IT services",
  Axelio: "IT services",
  "Axians NL": "IT services",
  "Axians | Data &amp; AI": "IT services",
  "Axivate Horeca Group": "Hospitality & travel",
  Ayvens: "Financial services",
  "B&amp;S": "Software & internet",
  "BAM Nederland": "Construction",
  BANVO: "Accounting",
  BAS: "Financial services",
  "BAUHAUS - Nederland": "Retail & e-commerce",
  "BDO Nederland": "Consulting",
  "BEERWULF®": "Hospitality & travel",
  BESTSELLER: "Food & consumer goods",
  "BMW Group": "Manufacturing",
  BONANA: "Consulting",
  "BPM Company": "IT services",
  "BYD EUROPE": "Manufacturing",
  "Baker Tilly Netherlands": "Financial services",
  "Bank Nederlandse Gemeenten": "Banking",
  "Bank of America": "Banking",
  Barclays: "Banking",
  "Basic-Fit": "Health & life sciences",
  Belastingdienst: "Government & non-profit",
  "Bender Groep": "Government & non-profit",
  Bentacera: "Financial services",
  "Beyond Meat": "Hospitality & travel",
  Binance: "Software & internet",
  "Bince - verbindt de zorg": "Health & life sciences",
  "Bit Traineeship": "Software & internet",
  BlackRock: "Financial services",
  "Blinck accountants &amp; adviseurs": "Accounting",
  "Blue Skies Group": "Food & consumer goods",
  "Blue Sky Group": "Financial services",
  BlueGem: "IT services",
  BlueNexus: "Government & non-profit",
  "Boels Rental": "Retail & e-commerce",
  "Bol Adviseurs": "Financial services",
  "Booking Boosters": "Media & marketing",
  "Booking Experts B.V.": "Software & internet",
  "Booking.com": "Software & internet",
  "Boomgaart &amp; Van Schaik": "Accounting",
  Boozt24: "Financial services",
  "Bouwhuis Enthoven B.V.": "Financial services",
  Brandweer: "Government & non-profit",
  Breinstein: "Consulting",
  "Breman Installatiegroep": "Construction",
  Bridg: "Software & internet",
  "Bridgewell Executive Search": "Hospitality & travel",
  "Bright Cape": "Consulting",
  "Bright New Leaders": "Staffing & recruiting",
  "BrightStone Group": "Financial services",
  Brightminds: "Consulting",
  "Brink Group": "Manufacturing",
  Brocacef: "Health & life sciences",
  "Brown &amp; McCrow": "Staffing & recruiting",
  Brunel: "Construction",
  "Built Different": "Software & internet",
  "Business interest": "IT services",
  "Buyers Edge Platform": "Hospitality & travel",
  CACEIS: "Banking",
  CAK: "Government & non-profit",
  "CGI Nederland": "IT services",
  CIBG: "Government & non-profit",
  CIMSOLUTIONS: "IT services",
  CSC: "Financial services",
  "CSU Cleaning Services": "Consulting",
  "Canon Production Printing": "Manufacturing",
  Capgemini: "IT services",
  "Career Control": "Staffing & recruiting",
  Cargill: "Manufacturing",
  "Cboe Global Markets": "Financial services",
  "Centraal Bureau voor de Statistiek": "Government & non-profit",
  Chemelex: "Semiconductors",
  Citi: "Banking",
  Cleverbase: "Software & internet",
  Coinmerce: "Financial services",
  "Commerzbank Digital Technology Centre Poland": "IT services",
  "Connect Group": "Energy & utilities",
  Constructif: "Construction",
  Coppa: "Consulting",
  "Corecom Consulting": "Software & internet",
  "Cosmetique Totale BV": "Health & life sciences",
  CowManager: "Software & internet",
  "Coöperatie VGZ": "Insurance",
  Craftr: "Health & life sciences",
  "Crowe Nederland": "Consulting",
  "CyBe Construction": "Construction",
  "DAF Trucks NV": "Manufacturing",
  DAS: "Legal",
  "DEMO Consultants": "Real estate",
  "DEPT®": "Media & marketing",
  "DFE Pharma": "Health & life sciences",
  "DG-Administratie B.V.": "Accounting",
  "DHL Express": "Transport & logistics",
  "DHL Supply Chain": "Transport & logistics",
  "DK Accountants &amp; Adviseurs": "Accounting",
  "DLA Piper": "Legal",
  DNV: "Government & non-profit",
  "DSV - Global Transport and Logistics": "Transport & logistics",
  "DSW Zorgverzekeraar": "Insurance",
  "DTE Capital Partners": "Financial services",
  "Da Vinci": "Financial services",
  Danone: "Manufacturing",
  DataGrow: "IT services",
  DataSnipper: "Software & internet",
  Databricks: "Software & internet",
  "De Cronos Groep": "Software & internet",
  "De Goudse": "Insurance",
  "De Graaf Bakeries": "Food & consumer goods",
  "De Hoop Terneuzen": "Construction",
  "De Klok Dranken": "Hospitality & travel",
  "De L'Europe Amsterdam": "Hospitality & travel",
  "De Mandemakers Groep": "Retail & e-commerce",
  "De Nieuwe Zaak | United Playgrounds": "Media & marketing",
  "De Rijke Group": "Transport & logistics",
  Deen: "Transport & logistics",
  Deftpower: "IT services",
  Deloitte: "Consulting",
  Denote: "Financial services",
  Denys: "Construction",
  Destinus: "Software & internet",
  "Doghouse Recruitment": "Software & internet",
  Dometic: "Manufacturing",
  "Douane Nederland": "Government & non-profit",
  "Dual Career Service": "Consulting",
  "Dura Vermeer": "Construction",
  "Dux Group": "Consulting",
  "EBN B.V.": "Consulting",
  "EG5 Special Risks Consultancy": "Consulting",
  "EMEA Recruitment": "Retail & e-commerce",
  "ENTER BV": "Consulting",
  EY: "Accounting",
  "Elevation Group": "Financial services",
  Emixa: "IT services",
  "Empower Recruitment BV": "Consulting",
  EnOcean: "Consulting",
  Eneco: "Energy & utilities",
  "Energie Data Services Nederland (EDSN) B.V.": "Energy & utilities",
  Enexis: "Energy & utilities",
  Entrust: "Software & internet",
  Episode: "Food & consumer goods",
  Equinix: "IT services",
  ErasmusTalent: "Software & internet",
  Essent: "Energy & utilities",
  Essentra: "Manufacturing",
  "Etac Group": "Health & life sciences",
  Etos: "Retail & e-commerce",
  Eurofins: "Health & life sciences",
  "Eurofins Food, Feed &amp; Water Benelux": "Hospitality & travel",
  Euronext: "Financial services",
  "European Medicines Agency": "Government & non-profit",
  "Everience Benelux": "Software & internet",
  Exact: "Software & internet",
  "FIT Product Owner Company": "IT services",
  FITZ: "Financial services",
  FME: "Manufacturing",
  "Facilicom Groep": "Consulting",
  "Faithful Jobs": "Health & life sciences",
  "Farm Frites": "Food & consumer goods",
  "Farm Trans": "Transport & logistics",
  Fastned: "Energy & utilities",
  "Feyter Group": "Manufacturing",
  Fifty5Blue: "Media & marketing",
  FinRecruit: "IT services",
  "Finalist - Maatschappelijk relevante IT": "Software & internet",
  "Finance Rebelz": "Financial services",
  "Flawless Workflow": "IT services",
  "Fleet Robotics": "Semiconductors",
  Flexport: "Transport & logistics",
  "Flowserve Corporation": "Manufacturing",
  "Fluke Corporation": "Semiconductors",
  Flynth: "Consulting",
  ForFarmers: "Food & consumer goods",
  "Fore Fiber": "Telecommunications",
  "Fornell Human Capital": "Consulting",
  "Forvis Mazars in the Netherlands": "Financial services",
  "Four+One": "Retail & e-commerce",
  "Frank Energie": "Energy & utilities",
  FrieslandCampina: "Food & consumer goods",
  Fugro: "Construction",
  Funda: "Software & internet",
  "Furore Conclusion": "Health & life sciences",
  "Futureproof Group B.V.": "IT services",
  "GXO Logistics, Inc.": "Transport & logistics",
  "Garanti BBVA International": "Banking",
  "Geely Auto Europe": "Manufacturing",
  Geldmaat: "Financial services",
  "Gemeente Zaanstad": "Government & non-profit",
  "Get There": "IT services",
  Gigs: "Construction",
  "Gisou by Negin Mirsalehi": "Food & consumer goods",
  Givaudan: "Manufacturing",
  "Golden Agri-Resources (GAR)": "Food & consumer goods",
  "Gomibo l Belsimpel": "Telecommunications",
  "Good Company": "Staffing & recruiting",
  "Grant Thornton Netherlands": "Accounting",
  "Greenberg Nielsen": "Software & internet",
  Greenchoice: "IT services",
  "Group of Butchers": "Food & consumer goods",
  "H.Z. Logistics": "Transport & logistics",
  HCLTech: "IT services",
  "HDN (Hypotheken Data Netwerk)": "IT services",
  HEMA: "Retail & e-commerce",
  "HUMANCAPiTAL BV": "Consulting",
  HZPC: "Hospitality & travel",
  Hadrian: "Software & internet",
  Handelsbanken: "Banking",
  Hanshow: "Software & internet",
  Harnham: "Retail & e-commerce",
  Harvest: "IT services",
  Haskoning: "Construction",
  Hays: "IT services",
  Heembouw: "IT services",
  Heijmans: "Construction",
  Henkel: "Manufacturing",
  HighRadius: "Software & internet",
  "Hiltermann Lease": "Financial services",
  "Hire.nl": "Accounting",
  "Holl &amp; Gort - Accountants en Belastingadviseurs": "Financial services",
  Hoogwegt: "Consulting",
  Hotelprofessionals: "Hospitality & travel",
  "Houlihan Lokey": "Banking",
  "House of Bèta": "Financial services",
  Huawei: "Telecommunications",
  "Human Source Group": "Construction",
  Hunkemöller: "Retail & e-commerce",
  "Hyatt Regency": "Hospitality & travel",
  Hypersolid: "IT services",
  "IFG Search": "Manufacturing",
  IFS: "Software & internet",
  "IG&amp;H": "Consulting",
  "IK Partners": "Financial services",
  "IMC Trading": "Financial services",
  IMPROVEN: "IT services",
  "ING Nederland": "Banking",
  "INNOCY B.V.": "IT services",
  "IQ Staffing": "Financial services",
  ITDS: "Banking",
  ITIS: "Construction",
  ITsPeople: "Consulting",
  "Impactsearch - Finance Recruitment": "Health & life sciences",
  ImpressiveGreenApple: "Financial services",
  "Index Hospitality Systems BV": "Hospitality & travel",
  "Info Support": "IT services",
  "Infrastructure IT Professionals": "IT services",
  Inkubis: "IT services",
  "Innovatiefonds Noord-Holland": "Financial services",
  Insify: "Transport & logistics",
  Intergamma: "Retail & e-commerce",
  "Ireckonu - Hotel Middleware &amp; CDP+": "IT services",
  Itility: "IT services",
  Iv: "Construction",
  "JBT Marel": "Manufacturing",
  "JD.COM": "Software & internet",
  JEX: "IT services",
  JPMorganChase: "Financial services",
  Jefferies: "Banking",
  "Jiffy Group": "Manufacturing",
  "JijenZij BV": "Manufacturing",
  Joanknecht: "Financial services",
  Jobgether: "Software & internet",
  Jobster: "Software & internet",
  "Johnson &amp; Johnson MedTech": "Health & life sciences",
  JouwWeb: "IT services",
  "Jumbo Supermarkten": "Retail & e-commerce",
  "Just Brands - Fashion &amp; Retail": "Food & consumer goods",
  "Just Good People": "Software & internet",
  "KARL LAGERFELD": "Food & consumer goods",
  "KK&amp;V Accountants B.V.": "Financial services",
  "KLG Europe": "Transport & logistics",
  "KPMG Nederland": "Financial services",
  KPN: "IT services",
  "KTI Installatietechniek": "Construction",
  "KUS Technology Corporation": "Manufacturing",
  "KWS Group": "Food & consumer goods",
  "Kader Group": "Consulting",
  "Kaemingk B.V.": "Retail & e-commerce",
  "Kamera Express": "Retail & e-commerce",
  "Kao EMEA &amp; Americas": "Food & consumer goods",
  "Kapres Technology": "Consulting",
  "Karsten International": "Manufacturing",
  "Kasparov Finance &amp; BI": "Transport & logistics",
  "Keiretsu Europe": "Media & marketing",
  "Kia Nederland": "Manufacturing",
  "Kiltoprak Financiers &amp; Trust Company NV": "Financial services",
  "Kiwa Nederland": "Consulting",
  "KnappeKoppen.work": "Accounting",
  Knitco: "IT services",
  Knivesandtools: "IT services",
  "Konings Maters Accountants &amp; Adviseurs": "Accounting",
  "Kraft Heinz": "Hospitality & travel",
  Kroll: "Consulting",
  "Kryne Opvolging": "Consulting",
  "Kuehne+Nagel": "Transport & logistics",
  "Kverneland Group": "Manufacturing",
  "L'Oréal": "Manufacturing",
  "LEMON search": "Staffing & recruiting",
  "LIME search": "Hospitality & travel",
  "LYNX Beleggen": "Financial services",
  "Lamb Weston EMEA": "Food & consumer goods",
  Landal: "Hospitality & travel",
  Laterite: "IT services",
  "Laudame Financials": "Financial services",
  "Lefebvre Sdu": "Software & internet",
  Lely: "Manufacturing",
  "Levy Global": "Financial services",
  "Levy Professionals": "Consulting",
  "Lidl Nederland": "Manufacturing",
  "Life Fitness  / Hammer Strength": "Health & life sciences",
  Linkedtalent: "Staffing & recruiting",
  Lobster: "Software & internet",
  "LvH Corporate Finance": "Financial services",
  "MG Motor Europe": "Manufacturing",
  "MK2 Software B.V.": "IT services",
  "MNP Solutions": "Consulting",
  "MPT Consultancy": "Consulting",
  MUFG: "Financial services",
  "Macquarie Group": "Financial services",
  Maiburg: "Retail & e-commerce",
  "Mainfreight Europe": "Transport & logistics",
  Mammoet: "Construction",
  Manometric: "Health & life sciences",
  "Marble. Solid Financials": "Financial services",
  MatchWornShirt: "Financial services",
  "Maven 11": "Financial services",
  "Maven Securities": "Financial services",
  "Maxem Energy Solutions": "Software & internet",
  "McCain Foods": "Food & consumer goods",
  "McFly &amp; Brown": "Software & internet",
  "McKinsey &amp; Company": "Manufacturing",
  Medtronic: "Health & life sciences",
  Mendix: "Software & internet",
  Merford: "Manufacturing",
  Metyis: "Consulting",
  "Michael Page": "Staffing & recruiting",
  Mileway: "Real estate",
  Milliman: "Consulting",
  Momentum: "Software & internet",
  Moonlit: "Software & internet",
  "Moore MKW": "Financial services",
  "Mploy Associates": "Financial services",
  MyWheels: "IT services",
  NAVARA: "IT services",
  NIO: "Manufacturing",
  "Nederlandse Loterij": "Hospitality & travel",
  Nedinsco: "Financial services",
  "Neema - Better Than a Bank": "Financial services",
  New10: "IT services",
  NewData: "Software & internet",
  NewRocket: "IT services",
  "Nexent Bank": "Banking",
  "Next Force Recruitment": "Hospitality & travel",
  "Next Ground": "Consulting",
  Nike: "Retail & e-commerce",
  Nomilk2day: "Food & consumer goods",
  "Novulo Nederland B.V.": "Media & marketing",
  "ONE Risk Advisory B.V.": "Consulting",
  ORTEC: "Consulting",
  "Oaklins Netherlands (B Corp™)": "Banking",
  Ohpen: "IT services",
  Oniverse: "Retail & e-commerce",
  Optiver: "Financial services",
  "Orange Business": "IT services",
  "Ormit Talent Nederland": "Transport & logistics",
  Outtask: "Energy & utilities",
  "P.A. Recruitment BE&amp;NL": "Telecommunications",
  "P1 Travel": "Consulting",
  "PA Consulting": "Consulting",
  "PIA Group Nederland": "Financial services",
  "PPHE Hotel Group": "Hospitality & travel",
  Pancompany: "IT services",
  "Picnic Technologies": "Retail & e-commerce",
  "Platform Science": "Software & internet",
  Ploegam: "Construction",
  "Plukon Food Group": "Financial services",
  PostNL: "Transport & logistics",
  Pricewise: "Software & internet",
  "Primo Marine": "Energy & utilities",
  "Principium Alpha": "Financial services",
  ProRail: "Transport & logistics",
  "Procter &amp; Gamble": "Manufacturing",
  "Prodrive Technologies": "Semiconductors",
  Profource: "Financial services",
  Progressive: "Financial services",
  "Provincie Flevoland": "Government & non-profit",
  PuurData: "IT services",
  "PwC Nederland": "Consulting",
  "Q-logic | Anders werken, samen groeien": "Consulting",
  QLS: "Transport & logistics",
  "QPS Netherlands B.V.": "Health & life sciences",
  "RAI Amsterdam": "Consulting",
  "RIXT.IT": "Transport & logistics",
  "RSM nl": "Financial services",
  "RTL Nederland": "Media & marketing",
  Rabobank: "Banking",
  "Rademaker BV": "Manufacturing",
  Ranpak: "Manufacturing",
  Ranshuijsen: "Software & internet",
  "Redcare Pharmacy": "Software & internet",
  Reed: "Consulting",
  Refresco: "Hospitality & travel",
  "Regeljelease.nl": "Financial services",
  "Relocate.me": "Software & internet",
  "Repligen Corporation": "Health & life sciences",
  Republiq: "Consulting",
  Respellion: "Software & internet",
  "Restaurant Company Europe (RCE)": "Hospitality & travel",
  Rewire: "Consulting",
  Risketeers: "Banking",
  RiverBank: "Banking",
  Riverty: "Financial services",
  "Robert Half": "Consulting",
  "Robert Walters": "Manufacturing",
  "Rockx Professionals": "Consulting",
  "Roem van Yerseke": "Food & consumer goods",
  "Royal A-ware": "Food & consumer goods",
  "Royal FloraHolland": "Transport & logistics",
  "RubyDeveloper.nl": "Software & internet",
  "S-RM": "Consulting",
  "SARIA Food &amp; Pharma": "Food & consumer goods",
  STEF: "Food & consumer goods",
  "STX Group": "Financial services",
  STËLZ: "Accounting",
  "SUM Accountants": "Financial services",
  SUREbusiness: "Insurance",
  Samotics: "Software & internet",
  "Sancovia Corporate Finance": "Consulting",
  "Sanoma Learning": "Software & internet",
  "Santander Corporate &amp; Investment Banking": "Banking",
  Scenius: "IT services",
  "Schipper Accountants": "Financial services",
  "Schuberg Philis": "IT services",
  "Secure Logistics": "Financial services",
  Sendcloud: "Software & internet",
  Shell: "Energy & utilities",
  Shipcloud: "Software & internet",
  "Shokudo Group": "Hospitality & travel",
  Sia: "Consulting",
  Simvia: "Software & internet",
  Sinvae: "Transport & logistics",
  "Sligro Food Group": "Retail & e-commerce",
  "Smurfit Westrock": "Manufacturing",
  "Social Deal": "Media & marketing",
  "Sociale Verzekeringsbank": "Government & non-profit",
  Sogeti: "IT services",
  "Solid Professionals": "Software & internet",
  "Sopra Steria": "Software & internet",
  "Spares In Motion": "Energy & utilities",
  "Sparke &amp; Keane": "Financial services",
  "Sprint Intermediair": "Staffing & recruiting",
  "Stadsbeheer BV, Software voor VTH-processen": "Software & internet",
  StaffingBird: "Banking",
  Stamhuis: "Construction",
  StarTimes: "Media & marketing",
  Starapple: "IT services",
  Stater: "Financial services",
  Station: "Software & internet",
  Stellantis: "Manufacturing",
  Sterksen: "IT services",
  "Stichting BKR": "IT services",
  "Stichting Rolderpers (Rolderpost.nl)": "Media & marketing",
  "Stolp+KAB adviseurs en accountants": "Financial services",
  Strukton: "Construction",
  "Studenten.net": "Software & internet",
  "Studievereniging In Duplo": "Education",
  Studyportals: "IT services",
  Suitsupply: "Retail & e-commerce",
  "Sumitomo Heavy Industries (Europe)": "Manufacturing",
  Swapfiets: "Food & consumer goods",
  "Swiss Sense": "Manufacturing",
  SynTouch: "Software & internet",
  "TADA Solutions": "IT services",
  TCWGlobal: "Retail & e-commerce",
  "TKH Airport Solutions": "Transport & logistics",
  TMC: "Consulting",
  "TMF Group": "Financial services",
  TOPdesk: "Software & internet",
  "Takkenkamp Groep": "Construction",
  "Talent&amp;Pro": "Financial services",
  "Taleron (formerly RocketPeople)": "Staffing & recruiting",
  "Tally Whitmore": "Retail & e-commerce",
  "Team EIFFEL": "Consulting",
  "Ten Brinke": "Real estate",
  Thales: "Transport & logistics",
  "That Recruitment Company": "Software & internet",
  "The Chain Company": "Software & internet",
  "The Greenery": "Retail & e-commerce",
  "The Headhunter Group": "Financial services",
  "The Relevance Group": "Software & internet",
  "The WellGear Group": "Energy & utilities",
  "Thermo Fisher Scientific": "Health & life sciences",
  Tiledmedia: "Software & internet",
  Tiqets: "Software & internet",
  "Together AI": "Software & internet",
  "Tomorrowmen™": "Media & marketing",
  "Tools4ever B.V.": "Software & internet",
  TopParken: "Hospitality & travel",
  "Trelleborg Group": "Manufacturing",
  "Trelleborg Sealing Solutions": "Construction",
  "Trend People": "Staffing & recruiting",
  "Triodos Bank": "Banking",
  "Turner &amp; Townsend": "Construction",
  "TvdW Administratieve Begeleiding B.V.": "Accounting",
  UNIQLO: "Retail & e-commerce",
  "UbiOps - Private AI on any infra": "IT services",
  "Uitvaartverzorging 'De Laatste Eer' B.V.": "Hospitality & travel",
  Unica: "Consulting",
  "Us3 Consulting": "IT services",
  VAROPreem: "Energy & utilities",
  VARRLYN: "Financial services",
  "VDK Groep": "Construction",
  "VDL Nederland": "Semiconductors",
  "VDL TBP Electronics": "Semiconductors",
  "VIDA Bioenergy": "Transport & logistics",
  "VX Company": "IT services",
  Valcon: "Consulting",
  "Vallei Accountants": "Consulting",
  "Vallei Control &amp; Navigate": "Accounting",
  Valueminds: "Consulting",
  "Van Asselt adviseurs &amp; accountants": "Financial services",
  "Van Hattum en Blankevoort": "Construction",
  "Van Lanschot Kempen": "Financial services",
  "Van Mossel Automotive Group": "Manufacturing",
  "Van Storm Recruitment": "Construction",
  "Van der Valk International B.V.": "Consulting",
  Vanderlande: "Manufacturing",
  Vandoren: "Construction",
  Vattenfall: "Energy & utilities",
  "Veiligheidsregio Rotterdam-Rijnmond": "Government & non-profit",
  "Veldsink Groep": "Insurance",
  "Veneficus - THE DATA BASE": "IT services",
  Venquis: "Software & internet",
  "Verder Liquids": "Manufacturing",
  "Vereniging Eigen Huis": "Financial services",
  "Verhoeven grondverzetmachines BV": "Manufacturing",
  "Verstegen accountants en adviseurs": "Financial services",
  Versuni: "Semiconductors",
  "Verzuimdata B.V.": "Software & internet",
  "Vesper Commercial Excellence": "Consulting",
  "Vibe Academy": "IT services",
  "Virtual Vaults": "Software & internet",
  VisionBI: "IT services",
  VitalFluid: "Manufacturing",
  "Vitec Autonet": "Software & internet",
  Voltiris: "Energy & utilities",
  "Volvo Financial Services": "Financial services",
  "Von Gahlen": "Health & life sciences",
  "Vos Transport Group": "Financial services",
  WLG: "IT services",
  "Walker &amp; Dunlop": "Financial services",
  "Waterschap Rivierenland": "Government & non-profit",
  "We ARE Renewables": "Energy & utilities",
  Weheat: "Energy & utilities",
  Whitevision: "Software & internet",
  "Wolters Kluwer": "Software & internet",
  XPENG: "Manufacturing",
  "XTRM development": "IT services",
  "Xccelerated | Part of Xebia": "Software & internet",
  "Yellowtail Conclusion": "Consulting",
  Yezzer: "Insurance",
  Yokogawa: "Manufacturing",
  "Young Financials": "Financial services",
  "ZIM Integrated Shipping Services": "Transport & logistics",
  Zanders: "Financial services",
  "Zasco B.V.": "Consulting",
  "Zeekr Europe": "Manufacturing",
  Zonneplan: "Energy & utilities",
  "Zorgorganisatie Eerste Lijn": "Health & life sciences",
  "Zurich Insurance": "Insurance",
  "a.s.r.": "Financial services",
  aaff: "Financial services",
  accenture: "Consulting",
  adyen: "Financial services",
  "alfa1 group": "IT services",
  asml: "Semiconductors",
  asqin: "Accounting",
  axelera: "Semiconductors",
  bol: "Retail & e-commerce",
  bolcom: "Retail & e-commerce",
  bynder: "Software & internet",
  catawiki: "Retail & e-commerce",
  cisco: "Software & internet",
  crisp: "Software & internet",
  damen: "Manufacturing",
  databricks: "Software & internet",
  "de Jong &amp; Laan": "Consulting",
  "de kroes bv": "Food & consumer goods",
  dept: "Media & marketing",
  elastic: "Software & internet",
  ey: "Accounting",
  flowtraders: "Financial services",
  fugro: "Energy & utilities",
  gategourmet: "Transport & logistics",
  heijmans: "Construction",
  hellofresh: "Food & consumer goods",
  "i4talent detachering": "Staffing & recruiting",
  iSpeedToLead: "Software & internet",
  "ilionx healthcare": "Health & life sciences",
  imc: "Financial services",
  ing: "Banking",
  medtronic: "Health & life sciences",
  miro: "Software & internet",
  mollie: "Financial services",
  mstack: "IT services",
  myTomorrows: "Health & life sciences",
  netflix: "Media & marketing",
  nike: "Food & consumer goods",
  nngroup: "Insurance",
  nutreco: "Food & consumer goods",
  nxp: "Semiconductors",
  philips: "Health & life sciences",
  project44: "Software & internet",
  prosus: "Software & internet",
  pwc: "Accounting",
  quantware: "Semiconductors",
  rabobank: "Banking",
  relx: "Media & marketing",
  robeco: "Financial services",
  salesforce: "Software & internet",
  shell: "Energy & utilities",
  signify: "Semiconductors",
  "theFactor.e (part of Conclusion)": "Software & internet",
  thermofisher: "Health & life sciences",
  "timformatie.": "Software & internet",
  unilever: "Food & consumer goods",
  "valantic NL": "Consulting",
  vopak: "Energy & utilities",
  weaviate: "Software & internet",
  wolterskluwer: "Media & marketing",
  workday: "Software & internet",
  "zeb consulting": "Consulting",
  南通中集安瑞科食品装备有限公司: "Energy & utilities",
  河南中金财富管理有限公司: "Financial services",
  锦江财务: "Consulting"
};

// src/lib/industries.ts
var INDUSTRIES = [
  "Banking",
  "Financial services",
  "Insurance",
  "Accounting",
  "Consulting",
  "Legal",
  "Staffing & recruiting",
  "Software & internet",
  "IT services",
  "Telecommunications",
  "Semiconductors",
  "Manufacturing",
  "Health & life sciences",
  "Energy & utilities",
  "Construction",
  "Transport & logistics",
  "Food & consumer goods",
  "Retail & e-commerce",
  "Hospitality & travel",
  "Media & marketing",
  "Education",
  "Government & non-profit",
  "Real estate"
];
var MAP = industries_default;
function industryOf(post) {
  const found = MAP[post.employer] ?? post.industry;
  return INDUSTRIES.includes(found) ? found : null;
}

// src/lib/format.ts
function formatPlace(region) {
  if (!region) {
    return "Location not stated";
  }
  return region.split(/[;|]/)[0].replace(/, Netherlands$/i, "").trim() || "Location not stated";
}
function formatHourly(text) {
  if (!text || !/(per\s+(hour|uur|hr)|\/\s*(hour|hr|uur|h)\b|an hour|p\.?u\.?\b)/i.test(text)) {
    return null;
  }
  const numbers = [...text.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map((m) => Number(m[0].replace(",", "."))).filter((n) => n >= 5 && n <= 250);
  if (numbers.length === 0) {
    return null;
  }
  return { low: Math.min(numbers[0], numbers[numbers.length - 1]), high: Math.max(numbers[0], numbers[numbers.length - 1]) };
}
function formatPosted(text) {
  if (!text) {
    return null;
  }
  const numbers = [...text.matchAll(/\d[\d.,]*/g)].map((m) => Number(m[0].replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."))).filter((n) => Number.isFinite(n) && n > 100);
  if (numbers.length === 0) {
    return null;
  }
  const low = Math.min(numbers[0], numbers[numbers.length - 1]);
  const high = Math.max(numbers[0], numbers[numbers.length - 1]);
  const unit = /\b(mo|month|maand|p\.?m\.?)\b|\/mo/i.test(text) || high < 20000 ? "month" : "year";
  return { low, high, unit };
}

// src/lib/job-facts.ts
function jobTypesOf(post, signal) {
  const read = post.job_type ? { fulltime: "Full-time", parttime: "Part-time", contract: "Contract" }[post.job_type] : undefined;
  if (read) {
    return [read];
  }
  const types = [];
  if (signal?.partTime) {
    types.push("Part-time");
  }
  if (signal?.contract) {
    types.push("Contract");
  }
  if (signal?.fullTime || types.length === 0 && levelOf(post) !== "Internship") {
    types.unshift("Full-time");
  }
  return types;
}
function workplaceOf(post, signal) {
  const read = post.workplace ? { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[post.workplace] : undefined;
  if (read) {
    return read;
  }
  return signal?.remote ? "Remote" : signal?.hybrid ? "Hybrid" : "On-site";
}
var cityOf = (post) => formatPlace(post.region).split(",")[0].trim();

// src/lib/sources.ts
var NAMES = {
  linkedin: "LinkedIn",
  "magnet.me": "Magnet.me",
  academictransfer: "AcademicTransfer",
  indeed: "Indeed",
  glassdoor: "Glassdoor"
};
var EMPLOYER_SYSTEMS = new Set(["workday", "greenhouse", "ashby", "smartrecruiters", "successfactors", "recruitee", "lever", "teamtailor", "personio", "workable"]);
function sourceOf(p) {
  const ats = (p.ats ?? "").toLowerCase();
  return { name: NAMES[ats] ?? (EMPLOYER_SYSTEMS.has(ats) ? "Employer site" : "Other"), url: p.url, ats };
}
function sourceNamesOf(p) {
  if (p.local) {
    return [];
  }
  return [...new Set((p.sources && p.sources.length > 0 ? p.sources : [sourceOf(p)]).map((x) => x.name))];
}
// src/lib/intern-pay.json
var intern_pay_default = {
  employers: {
    ABB: {
      high: 750,
      low: 650,
      name: "ABB",
      postings: 1
    },
    "ABN AMRO Bank N.V.": {
      high: 750,
      low: 750,
      name: "ABN AMRO Bank N.V.",
      postings: 3
    },
    "AOC International Europe B.V.": {
      high: 750,
      low: 650,
      name: "AOC International Europe B.V.",
      postings: 1
    },
    Abbott: {
      high: 500,
      low: 500,
      name: "Abbott",
      postings: 1
    },
    "B&amp;S": {
      high: 500,
      low: 500,
      name: "B&amp;S",
      postings: 1
    },
    "Canon Production Printing": {
      high: 500,
      low: 500,
      name: "Canon Production Printing",
      postings: 5
    },
    "Canpack Netherlands": {
      high: 400,
      low: 400,
      name: "Canpack Netherlands",
      postings: 1
    },
    "Cefetra Market Research": {
      high: 450,
      low: 450,
      name: "Cefetra Market Research",
      postings: 1
    },
    Churned: {
      high: 500,
      low: 500,
      name: "Churned",
      postings: 2
    },
    Danone: {
      high: 650,
      low: 650,
      name: "Danone",
      postings: 2
    },
    "De L'Europe Amsterdam": {
      high: 750,
      low: 750,
      name: "De L'Europe Amsterdam",
      postings: 1
    },
    "Emmett Green": {
      high: 500,
      low: 500,
      name: "Emmett Green",
      postings: 2
    },
    FrieslandCampina: {
      high: 600,
      low: 600,
      name: "FrieslandCampina",
      postings: 1
    },
    Haskoning: {
      high: 750,
      low: 750,
      name: "Haskoning",
      postings: 1
    },
    Henkel: {
      high: null,
      low: null,
      name: "Henkel",
      postings: 4
    },
    Hotelprofessionals: {
      high: 750,
      low: 750,
      name: "Hotelprofessionals",
      postings: 2
    },
    "Hyatt Regency": {
      high: 750,
      low: 750,
      name: "Hyatt Regency",
      postings: 1
    },
    "Ish Dance Collective": {
      high: 350,
      low: 350,
      name: "Ish Dance Collective",
      postings: 1
    },
    "JDE Peet's": {
      high: 525,
      low: 525,
      name: "JDE Peet's",
      postings: 1
    },
    "Jacobs Douwe Egberts UK": {
      high: 525,
      low: 525,
      name: "Jacobs Douwe Egberts UK",
      postings: 2
    },
    Justdiggit: {
      high: 400,
      low: 400,
      name: "Justdiggit",
      postings: 1
    },
    "Kraft Heinz": {
      high: 625,
      low: 625,
      name: "Kraft Heinz",
      postings: 2
    },
    Lely: {
      high: 650,
      low: 650,
      name: "Lely",
      postings: 1
    },
    "MSD Animal Health Nederland": {
      high: 500,
      low: 500,
      name: "MSD Animal Health Nederland",
      postings: 1
    },
    MatchWornShirt: {
      high: 500,
      low: 500,
      name: "MatchWornShirt",
      postings: 1
    },
    "NH Hotel Group": {
      high: 750,
      low: 750,
      name: "NH Hotel Group",
      postings: 6
    },
    "OMRON Healthcare EMEA": {
      high: 500,
      low: 400,
      name: "OMRON Healthcare EMEA",
      postings: 1
    },
    "OMRON Management Center Europe": {
      high: 425,
      low: 350,
      name: "OMRON Management Center Europe",
      postings: 1
    },
    Openclaims: {
      high: 500,
      low: 500,
      name: "Openclaims",
      postings: 1
    },
    "PPHE Hotel Group": {
      high: 750,
      low: 550,
      name: "PPHE Hotel Group",
      postings: 7
    },
    Philips: {
      high: 700,
      low: 500,
      name: "Philips",
      postings: 23
    },
    PortXL: {
      high: 575,
      low: 575,
      name: "PortXL",
      postings: 1
    },
    Rabobank: {
      high: 600,
      low: 600,
      name: "Rabobank",
      postings: 9
    },
    Refresco: {
      high: 750,
      low: 750,
      name: "Refresco",
      postings: 1
    },
    "Rituals (B Corp™)": {
      high: 550,
      low: 550,
      name: "Rituals (B Corp™)",
      postings: 1
    },
    Sendcloud: {
      high: 750,
      low: 500,
      name: "Sendcloud",
      postings: 1
    },
    "TKH Airport Solutions": {
      high: 350,
      low: 350,
      name: "TKH Airport Solutions",
      postings: 1
    },
    Thermeleon: {
      high: 400,
      low: 400,
      name: "Thermeleon",
      postings: 1
    },
    "TriGlobal B.V.": {
      high: 500,
      low: 500,
      name: "TriGlobal B.V.",
      postings: 1
    },
    "Van Lanschot Kempen": {
      high: 1100,
      low: 1100,
      name: "Van Lanschot Kempen",
      postings: 1
    },
    Vanderlande: {
      high: 550,
      low: 550,
      name: "Vanderlande",
      postings: 2
    },
    "Verder Liquids": {
      high: 950,
      low: 950,
      name: "Verder Liquids",
      postings: 1
    },
    "WP SEO AI": {
      high: 500,
      low: 500,
      name: "WP SEO AI",
      postings: 1
    },
    catawiki: {
      high: 600,
      low: 600,
      name: "Catawiki",
      postings: 1
    },
    philips: {
      high: 700,
      low: 500,
      name: "Philips",
      postings: 23
    },
    rabobank: {
      high: 600,
      low: 600,
      name: "Rabobank",
      postings: 9
    },
    relx: {
      high: 750,
      low: 750,
      name: "RELX",
      postings: 1
    }
  },
  generated: "2026-10-01",
  market: {
    employers: 45,
    high: 1250,
    low: 250,
    median: 575,
    p25: 500,
    p75: 725,
    postings: 102
  },
  postings: {
    p0284dcceb257: [
      650,
      650
    ],
    p037c9b553c26: [
      500,
      500
    ],
    p05a1425e9b88: [
      950,
      950
    ],
    p073cf9735b84: [
      600,
      600
    ],
    p0799ee49c451: [
      400,
      400
    ],
    p08ef95ce8f77: [
      500,
      500
    ],
    p0a369a0e9240: [
      500,
      700
    ],
    p0c9406d72067: [
      750,
      750
    ],
    p112b54b6a730: [
      750,
      750
    ],
    p114a88f94fde: [
      500,
      700
    ],
    p11b9a43140c6: [
      250,
      250
    ],
    p11c68cedfefd: [
      500,
      700
    ],
    p12f9a7b47717: [
      600,
      600
    ],
    p1ad6b41de7aa: [
      750,
      750
    ],
    p1af9ba375243: [
      600,
      600
    ],
    p1dab086120e7: [
      750,
      750
    ],
    p1f6be0d24b1b: [
      500,
      500
    ],
    p2352de154db7: [
      500,
      500
    ],
    p292eaf46d79c: [
      600,
      600
    ],
    p296a67e7d0d6: [
      500,
      700
    ],
    p2bcf4a8dd6e6: [
      650,
      750
    ],
    p30eac7d08da3: [
      750,
      750
    ],
    p32d281849548: [
      525,
      525
    ],
    p33c94ccb0a17: [
      750,
      750
    ],
    p360594420b1a: [
      550,
      550
    ],
    p360ec8639a0a: [
      1100,
      1100
    ],
    p36c01e11616a: [
      500,
      700
    ],
    p37949fe1627d: [
      500,
      700
    ],
    p3b53cff32fa3: [
      525,
      525
    ],
    p3e52d399eb6b: [
      500,
      750
    ],
    p40ae2a1d53a7: [
      600,
      600
    ],
    p4587c6c543af: [
      500,
      500
    ],
    p4672715b88bb: [
      750,
      750
    ],
    p4a18e4ba9b8a: [
      500,
      700
    ],
    p4b2f6712afad: [
      500,
      700
    ],
    p4b5761f7ee93: [
      500,
      700
    ],
    p52f889868d7f: [
      500,
      500
    ],
    p56246b355f50: [
      500,
      500
    ],
    p566cf18cf443: [
      625,
      625
    ],
    p586c2f48b1d0: [
      450,
      450
    ],
    p5953965bdce7: [
      500,
      700
    ],
    p5d08d15bd0f7: [
      750,
      750
    ],
    p5d7ab8063d02: [
      750,
      750
    ],
    p5ddb85275cbb: [
      500,
      700
    ],
    p691bfd932a54: [
      600,
      600
    ],
    p6d02421dc25c: [
      600,
      600
    ],
    p6d123d513f52: [
      550,
      550
    ],
    p71c337672cfa: [
      500,
      700
    ],
    p784ed4c66d35: [
      750,
      750
    ],
    p7997cd9d98be: [
      1000,
      1250
    ],
    p79ec021f25e0: [
      750,
      750
    ],
    p7a3aef5c547c: [
      750,
      750
    ],
    p7c15a6f7a72e: [
      500,
      700
    ],
    p7d1d3378ab49: [
      1000,
      1250
    ],
    p7fec26799cd0: [
      600,
      600
    ],
    p8108a327ef3b: [
      500,
      700
    ],
    p8216a5f94df1: [
      525,
      525
    ],
    p84c324246900: [
      500,
      500
    ],
    p84c67690d220: [
      500,
      700
    ],
    p85a263a56d1f: [
      500,
      500
    ],
    p881b28666eab: [
      600,
      600
    ],
    p8ac8df01d4bc: [
      350,
      350
    ],
    p997a644d534b: [
      500,
      500
    ],
    p9a964880c142: [
      750,
      750
    ],
    p9dcedbdca70b: [
      500,
      700
    ],
    pa445e7bd0977: [
      500,
      700
    ],
    pa480c084a7e3: [
      750,
      750
    ],
    pa4fce0262883: [
      600,
      600
    ],
    pa6a1338682df: [
      400,
      500
    ],
    pa80ae40c1f0e: [
      750,
      750
    ],
    paafc04d4921c: [
      500,
      700
    ],
    paef0e5376809: [
      750,
      750
    ],
    pafd810f57834: [
      650,
      750
    ],
    pb43bc556c4f7: [
      750,
      750
    ],
    pb7cbcf525487: [
      500,
      700
    ],
    pbac0971e5094: [
      650,
      650
    ],
    pc0a8461a289e: [
      500,
      500
    ],
    pc259afd44a19: [
      500,
      500
    ],
    pc726fd44ecea: [
      750,
      750
    ],
    pcac7beb3b0fd: [
      500,
      500
    ],
    pcc615aa3b9cc: [
      750,
      750
    ],
    pcd263fa26421: [
      500,
      500
    ],
    pd115054e2c67: [
      500,
      700
    ],
    pd423f7c68ca6: [
      500,
      700
    ],
    pd6b347106fbc: [
      1000,
      1250
    ],
    pdc9c03df3e0f: [
      625,
      625
    ],
    pdce04a0df2f9: [
      500,
      500
    ],
    pe185de21a08b: [
      550,
      550
    ],
    pe1f1b2867346: [
      500,
      500
    ],
    pe50ce025a467: [
      750,
      750
    ],
    pe5a2db02785e: [
      550,
      550
    ],
    pe62a11aa890d: [
      600,
      600
    ],
    pec2237f3d38c: [
      575,
      575
    ],
    ped240b2b7842: [
      750,
      750
    ],
    pef4fea381217: [
      350,
      425
    ],
    pf0e1fb672611: [
      500,
      700
    ],
    pf14d880f546f: [
      350,
      350
    ],
    pf3754c56ed5e: [
      650,
      650
    ],
    pf8b4e71b4acd: [
      750,
      750
    ],
    pfa2c2eb008f9: [
      400,
      400
    ],
    pfe424a4c7698: [
      400,
      400
    ],
    pff8fd0a95560: [
      500,
      700
    ]
  }
};

// src/lib/spec.ts
var INTERN_MARKET = intern_pay_default.market;
var INTERN_POSTINGS = intern_pay_default.postings;
var INTERN_EMPLOYERS = intern_pay_default.employers;
var TRAINEE_PAY = { low: 2450, high: 3500 };
function payMid(post, reference) {
  if (formatHourly(post.pay_posted)) {
    return null;
  }
  const stated = formatPosted(post.pay_posted);
  if (stated && stated.high <= stated.low * 3) {
    const divide = stated.unit === "year" ? 12 : 1;
    return { month: (stated.low + stated.high) / 2 / divide, basis: "Stated" };
  }
  if (post.role_kind === "traineeship") {
    return { month: (TRAINEE_PAY.low + TRAINEE_PAY.high) / 2, basis: "Typical" };
  }
  if (isInternship(post)) {
    return null;
  }
  const band = reference && post.cbs_group ? reference.bands[post.cbs_group] : null;
  return band ? { month: Number(band.p50_hourly) * 2080 * 1.08 / 12, basis: "Typical" } : null;
}

// src/lib/filters.ts
var FIELD_OPTIONS = FAMILIES.filter((f) => f !== "Other");
var guessedFields = new WeakMap;
function fieldOf(post) {
  if (post.family !== null && post.family !== undefined) {
    return post.family;
  }
  const title = post.title_clean ?? post.title;
  const hit = guessedFields.get(post);
  if (hit && hit.title === title && hit.skills === post.skills) {
    return hit.field;
  }
  const field = guessFamily(title, post.skills);
  guessedFields.set(post, { title, skills: post.skills, field });
  return field;
}
var NO_FILTERS = { query: "", field: [], industry: [], level: [], language: [], sponsorOnly: false, posted: "any", type: [], workplace: [], city: [], minPay: null, source: [] };
var POSTED_DAYS = { day: 1, week: 7, month: 30 };
var LEVEL_OPTIONS = LEVELS.filter((level) => level !== "Not stated");
var STARTING_LEVELS = ["Internship", "Entry"];
var DEFAULT_FILTERS = { ...NO_FILTERS, level: [...STARTING_LEVELS], posted: "any", language: ["english"] };
var sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
function normalizeFilters(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x !== "") : typeof v === "string" && v !== "" ? [v] : [];
  const levels = list(r.level).flatMap((l) => l === "Starting out" ? [...STARTING_LEVELS] : [l]).filter((l) => LEVEL_OPTIONS.includes(l));
  const posted = r.posted === "day" || r.posted === "week" || r.posted === "month" || r.posted === "any" ? r.posted : DEFAULT_FILTERS.posted;
  const pay = typeof r.minPay === "number" && Number.isFinite(r.minPay) ? r.minPay : null;
  return {
    query: typeof r.query === "string" ? r.query : "",
    field: list(r.field).filter((f) => FIELD_OPTIONS.includes(f)),
    industry: list(r.industry),
    level: [...new Set(levels)],
    language: [...new Set(list(r.language).filter((x) => x === "english" || x === "dutch"))],
    sponsorOnly: r.sponsorOnly === true,
    posted,
    type: list(r.type),
    workplace: list(r.workplace),
    city: list(r.city),
    minPay: pay,
    source: list(r.source)
  };
}
var plain = (text) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
var squashed = (text) => text.replace(/[^a-z0-9+#]/g, "");
function startsAWord(text, short) {
  const at = (from) => text.indexOf(short, from);
  for (let i = at(0);i !== -1; i = at(i + 1)) {
    if (i === 0 || /[^a-z0-9]/.test(text[i - 1])) {
      return true;
    }
  }
  return false;
}
var RUN_TOGETHER_FROM = 6;
var searchable = new WeakMap;
function searchTextOf(post) {
  const hit = searchable.get(post);
  if (hit) {
    return hit;
  }
  const text = plain(`${post.title} ${post.employer_display} ${post.region ?? ""} ${fieldOf(post) ?? ""} ${industryOf(post) ?? ""} ${levelOf(post)}`);
  const made = { text, squashed: squashed(text) };
  searchable.set(post, made);
  return made;
}
function matchesWords(post, words2) {
  if (words2.length === 0) {
    return true;
  }
  const { text, squashed: run } = searchTextOf(post);
  return words2.every((w) => {
    const forms = w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w];
    if (w.length <= 3) {
      return startsAWord(text, w);
    }
    return forms.some((f) => text.includes(f) || squashed(f).length >= RUN_TOGETHER_FROM && run.includes(squashed(f)));
  });
}
function applyFilters(posts, filters, env = {}) {
  const words2 = plain(filters.query).split(/\s+/).filter(Boolean);
  return posts.filter((post) => {
    if (filters.sponsorOnly && !post.ind_sponsor) {
      return false;
    }
    if (filters.language.length === 1 && filters.language[0] === "english" && post.dutch_required) {
      return false;
    }
    if (filters.language.length === 1 && filters.language[0] === "dutch" && !post.dutch_required) {
      return false;
    }
    if (filters.posted !== "any" && (post.days_open === null || post.freshness_state === "still_listed_30_plus" || post.days_open > POSTED_DAYS[filters.posted])) {
      return false;
    }
    if (filters.level.length > 0 && !filters.level.includes(levelOf(post))) {
      return false;
    }
    if (filters.field.length > 0 && !filters.field.includes(fieldOf(post) ?? "")) {
      return false;
    }
    if (filters.industry.length > 0 && !filters.industry.includes(industryOf(post))) {
      return false;
    }
    if (filters.city.length > 0 && !filters.city.includes(cityOf(post))) {
      return false;
    }
    if (filters.type.length > 0) {
      const kinds = jobTypesOf(post, env.signals?.[post.id]);
      if (!filters.type.some((t) => kinds.includes(t))) {
        return false;
      }
    }
    if (filters.workplace.length > 0 && !filters.workplace.includes(workplaceOf(post, env.signals?.[post.id]))) {
      return false;
    }
    if (filters.source.length > 0) {
      const names = sourceNamesOf(post);
      if (!filters.source.some((n) => names.includes(n))) {
        return false;
      }
    }
    if (filters.minPay !== null && (payMid(post, env.reference ?? null)?.month ?? 0) < filters.minPay) {
      return false;
    }
    if (!matchesWords(post, words2)) {
      return false;
    }
    return true;
  });
}
function activeCount(filters) {
  const lists = [filters.field, filters.industry, sameSet(filters.level, STARTING_LEVELS) ? [] : filters.level, filters.type, filters.workplace, filters.city, filters.source].filter((each) => each.length > 0).length;
  const language = filters.language.length === 1 && !sameSet(filters.language, DEFAULT_FILTERS.language) ? 1 : 0;
  const single = language + (filters.minPay !== null ? 1 : 0);
  return lists + single + (filters.sponsorOnly ? 1 : 0) + (filters.posted !== "any" && filters.posted !== DEFAULT_FILTERS.posted ? 1 : 0) + (filters.query.trim() ? 1 : 0);
}
export {
  normalizeFilters,
  applyFilters,
  activeCount,
  DEFAULT_FILTERS
};
