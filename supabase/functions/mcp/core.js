// src/lib/family-model.json
var family_model_default = {
  families: ["Consulting & strategy", "Customer support & service", "Data, analytics & AI", "Design & UX", "Finance & accounting", "HR & recruiting", "Hardware & engineering", "Healthcare & life sciences", "IT, cloud & security", "Marketing & communications", "Operations & supply chain", "Product & project management", "Research & academia", "Risk, compliance & legal", "Sales & account management", "Software engineering"],
  totals: [560, 114, 1728, 53, 1946, 197, 369, 139, 667, 311, 477, 628, 1063, 897, 760, 1511],
  vocab: { "2026": [0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0], "2027": [0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 4, 0, 0, 2, 0, 0], solution: [1, 0, 8, 0, 0, 0, 0, 0, 9, 0, 0, 1, 1, 0, 6, 1], architect: [2, 0, 9, 2, 0, 0, 3, 0, 10, 0, 0, 0, 0, 0, 0, 2], "skill:excel": [26, 5, 50, 0, 94, 7, 1, 2, 9, 11, 21, 18, 3, 20, 10, 13], "skill:sql": [4, 0, 104, 0, 16, 0, 0, 0, 5, 2, 1, 12, 0, 16, 0, 40], "skill:python": [6, 1, 152, 0, 21, 0, 26, 1, 23, 0, 1, 4, 58, 24, 2, 77], "skill:compliance": [12, 6, 25, 0, 96, 11, 10, 16, 36, 2, 27, 26, 3, 87, 20, 36], "skill:aws": [0, 1, 29, 0, 0, 0, 0, 0, 23, 1, 0, 5, 0, 2, 7, 44], "skill:gcp": [0, 0, 29, 0, 0, 0, 0, 8, 12, 1, 0, 4, 0, 0, 7, 17], "skill:azure": [1, 1, 46, 0, 1, 0, 0, 1, 24, 1, 0, 7, 0, 3, 5, 41], "skill:spark": [0, 1, 30, 0, 0, 0, 0, 0, 0, 1, 0, 1, 4, 2, 2, 4], "skill:machine learning": [9, 0, 69, 0, 9, 2, 4, 0, 4, 1, 0, 5, 35, 9, 1, 18], "skill:snowflake": [0, 0, 17, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 2], "skill:databricks": [0, 1, 49, 1, 0, 0, 0, 0, 7, 0, 0, 4, 0, 4, 7, 11], "skill:product management": [0, 3, 11, 4, 0, 0, 6, 2, 1, 4, 0, 45, 0, 3, 3, 18], "skill:communication skills": [49, 11, 70, 3, 91, 12, 23, 10, 31, 39, 32, 31, 78, 42, 41, 42], financial: [4, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0], analyst: [7, 0, 40, 0, 50, 3, 0, 1, 5, 0, 0, 20, 0, 8, 1, 0], busines: [15, 0, 13, 0, 17, 3, 0, 0, 3, 0, 3, 28, 2, 3, 27, 1], model: [0, 0, 1, 0, 3, 0, 2, 0, 0, 0, 0, 0, 7, 5, 0, 0], innovation: [1, 0, 0, 2, 3, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], "skill:us gaap": [0, 0, 1, 0, 39, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:sap": [16, 4, 9, 0, 51, 2, 0, 0, 7, 1, 15, 5, 0, 2, 3, 5], "skill:reconciliation": [0, 0, 5, 0, 56, 2, 0, 1, 0, 0, 0, 3, 0, 2, 0, 5], "skill:payments": [4, 8, 9, 0, 53, 4, 6, 6, 7, 7, 14, 16, 0, 24, 24, 29], security: [0, 0, 1, 0, 0, 0, 0, 0, 33, 1, 0, 1, 0, 3, 1, 0], detection: [0, 0, 2, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0], "skill:budgeting": [37, 0, 46, 1, 100, 4, 26, 7, 21, 12, 12, 27, 19, 37, 19, 39], "skill:audit": [1, 1, 2, 0, 110, 7, 3, 8, 16, 2, 6, 3, 1, 49, 1, 5], "skill:stakeholder management": [60, 8, 122, 9, 141, 28, 22, 13, 64, 34, 54, 84, 40, 84, 98, 53], "skill:risk management": [1, 0, 9, 0, 35, 3, 7, 2, 14, 1, 4, 6, 1, 62, 4, 15], engine: [2, 3, 49, 0, 0, 0, 46, 0, 30, 0, 2, 0, 0, 1, 9, 126], phd: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 127, 0, 0, 0], position: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 70, 0, 0, 0], software: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 99], clinical: [0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 1, 0, 0, 1], care: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1], research: [1, 0, 12, 0, 0, 0, 6, 3, 0, 1, 0, 1, 25, 0, 1, 2], "skill:typescript": [0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 32], "skill:c#": [0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 32], "skill:.net": [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 3, 1, 20], "skill:agile/scrum": [6, 0, 25, 3, 8, 1, 1, 1, 15, 3, 6, 23, 0, 8, 9, 58], consultant: [51, 0, 12, 2, 8, 6, 0, 2, 14, 3, 1, 0, 0, 18, 1, 1], data: [4, 0, 107, 0, 3, 0, 0, 0, 2, 0, 1, 0, 4, 2, 0, 1], "skill:financial modelling": [0, 0, 0, 0, 14, 1, 0, 0, 0, 0, 1, 0, 0, 4, 0, 1], "skill:forecasting": [13, 0, 19, 0, 68, 0, 1, 2, 4, 1, 9, 6, 3, 2, 48, 1], science: [1, 0, 10, 0, 0, 0, 0, 2, 0, 1, 0, 0, 5, 0, 0, 2], engineer: [0, 0, 14, 0, 0, 0, 6, 0, 1, 0, 1, 0, 0, 0, 0, 11], manag: [27, 0, 8, 0, 28, 5, 3, 3, 14, 13, 15, 58, 0, 16, 54, 9], finance: [11, 0, 2, 0, 58, 0, 0, 0, 5, 0, 0, 0, 2, 6, 0, 0], administration: [0, 0, 1, 0, 2, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], insight: [0, 0, 4, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], report: [0, 0, 2, 0, 9, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0], "skill:consolidation": [3, 0, 8, 0, 30, 1, 1, 0, 6, 1, 6, 1, 1, 2, 0, 4], "skill:java": [0, 1, 8, 0, 1, 0, 0, 0, 8, 0, 0, 1, 1, 3, 2, 58], "skill:kotlin": [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 11], "skill:linux": [0, 0, 4, 0, 0, 0, 1, 0, 11, 0, 0, 1, 0, 0, 1, 25], "skill:c++": [0, 0, 8, 0, 3, 0, 6, 0, 2, 0, 0, 0, 8, 5, 0, 42], "skill:android": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5], scientist: [0, 2, 22, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1], "skill:docker": [0, 0, 19, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 38], "skill:ci/cd": [0, 0, 29, 0, 0, 0, 1, 0, 12, 0, 0, 8, 0, 3, 0, 47], director: [0, 0, 1, 0, 4, 3, 2, 4, 2, 3, 1, 4, 0, 1, 8, 1], product: [1, 0, 4, 6, 1, 0, 0, 0, 1, 3, 0, 44, 0, 2, 0, 1], analysi: [0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 1, 5, 0, 0, 0], indirect: [0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], tax: [0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:tax": [5, 0, 4, 0, 73, 9, 1, 1, 4, 0, 3, 6, 71, 9, 2, 4], "skill:vat": [0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], advisory: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], associate: [7, 0, 3, 0, 15, 3, 1, 3, 2, 1, 2, 1, 5, 1, 7, 0], esg: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], assurance: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1], assistant: [0, 0, 1, 0, 3, 0, 0, 0, 0, 1, 1, 0, 17, 2, 11, 0], dond: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], centre: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], cognition: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], system: [0, 0, 0, 0, 0, 1, 9, 0, 4, 0, 1, 0, 11, 1, 1, 1], development: [0, 0, 0, 0, 1, 0, 1, 2, 0, 0, 3, 0, 3, 1, 24, 6], executive: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0], project: [1, 0, 0, 0, 3, 0, 1, 0, 0, 0, 3, 21, 5, 3, 1, 0], group: [3, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 2, 1, 0, 0, 0], controll: [0, 0, 0, 0, 55, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:ifrs": [0, 0, 2, 0, 39, 0, 0, 0, 2, 0, 0, 1, 0, 11, 0, 0], "skill:fp&a": [5, 0, 2, 0, 38, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:treasury": [0, 0, 4, 0, 26, 0, 0, 0, 1, 0, 0, 2, 0, 8, 1, 2], sal: [0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 33, 0], representative: [0, 4, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 13, 0], bsc: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1, 0, 1, 0, 0, 0], msc: [0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 0], mechanical: [0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 1, 0, 1, 0, 0, 0], procurement: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0], "skill:power bi": [2, 0, 55, 0, 31, 1, 0, 1, 1, 1, 7, 4, 0, 11, 0, 1], sap: [12, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1, 0, 0, 0, 2], excellence: [0, 0, 4, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0], sustainability: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 1], mechanic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], material: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 5, 0, 4, 0, 0, 0], machine: [0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], learn: [0, 0, 7, 0, 0, 2, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], "skill:node.js": [0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 6], "skill:pytorch": [0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 1], brand: [0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 1, 0, 0, 0, 0, 0], design: [0, 0, 4, 10, 0, 0, 5, 0, 1, 1, 1, 0, 10, 0, 0, 1], international: [0, 0, 1, 0, 0, 5, 2, 0, 0, 0, 0, 0, 1, 1, 3, 0], key: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], account: [0, 0, 0, 0, 27, 0, 1, 0, 0, 0, 0, 0, 0, 0, 63, 0], custom: [0, 5, 4, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 8, 0], support: [0, 4, 0, 0, 2, 1, 0, 0, 5, 0, 0, 0, 1, 0, 1, 0], develop: [0, 0, 8, 0, 0, 0, 1, 0, 2, 2, 0, 3, 1, 1, 5, 37], "skill:airflow": [0, 0, 11, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1], "skill:dbt": [0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], quantum: [0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 7, 0, 0, 2], measurement: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 1], investment: [1, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0], bank: [1, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 0, 2, 1, 0, 0], succes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], equity: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], accountant: [0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:netsuite": [0, 0, 1, 0, 10, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1], workday: [8, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], candidate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 15, 0, 0, 0], spatial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], statistic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], field: [0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 1, 0], sensor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1], team: [0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 7, 2, 0, 2, 1, 3], talent: [0, 0, 0, 0, 2, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], retail: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0], ecosystem: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], from: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0], health: [0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 3, 1, 2, 0], governance: [0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1], affair: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0], market: [0, 0, 3, 0, 2, 1, 0, 0, 1, 49, 0, 0, 0, 2, 3, 0], communication: [0, 0, 0, 0, 0, 1, 0, 0, 0, 11, 0, 0, 2, 0, 0, 0], photonic: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0], integrated: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 4, 0, 1, 0], circuit: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], plant: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0], interaction: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], strategy: [17, 0, 1, 0, 0, 0, 1, 2, 0, 0, 1, 0, 1, 2, 0, 0], school: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], management: [8, 3, 0, 0, 2, 4, 0, 1, 4, 1, 19, 5, 1, 7, 0, 0], food: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 1, 0, 0], "skill:oracle": [3, 0, 3, 0, 5, 0, 0, 0, 1, 1, 3, 0, 0, 0, 1, 5], "skill:php": [0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 2], strategic: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 8, 0], consult: [4, 0, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0], staff: [0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 3, 0, 0, 0, 11], applied: [0, 0, 5, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0], physic: [0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 0, 0, 4, 0, 0, 0], enterprise: [3, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 11, 0], student: [0, 0, 1, 0, 7, 0, 1, 0, 0, 2, 2, 2, 3, 1, 0, 0], "skill:javascript": [0, 1, 5, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 22], "skill:react": [0, 0, 2, 0, 1, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 30], "skill:swift": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2, 0, 1, 1, 8], hse: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0], advisor: [2, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 1, 0], direct: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "skill:cpa/aca/acca": [0, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], proces: [0, 0, 1, 0, 3, 0, 3, 0, 0, 0, 1, 0, 1, 1, 0, 0], integration: [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0], "skill:tableau": [4, 0, 23, 0, 6, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0], area: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0], experienced: [1, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], risk: [0, 0, 2, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 48, 1, 0], technical: [0, 1, 1, 0, 1, 0, 1, 1, 4, 0, 1, 12, 2, 1, 2, 2], technology: [4, 0, 0, 0, 0, 0, 1, 0, 2, 0, 3, 1, 1, 1, 1, 0], printed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], footwear: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], cent: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], test: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 1], operation: [0, 1, 2, 0, 2, 2, 2, 0, 1, 1, 16, 1, 0, 0, 0, 1], analytic: [3, 0, 19, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], tech: [1, 0, 3, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], corporate: [0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 2, 0, 0, 1, 1, 0], control: [0, 0, 2, 0, 4, 0, 1, 0, 0, 0, 1, 0, 11, 8, 1, 1], "skill:kubernetes": [0, 0, 11, 0, 0, 0, 0, 0, 14, 0, 0, 0, 0, 3, 1, 51], "skill:terraform": [0, 0, 8, 0, 0, 0, 0, 0, 13, 0, 0, 0, 0, 0, 0, 9], postdoc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0], optical: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 7, 0, 0, 0], professor: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14, 0, 0, 0], process: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], transformation: [10, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], performance: [5, 0, 3, 0, 0, 3, 0, 0, 0, 0, 1, 1, 2, 0, 0, 1], knowledge: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], recruit: [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], event: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 1, 0, 0, 0], phase: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], metrology: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], devop: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 10], audit: [0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], servic: [1, 1, 0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], dynamic: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0], light: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], net: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], credit: [0, 0, 1, 0, 5, 0, 0, 0, 0, 0, 0, 1, 0, 9, 0, 0], commerce: [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0], specialist: [0, 0, 3, 1, 8, 2, 1, 3, 13, 9, 4, 2, 0, 14, 1, 0], digital: [3, 0, 0, 0, 2, 1, 3, 0, 1, 10, 0, 2, 4, 3, 3, 0], "skill:cfa": [0, 0, 2, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 1], regional: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], "skill:tensorflow": [0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2], content: [0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0, 1, 0, 0, 0], compliance: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 1, 0, 13, 0, 0], automation: [0, 0, 3, 0, 0, 1, 1, 0, 3, 1, 0, 0, 0, 0, 0, 1], trade: [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0], medior: [1, 0, 3, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 3], "skill:rust": [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 7], leadership: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0], nike: [3, 0, 0, 1, 2, 0, 0, 0, 0, 4, 2, 0, 0, 0, 1, 0], inc: [2, 0, 0, 1, 2, 0, 0, 0, 0, 4, 1, 0, 0, 0, 1, 0], creation: [2, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0], "skill:kyc/aml": [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 12, 0, 1], experience: [0, 0, 4, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], quality: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 4, 1, 2], logistic: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0], optimiz: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], modell: [0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 12, 1, 0, 0], tool: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 1, 0, 1], regulatory: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 3, 0, 0], chemical: [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0], legal: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0], offic: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 10, 0, 0], expert: [0, 1, 1, 0, 2, 2, 1, 0, 0, 1, 3, 0, 0, 12, 1, 1], delivery: [3, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0], synthetic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], postdoctoral: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0], decision: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], enablement: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0], plann: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 1, 0, 0, 0], graduation: [0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 2, 0, 3], general: [0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0], production: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 1, 0, 0, 0], experimental: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], matt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], "4hana": [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], supply: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0], chain: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0], mgr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], neuroscience: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0], backend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15], proposal: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0], ship: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0], quant: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], driven: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1], steel: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], transaction: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], monitor: [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 2, 4, 0, 0], scenario: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], application: [0, 2, 0, 0, 0, 0, 1, 0, 5, 0, 1, 0, 1, 0, 1, 1], facility: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], employee: [0, 0, 0, 0, 0, 3, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0], ocean: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], beverage: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], french: [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], language: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], assignment: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2], hbo: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], own: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], crowdstrike: [0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0], large: [0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 1, 0, 1, 0], growth: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0], safety: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 4, 0, 0], duty: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], collection: [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], industrial: [0, 0, 2, 3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], parthenon: [4, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], electrical: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 0, 0, 0], due: [2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], diligence: [2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], commercial: [3, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0], work: [0, 0, 1, 0, 7, 0, 0, 0, 0, 2, 2, 1, 0, 1, 0, 0], trad: [1, 0, 1, 0, 10, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 2], "skill:scala": [0, 1, 6, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9], treasury: [0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], off: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], cycle: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], resourc: [0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], writ: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0], sourc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0], cybersecurity: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], partn: [0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 0, 0, 0, 1, 4, 1], engagement: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 4, 0], forward: [0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], deployed: [0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], farm: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], emission: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], iii: [0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], magnetic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], igt: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0], cloud: [0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0], track: [0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 3, 2, 0, 0], euv: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0], install: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], social: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0], based: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 6, 0, 0, 0], recycl: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], "skill:kafka": [0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 16], operational: [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 1, 2, 0, 0], category: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0], cyb: [0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0], circular: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], quantitative: [0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], computational: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0], manufactur: [3, 0, 1, 0, 1, 0, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0], industry: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0], generative: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], scientific: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], contract: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0], operator: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 1, 0], economic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], domain: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], lead: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 1, 1, 1], java: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], "skill:ios": [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 6], generation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], consultancy: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], framework: [0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], theory: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], auditor: [0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], counsel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0], mobility: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], transition: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], acros: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], python: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], diagnostic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], platform: [0, 0, 2, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 6], cost: [0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], asset: [1, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], paid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0], network: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1], infrastructure: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 2], internal: [0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0], improvement: [1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], advanced: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0], acces: [0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 1, 0, 0, 0], op: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], repair: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0], warehouse: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], gtm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0], coe: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0], law: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0], adaptive: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], building: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], study: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], macro: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], physical: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], identity: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], office: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 1, 0], vie: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], benelux: [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0], intelligence: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0], vice: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], president: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], unit: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0], comput: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 1], high: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 0, 0, 0], handl: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0], aw: [0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], service: [0, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 0], impact: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], speak: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0], front: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], end: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], future: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], medical: [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0], msca: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 6, 0, 0, 0], motion: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], external: [0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], canc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], non: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0], hardware: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0, 0, 0], space: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], mid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1], implementation: [0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], relation: [0, 1, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0], foundation: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0], imag: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0], radar: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], flow: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0], value: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], stack: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9], acquisition: [0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0], expertise: [1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], search: [0, 0, 1, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0], offshore: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0], client: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0], single: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], functional: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 0, 1], optic: [0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], campaign: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0], frontend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4], mufg: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0], twin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], sustainable: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0], marine: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0], gene: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], suppli: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0], continuou: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], site: [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], mast: [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], thesi: [1, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], clock: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0], investigation: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0], energy: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 1, 0], assembl: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0], multi: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], steer: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], io: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], two: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], cell: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0], subcontract: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0], analist: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], unreal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], payroll: [0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], build: [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0], optimization: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0], change: [2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0] }
};

// src/lib/fit.ts
var FIT_WEIGHTS = { skills: 0.4, role: 0.4, level: 0.2 };
var FIT_WEIGHTS_FIELD = { skills: 0.35, field: 0.25, consistency: 0.15, role: 0.15, level: 0.1 };
var SKILL_PRIOR = 2;
var STRENGTH_PULL = 0.4;
var FIT_AVERAGE = 0.4;
var LEVEL_RANK = { Internship: 1, Entry: 1, Mid: 2, Senior: 3, Manager: 4, Director: 5 };
function levelFromYears(years) {
  return years < 2 ? 1 : years < 5 ? 2 : years < 9 ? 3 : 4;
}
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
var TIER_WEIGHT = { must: 1, strong: 0.7, optional: 0.4, nice: 0.2, unspecified: 0.6 };
function fitOf(input) {
  const parts = [];
  if (input.wanted.length > 0) {
    const got = input.wanted.filter((w) => input.have(w.name));
    const total = input.wanted.reduce((sum, w) => sum + TIER_WEIGHT[w.tier], 0);
    const earned = got.reduce((sum, w) => sum + TIER_WEIGHT[w.tier], 0);
    const label = { must: "must-have", strong: "strong plus", optional: "preferred", nice: "nice to have", unspecified: "listed" };
    const detail = ["must", "strong", "optional", "nice", "unspecified"].map((tier) => ({ tier, n: input.wanted.filter((w) => w.tier === tier).length, k: got.filter((w) => w.tier === tier).length })).filter((t) => t.n > 0).map((t) => `${t.k} of ${t.n} ${label[t.tier]}`).join(", ");
    parts.push({ key: "skills", label: "Skills", value: (earned + FIT_AVERAGE * SKILL_PRIOR) / (total + SKILL_PRIOR), detail });
  }
  if (input.field != null) {
    const pct = Math.round(input.field * 100);
    parts.push({ key: "field", label: "Field", value: input.field, detail: input.field >= 0.5 ? `your titles, degree and skills point to this line of work (${pct}%)` : input.field >= 0.15 ? `partly the line of work your CV points to (${pct}%)` : `a different line of work from your CV (${pct}%)` });
  }
  const titleWords = [...new Set(words(input.title).map(stem))];
  if (titleWords.length > 0 && input.text.trim()) {
    const mine = stemsOf(input.text);
    const weight = (w) => input.specificity?.(w) ?? 1;
    const hit = titleWords.filter((w) => mine.has(w));
    const total = titleWords.reduce((sum, w) => sum + weight(w), 0);
    parts.push({ key: "role", label: "Role", value: total > 0 ? hit.reduce((sum, w) => sum + weight(w), 0) / total : 0, detail: hit.length > 0 ? `${hit.join(", ")} on your profile` : "nothing from the title on your profile" });
  }
  if (input.consistency != null && input.field != null) {
    const pct = Math.round(input.consistency * 100);
    parts.push({ key: "consistency", label: "Consistency", value: input.consistency, detail: input.consistency >= 0.5 ? `your history is focused on this line of work (${pct}%)` : input.consistency >= 0.25 ? `part of your history is in this line of work (${pct}%)` : `your history is spread over other lines of work (${pct}%)` });
  }
  const rank = LEVEL_RANK[input.level];
  if (rank != null) {
    const mine = levelFromYears(input.years);
    const gap = Math.abs(rank - mine);
    parts.push({ key: "level", label: "Level", value: gap === 0 ? FIT_AVERAGE : gap === 1 ? FIT_AVERAGE / 2 : 0, detail: gap === 0 ? "the level your years point to" : gap === 1 ? "one step from your years" : "two or more steps from your years" });
  }
  if (parts.length === 0) {
    return null;
  }
  const W = parts.some((p) => p.key === "field") ? FIT_WEIGHTS_FIELD : FIT_WEIGHTS;
  const known = parts.reduce((sum, p) => sum + (W[p.key] ?? 0), 0);
  const raw = parts.reduce((sum, p) => sum + p.value * (W[p.key] ?? 0), 0) / known;
  const lift = input.strength ? STRENGTH_PULL * Math.max(0, Math.min(1, input.strength.value) - FIT_AVERAGE) : 0;
  if (input.strength) {
    parts.push({ key: "strength", label: "Track record", value: Math.min(1, Math.max(0, input.strength.value)), detail: input.strength.detail });
  }
  return { score: Math.min(1, FIT_AVERAGE + (raw - FIT_AVERAGE) * known + lift), parts };
}
var lastText = null;
var lastStems = new Set;
function stemsOf(text) {
  if (text !== lastText) {
    lastText = text;
    lastStems = new Set(words(text).map(stem));
  }
  return lastStems;
}

// src/lib/field.ts
var M = family_model_default;
var V = Object.keys(M.vocab).length;
var ALPHA = 0.5;
function familyPosterior(tokens) {
  const known = tokens.filter((t) => M.vocab[t] !== undefined);
  if (known.length === 0) {
    return null;
  }
  const logits = M.families.map((_, f) => known.reduce((sum, t) => sum + Math.log((M.vocab[t][f] + ALPHA) / (M.totals[f] + ALPHA * V)), 0));
  const damp = known.length ** 0.25;
  const scaled = logits.map((l) => l / damp);
  const top = Math.max(...scaled);
  const exp = scaled.map((l) => Math.exp(l - top));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}
var titleTokens = (text) => words(text).map(stem);
var familyMemo = new Map;
function familyOfTitle(text, sure = 0.5) {
  const key = `${sure}\x00${text}`;
  const hit = familyMemo.get(key);
  if (hit !== undefined)
    return hit;
  const found = familyOfTitleFresh(text, sure);
  if (familyMemo.size > 50000)
    familyMemo.clear();
  familyMemo.set(key, found);
  return found;
}
function familyOfTitleFresh(text, sure) {
  const post = familyPosterior(titleTokens(text));
  if (!post)
    return null;
  const best = post.indexOf(Math.max(...post));
  return post[best] >= sure ? M.families[best] : null;
}
var skillTokens = (skills) => [...skills].map((s) => `skill:${s.toLowerCase()}`);
var cache = new WeakMap;
function itemsOf(profile) {
  const hit = cache.get(profile);
  if (hit) {
    return hit;
  }
  const items = [];
  for (const p of profile.positions) {
    const post = familyPosterior(titleTokens(p.Title ?? ""));
    if (post)
      items.push(post);
  }
  for (const e of profile.education) {
    const post = familyPosterior(titleTokens(`${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""}`));
    if (post)
      items.push(post);
  }
  cache.set(profile, items);
  return items;
}
function fieldMatch(profile, skills, family) {
  const f = family ? M.families.indexOf(family) : -1;
  if (f < 0) {
    return null;
  }
  const items = [...itemsOf(profile)];
  for (const t of skillTokens(skills)) {
    const alone = familyPosterior([t]);
    if (alone)
      items.push(alone);
  }
  if (items.length === 0) {
    return null;
  }
  return Math.max(...items.map((p) => p[f]));
}
var FAMILIES = M.families;
function profileFields(profile) {
  const score = new Map;
  const jobs = profile.positions.length;
  const items = [...itemsOf(profile)];
  items.forEach((post, i) => {
    const top = Math.max(...post);
    const family = M.families[post.indexOf(top)];
    if (family === "Other" || top < 0.35)
      return;
    const weight = i < jobs ? 0.85 ** i : 0.6;
    score.set(family, (score.get(family) ?? 0) + weight * top);
  });
  const bySkill = new Map;
  for (const skill of profile.skills) {
    const alone = familyPosterior(skillTokens([skill.Name ?? ""]));
    if (!alone)
      continue;
    const top = Math.max(...alone);
    const family = M.families[alone.indexOf(top)];
    if (family !== "Other" && top >= 0.5)
      bySkill.set(family, (bySkill.get(family) ?? 0) + 1);
  }
  for (const [family, n] of bySkill) {
    if (n >= 2)
      score.set(family, (score.get(family) ?? 0) + 0.4 * n);
  }
  return [...score.entries()].sort((x, y) => y[1] - x[1]).map(([family]) => family);
}
function wordSpecificity(token, family) {
  const counts = M.vocab[token];
  if (!counts) {
    return 0.5;
  }
  const rates = counts.map((c, f) => c / (M.totals[f] || 1));
  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return 0.5;
  }
  const f = family ? M.families.indexOf(family) : -1;
  if (f >= 0) {
    return Math.min(1, Math.max(0.1, rates[f] / sum / 0.5));
  }
  const top = Math.max(...rates) / sum;
  return Math.min(1, Math.max(0.1, (top - 1 / M.families.length) / (0.6 - 1 / M.families.length)));
}
function consistencyWith(profile, family) {
  const f = family ? M.families.indexOf(family) : -1;
  if (f < 0) {
    return null;
  }
  const items = itemsOf(profile);
  if (items.length === 0) {
    return null;
  }
  const jobs = profile.positions.map((p) => familyPosterior(titleTokens(p.Title ?? ""))).filter((x) => x !== null);
  const schools = items.length - jobs.length > 0 ? items.slice(jobs.length) : [];
  let weight = 0;
  let total = 0;
  jobs.forEach((post, i) => {
    const w = 0.8 ** i;
    weight += w;
    total += w * post[f];
  });
  for (const post of schools) {
    weight += 0.5;
    total += 0.5 * post[f];
  }
  return weight > 0 ? total / weight : null;
}
function guessFamily(title, skills) {
  const post = familyPosterior([...titleTokens(title), ...skillTokens(skills)]);
  if (!post) {
    return null;
  }
  const best = Math.max(...post);
  return best >= 0.6 ? M.families[post.indexOf(best)] : null;
}

// src/lib/strength.ts
var NEIGHBOURS = [
  ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"],
  ["Software engineering", "Data, analytics & AI", "IT, cloud & security", "Hardware & engineering"],
  ["Marketing & communications", "Sales & account management", "Customer support & service", "Design & UX"],
  ["Product & project management", "Consulting & strategy", "Operations & supply chain", "Design & UX"],
  ["Research & academia", "Data, analytics & AI", "Healthcare & life sciences"],
  ["HR & recruiting", "Operations & supply chain", "Customer support & service"]
];
function relevanceOf(itemFamily, jobFamily) {
  if (!itemFamily || !jobFamily) {
    return "adjacent";
  }
  if (itemFamily === jobFamily) {
    return "same";
  }
  return NEIGHBOURS.some((g) => g.includes(itemFamily) && g.includes(jobFamily)) ? "adjacent" : "unrelated";
}

// src/lib/tiers.ts
var DISTINCT = [
  /goldman sachs/,
  /\bj\.?\s?p\.?\s?morgan|jpmorgan/,
  /morgan stanley/,
  /bank of america|merrill lynch/,
  /citigroup|citibank/,
  /barclays/,
  /deutsche bank/,
  /credit suisse/,
  /bnp paribas/,
  /\bhsbc\b/,
  /\blazard\b/,
  /rothschild/,
  /evercore/,
  /blackrock/,
  /^blackstone\b|blackstone group/,
  /\bkkr\b/,
  /mckinsey/,
  /boston consulting group/,
  /deloitte/,
  /\bpwc\b|pricewaterhouse/,
  /ernst (&|and) young/,
  /\bkpmg\b/,
  /\bgoogle\b|\balphabet inc/,
  /facebook/,
  /amazon web services/,
  /microsoft/,
  /netflix/,
  /nvidia/,
  /openai/,
  /anthropic/,
  /spotify/,
  /optiver/,
  /flow traders/,
  /jane street/,
  /\basml\b/,
  /\badyen\b/,
  /booking\.com|booking holdings/,
  /unilever/,
  /\bphilips\b/,
  /abn amro/,
  /rabobank/,
  /heineken/
];
var WHOLE = new Set(["shell", "apple", "meta", "meta platforms", "amazon", "bain", "bain & company", "bcg", "ey", "ing", "ing bank", "ing group", "citi", "ubs", "imc", "imc trading", "da vinci", "da vinci derivatives", "citadel", "citadel securities", "stripe", "mollie", "aws"]);
var SUFFIX = /\b(n\.?v\.?|b\.?v\.?|plc|ltd|limited|inc|llc|gmbh|ag|s\.?a\.?|corp(oration)?|company|co|holdings?|international|global|europe|emea|nederland|netherlands|the netherlands|uk|us|usa)\b\.?/g;
function wholeName(name) {
  return name.replace(/[,()]/g, " ").replace(SUFFIX, " ").replace(/^the\s+/, "").replace(/\s+/g, " ").trim().replace(/\s*(&|and)$/, "");
}
var tierMemo = new Map;
function employerTier(name, employees) {
  const key = `${employees ?? ""}\x00${name ?? ""}`;
  const hit = tierMemo.get(key);
  if (hit)
    return hit;
  const tier = employerTierFresh(name, employees);
  if (tierMemo.size > 50000)
    tierMemo.clear();
  tierMemo.set(key, tier);
  return tier;
}
function employerTierFresh(name, employees) {
  const n = (name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&amp;/g, "&").trim();
  if (n && (DISTINCT.some((re) => re.test(n)) || WHOLE.has(wholeName(n))))
    return "elite";
  if (typeof employees === "number") {
    if (employees >= 5000)
      return "large";
    if (employees >= 200)
      return "mid";
    return "small";
  }
  return "unknown";
}

// src/lib/odds-v2.ts
var NOISE = 1;
var stepMemo = new WeakMap;
function step(e) {
  const hit = stepMemo.get(e);
  if (hit !== undefined)
    return hit;
  const odds = e.at / (1 - e.at) * e.or;
  const z = phiInv(odds / (1 + odds)) - phiInv(e.at);
  stepMemo.set(e, z);
  return z;
}
var RELEVANCE_WORTH = { same: 1, adjacent: 0.3, unrelated: 0.05, none: 0 };
var RELEVANCE_SPAN = 1.5;
var RELEVANCE_FLOOR = 0.2;
var KIND_WORTH = { job: 1, internship: 0.8, student: 0.15 };
var PRESTIGE = { elite: 0.15, large: 0.07, mid: 0, small: 0, unknown: 0 };
var PRESTIGE_OFF_FIELD = 0.4;
var EFFECTS = {
  underqualified: { or: 0.53, at: 0.46 },
  overqualified: { or: 0.85, at: 0.12 },
  nonEu: { or: 0.66, at: 0.3 },
  euNonNative: { or: 0.88, at: 0.46 },
  foreignExperienceOnly: { or: 0.72, at: 0.1 },
  dutchNone: { or: 1 / 1.91, at: 0.147 },
  dutchBasic: { or: 1.39 / 1.91, at: 0.147 },
  dutchProfessional: { or: 1.74 / 1.91, at: 0.147 },
  referral: { or: 1.49, at: 0.35 },
  tailored: { or: 1.31, at: 0.125 },
  degreeInField: { or: 1.2, at: 0.17 },
  degreeBelowAsked: { or: 0.7, at: 0.46 },
  foreignDegree: { or: 0.92, at: 0.1 },
  secondInternship: { or: 1.15, at: 0.17 }
};
var DUTCH_NOT_ASKED_SHARE = 0.3;
var SKILL_SPAN = 0.2;
var LEVEL_YEARS = { Mid: 2, Senior: 5, Manager: 5, Director: 8 };
var YEAR_STEP = 0.08;
var YEAR_CAP = 3;
var DEGREE_FAMILY = [
  [/financ|accounting|accountancy|econom|banking|actuar|fiscal/i, "Finance & accounting"],
  [/computer science|software|informatica|computing|informatics/i, "Software engineering"],
  [/data science|statistic|artificial intelligence|machine learning|\bai\b|analytics|mathemat/i, "Data, analytics & AI"],
  [/marketing|communication|media/i, "Marketing & communications"],
  [/business|management|commerce|bedrijfskunde|\bmba\b/i, "Consulting & strategy"],
  [/law|legal|rechten/i, "Risk, compliance & legal"],
  [/engineer|mechanical|electrical|civil|aerospace|physics|chemical/i, "Hardware & engineering"],
  [/supply chain|logistic|operations/i, "Operations & supply chain"],
  [/psycholog|human resource|\bhr\b/i, "HR & recruiting"],
  [/design|ux|interaction/i, "Design & UX"],
  [/medicine|biolog|health|pharma|life science/i, "Healthcare & life sciences"]
];
var degreeMemo = new Map;
function degreeFamily(text) {
  const hit = degreeMemo.get(text);
  if (hit !== undefined)
    return hit;
  let fam = null;
  for (const [re, f] of DEGREE_FAMILY)
    if (re.test(text)) {
      fam = f;
      break;
    }
  fam ??= familyOfTitle(text, 0.3);
  if (degreeMemo.size > 1e4)
    degreeMemo.clear();
  degreeMemo.set(text, fam);
  return fam;
}
function pileFor(post, employerTierOfPost, employerAvgApplicants) {
  const interviews = /intern|stage|stagiair/i.test(post.title) ? 10 : 8;
  if (typeof post.applicants === "number" && post.applicants > 0)
    return { applicants: Math.max(post.applicants, interviews + 1), interviews, source: "posting" };
  if (typeof employerAvgApplicants === "number" && employerAvgApplicants > 0)
    return { applicants: Math.max(employerAvgApplicants, interviews + 1), interviews, source: "employer" };
  const byTier = { elite: 600, large: 220, mid: 150, small: 60, unknown: 180 };
  return { applicants: byTier[employerTierOfPost], interviews, source: "typical" };
}
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function phiInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 0.000000001), 1 - 0.000000001);
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425)
    return -phiInv(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}
var thresholdMemo = new Map;
function chanceIn(z, pile, noise = NOISE) {
  const key = `${pile.interviews}/${pile.applicants}/${noise}`;
  let T = thresholdMemo.get(key);
  if (T === undefined) {
    T = phiInv(1 - pile.interviews / pile.applicants) * Math.sqrt(1 + noise * noise);
    if (thresholdMemo.size > 1e4)
      thresholdMemo.clear();
    thresholdMemo.set(key, T);
  }
  return 1 - phi((T - z) / noise);
}
var relevanceMemo = new Map;
function roleRelevance(title, post, jobFamily) {
  const key = `${title}\x00${post.title}\x00${jobFamily ?? ""}`;
  const hit = relevanceMemo.get(key);
  if (hit)
    return hit;
  const r = roleRelevanceFresh(title, post, jobFamily);
  if (relevanceMemo.size > 50000)
    relevanceMemo.clear();
  relevanceMemo.set(key, r);
  return r;
}
function roleRelevanceFresh(title, post, jobFamily) {
  const norm = (x) => x.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(junior|senior|medior|intern|trainee|stagiair)\b/g, " ").replace(/\s+/g, " ").trim();
  if (norm(title) && norm(title) === norm(post.title))
    return "same";
  const fam = familyOfTitle(title, 0.3);
  if (!fam)
    return "unrelated";
  const fromTitle = familyOfTitle(post.title, 0.3);
  if (fam === jobFamily || fam === fromTitle)
    return "same";
  const a = relevanceOf(fam, jobFamily);
  const b = fromTitle ? relevanceOf(fam, fromTitle) : "unrelated";
  return a === "adjacent" || b === "adjacent" ? "adjacent" : "unrelated";
}
var isInternshipTitle = (t) => /intern|stagiair|werkstudent|trainee|placement|stage\b/i.test(t);
var isStudentJob = (t) => /barista|cashier|waiter|waitress|bartender|server|retail assistant|store assistant|shop assistant|kassa|bezorger|delivery|cleaner|horeca|sales assistant/i.test(t);
var LEARNED = {
  relevance: 1.05,
  years: 0.69,
  degreeInField: 0.83,
  nonEu: 1.19,
  euNonNative: 1.51,
  underqualified: 0.67,
  overqualified: 0.63,
  foreignDegree: 1,
  foreignExperienceOnly: 1.48,
  prestige: 0.4,
  dutch: 0.81
};
function strengthParts(post, profile, ctx = {}) {
  const base = derive(profile);
  const jobFamily = post.family ?? familyOfTitle(post.title, 0.3);
  const parts = [];
  let best = { worth: 0, role: null, rel: "none", kind: "job" };
  let relevantInternships = 0;
  let relevantYears = 0;
  for (const r of base.roles) {
    const kind = isStudentJob(r.title) ? "student" : isInternshipTitle(r.title) ? "internship" : "job";
    const rel = roleRelevance(r.title, post, jobFamily);
    const worth = RELEVANCE_WORTH[rel] * KIND_WORTH[kind];
    if (rel === "same" && kind === "internship")
      relevantInternships++;
    if (rel === "same" && kind === "job")
      relevantYears += r.years;
    if (worth > best.worth)
      best = { worth, role: r, rel, kind };
  }
  const degreeFams = profile.education.map((e) => degreeFamily(`${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""}`));
  const degreeIn = jobFamily !== null && degreeFams.includes(jobFamily);
  const firstJob = isInternshipTitle(post.title) || post.level_view === "Internship" || post.level_view === "Entry" || post.role_kind === "internship" || post.role_kind === "entry_job" || post.role_kind === "traineeship";
  let worth = best.worth;
  if (firstJob && degreeIn)
    worth = Math.max(worth, 0.55);
  parts.push({
    key: "relevance",
    label: best.role ? `Most relevant: ${best.role.title}${best.role.company ? ` at ${best.role.company}` : ""} (${best.rel === "same" ? "same line of work" : best.rel === "adjacent" ? "a neighbouring line of work" : "another line of work"})` : degreeIn ? "Degree in this line of work, no work in it yet" : "No work in this line of work yet",
    z: RELEVANCE_FLOOR + RELEVANCE_SPAN * worth,
    source: "Mihut 2022; Thijssen et al. 2019; Nunley et al. 2016"
  });
  let prestige = 0;
  let prestigeRole = "";
  for (const r of base.roles) {
    const kind = isStudentJob(r.title) ? "student" : isInternshipTitle(r.title) ? "internship" : "job";
    if (kind === "student")
      continue;
    const tier = employerTier(r.company);
    const same = roleRelevance(r.title, post, jobFamily) === "same";
    const z = PRESTIGE[tier] * (same ? 1 : PRESTIGE_OFF_FIELD);
    if (z > prestige) {
      prestige = z;
      prestigeRole = `${r.company}${same ? "" : " (other line of work)"}`;
    }
  }
  if (ctx.record) {
    const fromRecord = PRESTIGE.elite * Math.max(0, Math.min(1, (ctx.record.value - 0.4) / 0.5));
    if (fromRecord > prestige) {
      prestige = fromRecord;
      prestigeRole = ctx.record.detail;
    }
  }
  if (prestige > 0)
    parts.push({ key: "prestige", label: `Known name or record: ${prestigeRole}`, z: prestige, source: "Kessler, Low & Sullivan 2019; Oreopoulos 2011" });
  relevantYears += ctx.extraYears ?? 0;
  const years = base.years + (ctx.extraYears ?? 0);
  const asked = post.years_min ?? (firstJob ? 0 : 2);
  const extra = Math.min(YEAR_CAP, Math.max(0, relevantYears - asked));
  if (extra > 0)
    parts.push({ key: "years", label: `${extra.toFixed(1)} more years in this line of work than asked`, z: YEAR_STEP * extra, source: "Nunley et al. 2016" });
  if (relevantInternships >= 2)
    parts.push({ key: "secondInternship", label: "A second internship in this line of work", z: step(EFFECTS.secondInternship), source: "Kessler, Low & Sullivan 2019" });
  const implied = post.years_min ?? (post.level_view ? LEVEL_YEARS[post.level_view] ?? null : null);
  const fromLevel = post.years_min == null && implied !== null;
  if (implied && years < implied) {
    const short = Math.min(1, (implied - years) / implied);
    parts.push({ key: "underqualified", label: fromLevel ? `A ${post.level_view?.toLowerCase()} job (usually ${implied}+ years), you have ${years.toFixed(1)}` : `Asks for ${implied}+ years, you have ${years.toFixed(1)}`, z: step(EFFECTS.underqualified) * (0.4 + 0.8 * short), source: "GEMM (own fit, Dutch applications); scaled by how far short, our assumption" });
  } else if (post.years_min !== null && post.years_min !== undefined && years > 2 * post.years_min + 4) {
    parts.push({ key: "overqualified", label: "Much more experience than asked", z: step(EFFECTS.overqualified), source: "Baert & Verhaest 2019" });
  }
  if (degreeIn)
    parts.push({ key: "degreeInField", label: "Degree in this line of work", z: step(EFFECTS.degreeInField), source: "Humburg & van der Velden 2015 (direction); our size" });
  const rank = { bachelor: 1, master: 2, phd: 3 };
  const myDegree = ctx.assumeDegree ? Math.max(rank[base.degree] ?? 0, 2) : rank[base.degree] ?? 0;
  if (post.degree_asked && myDegree < rank[post.degree_asked])
    parts.push({ key: "degreeBelowAsked", label: `Asks for a ${post.degree_asked}`, z: step(EFFECTS.degreeBelowAsked), source: "GEMM underqualified, halved" });
  if (post.skills.length >= 3) {
    const have = new Set([...base.skills, ...ctx.extraSkills ?? []].map((x) => x.toLowerCase()));
    const weight = { must: 1, strong: 0.7, optional: 0.4, nice: 0.2, unspecified: 0.6 };
    let got = 0;
    let all = 0;
    for (const sk of post.skills) {
      const w = weight[post.tiers?.[sk] ?? "unspecified"] ?? 0.6;
      all += w;
      if (have.has(sk.toLowerCase()))
        got += w;
    }
    const cover = all > 0 ? got / all : 0.5;
    parts.push({ key: "skills", label: `Skills the job names: ${Math.round(cover * 100)}% covered`, z: SKILL_SPAN * (cover - 0.5) * 2, source: "Our assumption (no experiment varies listed skills)" });
  }
  if (profile.origin === "non_eu")
    parts.push({ key: "nonEu", label: "Non-EU background", z: step(EFFECTS.nonEu), source: "Lippens, Vermeiren & Baert 2023; GEMM" });
  else if (profile.origin === "eu_non_native")
    parts.push({ key: "euNonNative", label: "EU background, not Dutch", z: step(EFFECTS.euNonNative), source: "GEMM" });
  if (profile.origin === "non_eu" && profile.education.length > 0 && !base.dutchDegree)
    parts.push({ key: "foreignDegree", label: "Degree from outside the Netherlands", z: step(EFFECTS.foreignDegree), source: "Oreopoulos 2011" });
  if (base.share.nonEu > 0.99 && base.roles.length > 0)
    parts.push({ key: "foreignExperienceOnly", label: "All work experience outside the EU", z: step(EFFECTS.foreignExperienceOnly), source: "Oreopoulos 2011" });
  const dutch = profile.dutch;
  const level = dutch === "none" ? EFFECTS.dutchNone : dutch === "basic" ? EFFECTS.dutchBasic : dutch === "professional" ? EFFECTS.dutchProfessional : null;
  if (level) {
    const name = dutch === "none" ? "No Dutch" : dutch === "basic" ? "Basic Dutch" : "Professional (not native) Dutch";
    if (post.dutch_required)
      parts.push({ key: "dutch", label: `${name}; the job asks for Dutch`, z: step(level), source: "Carlsson, Eriksson & Rooth 2023" });
    else
      parts.push({ key: "dutchNotAsked", label: name, z: step(level) * DUTCH_NOT_ASKED_SHARE, source: "Carlsson, Eriksson & Rooth 2023, scaled down for an English-language job (our assumption)" });
  }
  if (ctx.referral)
    parts.push({ key: "referral", label: "A referral", z: step(EFFECTS.referral), source: "Ashby 2026" });
  if (ctx.tailored)
    parts.push({ key: "tailored", label: "A cover letter written for this job", z: step(EFFECTS.tailored), source: "ResumeGo 2020" });
  return parts.map((p) => ({ ...p, study: p.z, z: p.z * (LEARNED[p.key] ?? 1) }));
}
var FLOOR = 0.005;
function oddsV2(post, profile, ctx = {}) {
  const parts = strengthParts(post, profile, ctx);
  const z = parts.reduce((s, p) => s + p.z, 0);
  const pile = pileFor(post, employerTier(post.employer_display || post.employer, ctx.employerEmployees), ctx.employerAvgApplicants);
  const p = chanceIn(z, pile);
  const smaller = { ...pile, applicants: Math.max(pile.interviews + 1, pile.applicants / 1.6) };
  const bigger = { ...pile, applicants: pile.applicants * 1.6 };
  const low = chanceIn(z - 0.3, bigger);
  const high = chanceIn(z + 0.3, smaller);
  const percentile = 1 - phi(z / Math.sqrt(1));
  const floor = (x) => Number.isFinite(x) ? FLOOR + Math.min(1, Math.max(0, x)) * (0.99 - FLOOR) : FLOOR;
  return { p: floor(p), low: floor(Math.min(low, p)), high: floor(Math.max(high, p)), strength: z, pile, percentile, parts };
}

// src/lib/degree.ts
var plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var PHD = /\b(ph\.?\s?d\.?|dphil|doctor(ate)? of|doctorate|doctoral|doutorado|doktora|doctorat|doctorado|promotion|dottorato)\b/;
var MASTER = /\b(master|masters|master's|msc|m\.?\s?sc|mba|m\.?\s?tech|m\.?\s?eng|meng|m\.?\s?phil|mphil|m\.?\s?s|m\.?\s?a|m\.?\s?res|mres|llm|mestrado|mestre|yuksek lisans|maestria|magister|magistere|maitrise|laurea magistrale|specialistica|engineer'?s degree|ingenieur|ingenier[oa]|engenheir[oa]|diplom[- ]?ingenieur|dipl\.?-?ing)\b/;
var BACHELOR = /\b(bachelor|bachelors|bachelor's|bsc|b\.?\s?sc|b\.?\s?tech|btech|b\.?\s?eng|beng|b\.?\s?e|b\.?\s?a|b\.?\s?s|b\.?\s?com|bcom|b\.?\s?b\.?\s?a|bba|llb|hbo|bacharelado|bacharel|licenciatura|licenciado|lisans|licence|laurea|bakkalaureus|undergraduate|honou?rs degree)\b/;
var BELOW = /\b(associate|high school|secondary|certificate|diploma|vocational|mbo|a-levels?|ged|bootcamp|nanodegree|course|apprenticeship|foundation|lycee|ensino medio|bachillerato)\b/;
function degreeOfName(name) {
  const t = plain(name).replace(/[^\w\s.'-]/g, " ").replace(/\bpre[- ]?master\w*/g, "bachelor");
  if (t.trim() === "")
    return "unknown";
  if (PHD.test(t))
    return "phd";
  if (MASTER.test(t))
    return "master";
  if (BACHELOR.test(t))
    return "bachelor";
  if (BELOW.test(t))
    return "unknown";
  return "bachelor";
}
var RANK = { unknown: 0, bachelor: 1, master: 2, phd: 3 };
var CV_PHD = /\b(ph\.?\s?d\.?\b|doctor of philosophy|doctorate)/;
var CV_MASTER = /\b(master of [a-z]+|master'?s degree|msc\b|m\.sc\b|mba\b|m\.tech\b)/;
var CV_BACHELOR = /\b(bachelor of [a-z]+|bachelor'?s degree|bsc\b|b\.sc\b|b\.tech\b|hbo\b)/;
function degreeOf(education, cv) {
  let best = "unknown";
  for (const e of education) {
    const name = e["Degree Name"] ?? "";
    const level = name.trim() !== "" ? degreeOfName(name) : degreeOfName(e["Field Of Study"] ?? "");
    if (RANK[level] > RANK[best])
      best = level;
  }
  if (education.length > 0) {
    return best;
  }
  const t = plain(cv);
  return CV_PHD.test(t) ? "phd" : CV_MASTER.test(t) ? "master" : CV_BACHELOR.test(t) ? "bachelor" : "unknown";
}

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
var fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var MONTH_PREFIXES = [...BY_WORD.keys(), "jui"];
var MONTH_PATTERN = `(?:${MONTH_PREFIXES.join("|")})[\\p{L}]{0,8}\\.?`;
function monthIndex(word) {
  const folded = fold(word.replace(/\./g, ""));
  if (folded.startsWith("juil"))
    return 6;
  if (folded.startsWith("juin"))
    return 5;
  const i = BY_WORD.get(folded.slice(0, 3));
  return i === undefined ? null : i;
}

// src/lib/languages.ts
var LANGUAGES = ["german", "french", "spanish", "italian", "portuguese", "polish", "czech", "greek", "swedish", "norwegian", "danish", "finnish", "turkish", "arabic", "russian", "japanese", "chinese", "mandarin", "korean", "hungarian", "romanian", "bulgarian", "ukrainian", "hebrew", "hindi", "thai", "vietnamese", "indonesian"];
var ONE = `(?:${LANGUAGES.join("|")})`;
var LIST = new RegExp(`\\b(${ONE}(?:\\s*(?:&|and|/|,|or)\\s*${ONE})*)[\\s-]*(?:speaking|speaker|speakers|language skills)`, "gi");
var NATIVE = new RegExp(`\\b(?:native|fluent|bilingual)\\s+(?:in\\s+)?(${ONE})\\b`, "gi");
var canonical = (l) => l === "mandarin" ? "chinese" : l;
function requiredLanguages(title) {
  const found = [];
  for (const re of [LIST, NATIVE]) {
    re.lastIndex = 0;
    for (let m = re.exec(title);m; m = re.exec(title)) {
      for (const l of m[1].toLowerCase().match(new RegExp(ONE, "g")) ?? []) {
        const c = canonical(l);
        if (!found.includes(c))
          found.push(c);
      }
    }
  }
  return found;
}
function hasLanguage(listed, required) {
  const names = listed.map((l) => canonical((l.Name ?? "").toLowerCase().trim())).filter(Boolean);
  if (names.length === 0)
    return "unknown";
  return required.some((r) => names.some((n) => n === r || n.startsWith(`${r} `) || n.includes(r))) ? "pass" : "fail";
}

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
var HOURS_PER_YEAR = 2080;
var EURO_FORMAT = new Intl.NumberFormat("en-NL");
var eur = (n) => n == null ? "—" : `€${EURO_FORMAT.format(Math.round(n))}`;
function incomeTax(taxable, tax) {
  const [first, second, third] = tax.box1_brackets;
  let due = Math.min(taxable, first.upto) * first.rate;
  if (taxable > first.upto) {
    due += (Math.min(taxable, second.upto) - first.upto) * second.rate;
  }
  if (taxable > second.upto) {
    due += (taxable - second.upto) * third.rate;
  }
  return due;
}
function credit(taxable, c) {
  if (taxable <= c.phase_out_start) {
    return c.max;
  }
  if (taxable >= c.zero_at) {
    return 0;
  }
  return Math.max(0, c.max - c.phase_out_rate * (taxable - c.phase_out_start));
}
function netMonth(grossAnnual, ruling, under30Master, tax) {
  const r = tax.ruling_30pct;
  const floor = under30Master ? r.min_salary_under30_masters : r.min_salary;
  const free = ruling ? Math.min(0.3 * grossAnnual, Math.max(0, grossAnnual - floor)) : 0;
  const taxable = grossAnnual - free;
  const due = Math.max(0, incomeTax(taxable, tax) - credit(taxable, tax.general_tax_credit) - credit(taxable, tax.labour_tax_credit));
  return { net: (grossAnnual - due) / 12, freeShare: free / grossAnnual };
}
var NL_PLACES = /netherlands|nederland|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|groningen|leiden|delft|tilburg|maastricht|nijmegen/i;
var EU_PLACES = /germany|france|belgium|spain|italy|portugal|austria|ireland|sweden|denmark|finland|poland|czech|hungary|greece|romania|bulgaria|croatia|slovakia|slovenia|lithuania|latvia|estonia|luxembourg|malta|cyprus|berlin|paris|brussels|munich|madrid|barcelona|milan|lisbon|dublin|vienna|stockholm|copenhagen|warsaw|prague|switzerland|norway|united kingdom|london/i;
var DUTCH_SCHOOL = /(hogeschool|\bvu\b|\buva\b|erasmus|tilburg|maastricht|groningen|utrecht|leiden|delft|twente|wageningen|nyenrode|\bhva\b|amsterdam)/i;
function parseDate(value) {
  if (!value) {
    return null;
  }
  const named = value.match(/(?:^|[^\p{L}])(\p{L}{3,10})\.?\s+(\d{4})\b/u);
  const month = named ? monthIndex(named[1]) : null;
  if (named && month !== null) {
    return new Date(Number(named[2]), month, 1);
  }
  const numeric = value.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/) ?? null;
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    return new Date(Number(numeric[2]), Number(numeric[1]) - 1, 1);
  }
  const isoLike = value.match(/\b(\d{4})\s*[/.-]\s*(\d{1,2})\b/);
  if (isoLike && Number(isoLike[2]) >= 1 && Number(isoLike[2]) <= 12) {
    return new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, 1);
  }
  const year = value.match(/\b(\d{4})\b/);
  return year ? new Date(Number(year[1]), 0, 1) : null;
}
function ageOf(profile) {
  return profile.birth ? new Date().getFullYear() - profile.birth : null;
}
function ageBandOf(age) {
  if (age == null) {
    return null;
  }
  const low = Math.floor(age / 5) * 5;
  if (low < 15) {
    return "15 tot 20 jaar";
  }
  if (low >= 75) {
    return "75 jaar of ouder";
  }
  if (low >= 65) {
    return "65 tot 75 jaar";
  }
  return `${low} tot ${low + 5} jaar`;
}
var derivedCache = new WeakMap;
function derive(profile) {
  const hit = derivedCache.get(profile);
  if (hit) {
    return hit;
  }
  const made = deriveFresh(profile);
  derivedCache.set(profile, made);
  return made;
}
function deriveFresh(profile) {
  const now = new Date;
  let months = 0;
  const spans = [];
  let nl = 0;
  let eu = 0;
  let nonEu = 0;
  let internship = false;
  const roles = profile.positions.map((row) => {
    const start = parseDate(row["Started On"]);
    const end = parseDate(row["Finished On"]) ?? now;
    const span = start ? Math.max(0, (end.getTime() - start.getTime()) / 2629800000) : 0;
    if (start && end.getTime() > start.getTime()) {
      spans.push([start.getTime(), end.getTime()]);
    }
    months += span;
    const place = row.Location ?? "";
    const where = NL_PLACES.test(place) ? "NL" : EU_PLACES.test(place) ? "EU" : place ? "non-EU" : "unknown";
    if (where === "NL") {
      nl += span;
    } else if (where === "EU") {
      eu += span;
    } else if (where === "non-EU") {
      nonEu += span;
    }
    if (/intern|stagiair|werkstudent|trainee/i.test(row.Title ?? "")) {
      internship = true;
    }
    return { title: row.Title ?? "", company: row["Company Name"] ?? "", where, years: span / 12 };
  });
  months = 0;
  let reach = -Infinity;
  for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
    const begin = Math.max(from, reach);
    if (to > begin) {
      months += (to - begin) / 2629800000;
      reach = to;
    }
  }
  const degree = degreeOf(profile.education, profile.cv);
  const dutchDegree = profile.education.some((e) => NL_PLACES.test(e["School Name"] ?? "") || DUTCH_SCHOOL.test(e["School Name"] ?? ""));
  const skills = new Set(profile.skills.map((s) => (s.Name ?? "").toLowerCase()));
  const haystack = `${profile.cv} ${profile.skills.map((s) => s.Name).join(" ")} ${profile.positions.map((p) => p.Description ?? "").join(" ")}`.toLowerCase();
  for (const [name, pattern] of Object.entries(SKILLS)) {
    if (pattern.test(haystack)) {
      skills.add(name);
    }
  }
  const total = nl + eu + nonEu || 1;
  const age = ageOf(profile);
  const ends = profile.education.map((e) => ({ end: parseDate(e["End Date"]), start: parseDate(e["Start Date"]) }));
  const running = ends.some((e) => e.end === null && e.start !== null || e.end !== null && e.end.getTime() > now.getTime());
  const finished = ends.map((e) => e.end).filter((d) => d !== null && d.getTime() <= now.getTime());
  const dated = ends.some((e) => e.end !== null || e.start !== null);
  const studying = typeof profile.studying === "boolean" ? profile.studying : !dated ? null : running;
  const graduatedMonthsAgo = studying === false && finished.length > 0 ? Math.max(0, (now.getTime() - Math.max(...finished.map((d) => d.getTime()))) / 2629800000) : null;
  return {
    roles,
    years: months / 12,
    share: { nl: nl / total, eu: eu / total, nonEu: nonEu / total },
    internship,
    degree,
    dutchDegree,
    skills,
    rulingEligible: profile.abroad >= 16,
    age,
    ageBand: ageBandOf(age),
    studying,
    graduatedMonthsAgo
  };
}
var sectorFor = (cat) => cat === "finance_business" ? "K" : cat === "tech" ? "J" : "M";
function bandFor(code, cat, profile, ref) {
  const band = code ? ref.bands[code] : undefined;
  if (!band) {
    return null;
  }
  const hourly = { p25: Number(band.p25_hourly), p50: Number(band.p50_hourly), p75: Number(band.p75_hourly) };
  const gross = (k) => hourly[k] * HOURS_PER_YEAR * 1.08 / 12;
  const excl = (k) => hourly[k] * HOURS_PER_YEAR / 12;
  const each = (f) => ({ p25: f("p25"), p50: f("p50"), p75: f("p75") });
  const d = derive(profile);
  const factor = d.ageBand ? ref.ageFactors[sectorFor(cat)]?.[d.ageBand] ?? null : null;
  return {
    band,
    grossMonth: each(gross),
    exclMonth: each(excl),
    netOff: each((k) => netMonth(gross(k) * 12, false, false, ref.tax).net),
    netRuling: each((k) => netMonth(gross(k) * 12, true, false, ref.tax).net),
    netRulingUnder30: each((k) => netMonth(gross(k) * 12, true, true, ref.tax).net),
    ageFactor: factor,
    ageBand: d.ageBand,
    ageAdjustedP50: factor ? gross("p50") * factor : null
  };
}
function payChoicesOf(profile) {
  const d = derive(profile);
  const age = ageOf(profile) ?? 30;
  const route = profile.permit === "eu" ? "eu" : profile.permit === "orientation_year" ? "orientation_year" : age < 30 ? "hsm_under_30" : "hsm_30_plus";
  return { ruling: d.rulingEligible, masterFloor: (d.age ?? 99) < 30 && d.degree === "master", route, ...profile.payChoices };
}
function myThreshold(profile, ref) {
  const t = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday;
  const route = payChoicesOf(profile).route;
  if (route === "eu") {
    return 0;
  }
  if (route === "orientation_year") {
    return t.reduced_orientation_year;
  }
  return route === "hsm_under_30" ? t.under_30 : t.age_30_plus;
}
function computeShares(postings) {
  const out = {};
  for (const cat of ["finance_business", "tech", "other"]) {
    const ps = postings.filter((p) => p.cat === cat);
    const n = ps.length || 1;
    const counts = {};
    for (const p of ps) {
      for (const s of p.skills) {
        counts[s] = (counts[s] ?? 0) + 1;
      }
    }
    out[cat] = {
      n: ps.length,
      dutchRequired: ps.filter((p) => p.dutch_required).length / n,
      visaMention: ps.filter((p) => p.visa_mention).length / n,
      asking5plus: ps.filter((p) => (p.years_min ?? 0) >= 5).length / n,
      junior: ps.filter((p) => p.junior_title).length / n,
      skills: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]))
    };
  }
  return out;
}
var NO_WHAT_IF = { dutch: false, years: 0, skills: [], referral: false, tailor: null, degree: false, student: false };
var DEGREE_ORDER = { unknown: 0, bachelor: 1, master: 2, phd: 3 };
var DUTCH_ORDER = { none: 0, basic: 1, professional: 2, native: 3 };
function hasCvData(profile) {
  return profile.positions.length > 0 || profile.education.length > 0 || profile.skills.length > 0 || profile.cv.trim().length >= 20;
}
function standing(post, profile, ref, shares, whatIf = NO_WHAT_IF, referral = false, strength = null) {
  const base = derive(profile);
  const years = base.years + whatIf.years;
  const degree = whatIf.degree && base.degree !== "phd" ? "master" : base.degree;
  const skills = new Set([...base.skills, ...whatIf.skills]);
  const dutch = whatIf.dutch ? "professional" : profile.dutch;
  const tailor = whatIf.tailor === true;
  const hasReferral = whatIf.referral || referral;
  const view = bandFor(post.cbs_group, post.cat, profile, ref);
  const gates = [];
  if (payChoicesOf(profile).route === "eu") {
    gates.push({ name: "Permit", status: "pass", why: "EU/EEA citizen: no salary threshold", source: "IND" });
  } else if (isInternship(post)) {
    gates.push({ name: "Permit", status: "unknown", why: "an internship allowance is not a salary, so the salary threshold can't be checked; ask the employer which permit route applies", source: "IND" });
  } else if (!view) {
    gates.push({ name: "Permit", status: "unknown", why: "no pay band for this title, so the threshold can't be checked", source: "IND" });
  } else {
    const threshold = myThreshold(profile, ref);
    gates.push({
      name: "Permit",
      status: view.exclMonth.p50 >= threshold ? "pass" : "fail",
      why: `median pay ${eur(view.exclMonth.p50)}/month excl. holiday vs your threshold ${eur(threshold)}`,
      source: "CBS 2024 · IND 2026"
    });
  }
  if (post.degree_asked) {
    gates.push({
      name: "Degree",
      status: DEGREE_ORDER[degree] >= DEGREE_ORDER[post.degree_asked] ? "pass" : "fail",
      why: `posting asks ${post.degree_asked}; your profile: ${degree}${base.dutchDegree ? " (Dutch institution)" : ""}`,
      source: "posting · your profile"
    });
  } else {
    gates.push({ name: "Degree", status: "pass", why: "no degree level stated", source: "posting" });
  }
  if (post.years_min != null) {
    gates.push({ name: "Minimum years", status: years >= post.years_min ? "pass" : "fail", why: `${post.years_min}+ asked · ${years.toFixed(1)} on your profile`, source: "posting · your profile" });
  } else {
    gates.push({ name: "Minimum years", status: "pass", why: "no minimum stated", source: "posting" });
  }
  if (post.dutch_required) {
    gates.push({ name: "Dutch", status: DUTCH_ORDER[dutch] >= 2 ? "pass" : "fail", why: `Dutch required · your level: ${dutch}`, source: "posting" });
  } else {
    gates.push({ name: "Dutch", status: "pass", why: "not required in this posting", source: "posting" });
  }
  if (post.enrollment === "required" || post.enrollment === "recent") {
    const asks = post.enrollment === "required" ? "asks for a current student" : "asks for a current student or a recent graduate";
    const studying = whatIf.student ? true : base.studying;
    const recent = base.graduatedMonthsAgo !== null && base.graduatedMonthsAgo <= 12;
    const status = studying === true ? "pass" : studying === null ? "unknown" : post.enrollment === "recent" ? base.graduatedMonthsAgo === null ? "unknown" : recent ? "pass" : "fail" : "fail";
    gates.push({
      name: "Student",
      status,
      why: studying === null ? `the posting ${asks}; say whether you are studying to check` : studying ? `the posting ${asks} · you are studying` : `the posting ${asks} · you are not studying${base.graduatedMonthsAgo !== null ? ` (finished ${Math.round(base.graduatedMonthsAgo)} months ago)` : ""}`,
      source: "posting · your profile"
    });
  }
  const needed = requiredLanguages(post.title);
  if (needed.length > 0) {
    const have = hasLanguage(profile.languages, needed);
    gates.push({
      name: "Language",
      status: have,
      why: have === "unknown" ? `the title asks for ${needed.join(" and ")}; add your languages to your profile to check` : `the title asks for ${needed.join(" and ")} · ${have === "pass" ? "you list it" : "not among your languages"}`,
      source: "posting title · your profile"
    });
  }
  const failing = gates.filter((g) => g.status === "fail").length;
  const catShare = shares[post.cat];
  const checklist = post.skills.map((skill) => ({ skill, have: skills.has(skill), share: catShare?.skills[skill] ?? null }));
  const thin = (catShare?.n ?? 0) < 30;
  const mine = [profile.cv, profile.positions.map((p) => `${p.Title ?? ""} ${p.Description ?? ""}`).join(" "), profile.education.map((e) => `${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""} ${e.Notes ?? ""}`).join(" "), [...skills].join(" ")].join(" ").toLowerCase();
  const family = post.family ?? guessFamily(post.title_clean ?? post.title, post.skills);
  const fit = fitOf({ title: post.title_clean ?? post.title, level: levelOf(post), years, wanted: post.skills.map((name) => ({ name, tier: post.tiers?.[name] ?? "unspecified" })), have: (skill) => skills.has(skill), text: mine, field: fieldMatch(profile, skills, family), consistency: consistencyWith(profile, family), specificity: (w) => wordSpecificity(w, family), strength });
  const needsProfile = !hasCvData(profile);
  let rate = null;
  if (!needsProfile) {
    const v2 = oddsV2(post, whatIf.dutch ? { ...profile, dutch } : profile, {
      referral: hasReferral,
      tailored: tailor,
      record: strength,
      extraYears: whatIf.years,
      extraSkills: whatIf.skills,
      assumeDegree: whatIf.degree
    });
    const sign = (z) => z >= 0 ? "stronger" : "weaker";
    const lines = [
      { label: `About ${Math.round(v2.pile.applicants)} people apply and about ${v2.pile.interviews} are invited${v2.pile.source === "posting" ? " (the posting shows the count)" : v2.pile.source === "employer" ? " (this employer's average)" : " (typical for an employer like this)"}`, source: "Greenhouse 2026 · Ashby 2026" },
      ...v2.parts.map((p) => ({ label: `${p.label}: ${sign(p.z)} by ${Math.abs(p.z).toFixed(2)}`, source: p.source }))
    ];
    rate = { low: v2.low, mid: v2.p, high: v2.high, lines, thin };
  }
  return { gates, failing, checklist, have: checklist.filter((c) => c.have).length, total: checklist.length, band: view, rate, fit, needsProfile };
}
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
function daysSince(posted, now = new Date) {
  const [y, m, d] = posted.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86400000));
}
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
var ENTRY_AGE_FACTOR = { finance_business: 0.675, tech: 0.708, other: 0.691 };
var isEntry = (post) => post.level_view === "Entry" || post.role_kind === "entry_job";
function allowanceOf(post) {
  const own = INTERN_POSTINGS[post.id];
  if (own) {
    return { low: own[0], high: own[1], source: "Allowance stated in the posting" };
  }
  const employer = INTERN_EMPLOYERS[post.employer];
  if (employer && employer.low !== null && employer.high !== null) {
    return { low: employer.low, high: employer.high, source: "Allowance this employer states in its postings" };
  }
  return { low: INTERN_MARKET.p25, high: INTERN_MARKET.p75, source: "Typical internship allowance, from employers that state it" };
}
var TRAINEE_PAY = { low: 2450, high: 3500 };
var nearest = (n, step) => Math.round(n / step) * step;
var range = (low, high) => low === high ? eur(low) : `${eur(low)} – ${eur(high)}`;
function payOf(post, reference) {
  const hourly = formatHourly(post.pay_posted);
  if (hourly) {
    const eur2 = (n) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
    return { text: hourly.low === hourly.high ? eur2(hourly.low) : `${eur2(hourly.low)} – ${eur2(hourly.high)}`, source: "Stated by the employer", basis: "Stated", perHour: true };
  }
  const stated = formatPosted(post.pay_posted);
  if (stated && stated.high <= stated.low * 3) {
    const divide = stated.unit === "year" ? 12 : 1;
    const step = stated.unit === "month" && stated.low === stated.high ? 1 : 10;
    return { text: range(nearest(stated.low / divide, step), nearest(stated.high / divide, step)), source: "Stated by the employer", basis: "Stated" };
  }
  if (post.role_kind === "traineeship") {
    return { text: range(TRAINEE_PAY.low, TRAINEE_PAY.high), source: "Typical traineeship pay", basis: "Typical" };
  }
  if (post.role_kind === "working_student") {
    return { text: null, source: null, basis: "Not known" };
  }
  if (isInternship(post)) {
    const a = allowanceOf(post);
    return { text: range(a.low, a.high), source: a.source, basis: "Allowance" };
  }
  const band = reference && post.cbs_group ? reference.bands[post.cbs_group] : null;
  if (band) {
    const month = (hourly) => nearest(hourly * 2080 * 1.08 / 12, 50);
    const factor = isEntry(post) ? ENTRY_AGE_FACTOR[post.cat] : 1;
    return { text: range(month(Number(band.p25_hourly) * factor), month(Number(band.p75_hourly) * factor)), source: "Typical for this kind of job", basis: "Typical" };
  }
  return { text: null, source: null, basis: "Not known" };
}
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
  return band ? { month: Number(band.p50_hourly) * 2080 * 1.08 * (isEntry(post) ? ENTRY_AGE_FACTOR[post.cat] : 1) / 12, basis: "Typical" } : null;
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
var plain2 = (text) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
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
  const text = plain2(`${post.title} ${post.employer_display} ${post.region ?? ""} ${fieldOf(post) ?? ""} ${industryOf(post) ?? ""} ${levelOf(post)}`);
  const made = { text, squashed: squashed(text) };
  searchable.set(post, made);
  return made;
}
function matchesWords(post, words) {
  if (words.length === 0) {
    return true;
  }
  const { text, squashed: run } = searchTextOf(post);
  return words.every((w) => {
    const forms = w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w];
    if (w.length <= 3) {
      return startsAWord(text, w);
    }
    return forms.some((f) => text.includes(f) || squashed(f).length >= RUN_TOGETHER_FROM && run.includes(squashed(f)));
  });
}
function applyFilters(posts, filters, env = {}) {
  const words = plain2(filters.query).split(/\s+/).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  return posts.filter((post) => {
    if (post.valid_through && /^\d{4}-\d{2}-\d{2}/.test(post.valid_through) && post.valid_through.slice(0, 10) < today) {
      return false;
    }
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
    if (!matchesWords(post, words)) {
      return false;
    }
    return true;
  });
}

// src/lib/tracker.ts
var NO_TRACKER_FILTER = { status: [], followUp: false, hideClosed: false };

// src/lib/saved-views.ts
var FIT_SEED_VIEWS = [{ id: "fit", name: "Best fit", layout: "table", filters: { ...DEFAULT_FILTERS }, tracker: NO_TRACKER_FILTER }];

// src/lib/types.ts
var DEFAULT_PROFILE = {
  permit: "other_non_eu",
  birth: 1998,
  abroad: 0,
  origin: "non_eu",
  dutch: "basic",
  studying: null,
  salary: "",
  tailor: false,
  cv: "",
  positions: [],
  education: [],
  skills: [],
  languages: [],
  occ: "",
  name: "",
  headline: "",
  place: "",
  about: "",
  avatar: "",
  columns: [],
  columnTypes: {},
  notes: {},
  people: [],
  views: {},
  onboarded: false,
  prefs: null,
  prefsOn: false
};

// src/lib/fit-filters.ts
function withFitLanguage(filters) {
  return filters.language.length === 0 ? { ...filters, language: [...DEFAULT_FILTERS.language] } : filters;
}
function fitFilters(filters, profile, fields = profileFields(profile)) {
  const f = withFitLanguage(filters);
  return f.field.length > 0 || fields.length === 0 ? f : { ...f, field: fields };
}

// src/lib/hear-back.ts
var TOP_SHARE = 0.05;
var LIFT = 2;
var cache2 = new WeakMap;
function hearBackFor(postings, profile, referrals, record) {
  const byPool = cache2.get(profile) ?? new WeakMap;
  cache2.set(profile, byPool);
  const hit = byPool.get(postings);
  if (hit)
    return hit;
  const out = new Map;
  if (hasCvData(profile)) {
    const scored = postings.filter((p) => !p.closed_at).map((post) => ({ post, r: oddsV2(post, profile, { referral: referrals.has(post.id), record: record(post) }) }));
    const room = Math.max(1, Math.floor(scored.length * TOP_SHARE));
    const ranked = [...scored].sort((a, b) => b.r.p - a.r.p).slice(0, room);
    for (const { post, r } of ranked) {
      const average = r.pile.interviews / r.pile.applicants;
      if (r.p < LIFT * average)
        continue;
      const lift = r.parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z)[0];
      const pile = `about ${Math.round(r.pile.applicants)} people apply and about ${r.pile.interviews} are invited`;
      out.set(post.id, { chance: r.p, reason: `You stand out here: ${pile}, and your chance is ${Math.round(r.p / average)} times an average applicant's${lift ? `, mainly because of ${lift.label.replace(/^Most relevant: /, "").replace(/ \((same|a neighbouring|another) line of work\)$/, "")}` : ""}.` });
    }
  }
  byPool.set(postings, out);
  return out;
}

// src/lib/skill-tiers.ts
function withSkillTiers(post) {
  const t = post.skill_tiers;
  if (!t || typeof t !== "object")
    return post;
  const tiers = {};
  for (const [name, tier] of Object.entries(t))
    if (tier)
      tiers[name] = tier;
  return { ...post, skills: Object.keys(t), tiers };
}

// src/lib/tailor.ts
var GENERIC = new Set(["intern", "internship", "stage", "stagiair", "junior", "senior", "medior", "trainee", "graduate", "working", "student", "werkstudent", "the", "and", "of", "for", "in", "a", "to", "m", "f", "d", "x", "all", "gender", "genders", "2026", "2027", "month", "months", "start", "programme", "program", "netherlands", "amsterdam", "nl"].map(stem));
var titleWords = (t) => new Set(words(t.replace(/\([^)]*\)/g, " ")).map(stem).filter((w) => w.length > 2 && !GENERIC.has(w)));
var city = (p) => (p.region ?? "").split(/[,;]/)[0].trim().toLowerCase();
function likeness(saved, job, profiles) {
  const a = titleWords(saved.title);
  const b = titleWords(job.title);
  const shared = [...a].filter((w) => b.has(w));
  const overlap = a.size && b.size ? shared.length / Math.min(a.size, b.size) : 0;
  const why = [];
  let score = 0.45 * overlap;
  if (saved.family && saved.family === job.family) {
    score += 0.2;
    why.push(saved.family.split(" & ")[0].split(",")[0].toLowerCase());
  }
  if (saved.level_view && saved.level_view === job.level_view && saved.level_view !== "Not stated") {
    score += 0.12;
    why.push(saved.level_view === "Internship" ? "internship" : `${saved.level_view.toLowerCase()} level`);
  }
  if (city(saved) && city(saved) === city(job)) {
    score += 0.08;
    why.push((job.region ?? "").split(/[,;]/)[0].trim());
  }
  const ps = profiles[saved.employer];
  const pj = profiles[job.employer];
  if (saved.employer === job.employer) {
    score += 0.15;
    why.unshift("same company");
  } else if (ps?.type && pj?.type && ps.type.split(" (")[0] === pj.type.split(" (")[0]) {
    score += 0.08;
    why.push(pj.type.split(" (")[0]);
  }
  if (overlap > 0 && !why.includes("same company"))
    why.unshift(shared.slice(0, 2).join(" "));
  return { score, why: [...new Set(why)], anchored: overlap > 0 || saved.employer === job.employer };
}
var isLike = (l) => l.anchored && l.score >= 0.38;
function shortTitle(t) {
  const clean = t.replace(/\([^)]*\)/g, " ").split(/[:|–—]| - /)[0].replace(/\b20\d\d\b/g, " ").replace(/\b\d+[- ]?months?\b/gi, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  const kind = words.find((w) => /^(internship|intern|traineeship|trainee|analyst|programme)$/i.test(w));
  return clean.length <= 40 ? clean : kind ? kind.toLowerCase() : `${clean.slice(0, 38).trim()}…`;
}
var shortName = (n) => n.replace(/\([^)]*\)/g, " ").replace(/\b(N\.?V\.?|B\.?V\.?|Inc\.?|Ltd\.?|GmbH|S\.?A\.?)\s*$/i, "").replace(/\s+/g, " ").trim();
function freshness(post) {
  const d = post.days_open;
  if (d === null || d === undefined)
    return 4;
  return d <= 3 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : d <= 30 ? 3 : 4;
}
function pastDeadline(post, today) {
  if (!post.valid_through)
    return false;
  const end = new Date(post.valid_through);
  if (Number.isNaN(end.getTime()))
    return false;
  end.setHours(23, 59, 59, 999);
  return end.getTime() < today.getTime();
}
function ownMatch(post, own) {
  const b = titleWords(post.title);
  let best = { share: 0, words: [], title: -1 };
  own.forEach((a, i) => {
    const shared = [...a].filter((w) => b.has(w));
    const share = a.size && b.size ? shared.length / Math.min(a.size, b.size) : 0;
    if (share > best.share)
      best = { share, words: shared, title: i };
  });
  return best;
}
function tailor({ candidates, fitting, saved, chanceOf, profiles, liftOf, own = [], fieldOrder = [], today = new Date }) {
  const ownSets = own.map(titleWords);
  const scored = [];
  for (const post of candidates) {
    if (pastDeadline(post, today))
      continue;
    let best = null;
    for (const s of saved) {
      const l = likeness(s, post, profiles);
      if (isLike(l) && (!best || l.score > best.l.score))
        best = { s, l };
    }
    const mine = ownMatch(post, ownSets);
    const interest = best || mine.share >= 0.5 ? 3 : mine.share > 0 ? 2 : fitting.has(post.id) ? 1 : 0;
    if (interest === 0)
      continue;
    const lift = liftOf(post);
    const note = best ? `Like the ${shortTitle(best.s.title)} at ${shortName(best.s.employer_display)} you saved: ${best.l.why.slice(0, 3).join(", ")}` : mine.share > 0 ? `Close to your own work as ${shortTitle(own[mine.title])}: ${mine.words.slice(0, 2).join(", ")}` : lift ? `Fits your background: ${lift}` : "Fits your preferences";
    const at = fieldOrder.length > 0 ? fieldOrder.indexOf(fieldOf(post) ?? "") : -1;
    scored.push({ post, chance: chanceOf(post), note, interest, fresh: freshness(post), rank: at < 0 ? fieldOrder.length : at });
  }
  return scored.sort((x, y) => x.rank - y.rank || y.interest - x.interest || x.fresh - y.fresh || y.chance - x.chance || (x.post.days_open ?? 1e9) - (y.post.days_open ?? 1e9)).map(({ post, chance, note }) => ({ post, chance, note }));
}

// supabase/functions/mcp/core.src.ts
var APP = "https://odds.beeblast.co";
function preparePool(rows) {
  const pool = rows.filter((p) => (p.usable == null || p.usable >= 0.5) && !p.closed_at).map((p) => withSkillTiers(p));
  for (const p of pool) {
    if (!p.dutch_required && (p.dutch_jev ?? 0) >= 0.8)
      p.dutch_required = true;
    if (p.posted_on) {
      p.days_open = daysSince(p.posted_on);
      p.freshness_state = p.days_open <= 6 ? "fresh" : p.days_open <= 44 ? "active" : "aging";
    }
  }
  const votes = new Map;
  for (const p of pool) {
    if (!p.industry)
      continue;
    const v = votes.get(p.employer) ?? new Map;
    v.set(p.industry, (v.get(p.industry) ?? 0) + 1);
    votes.set(p.employer, v);
  }
  for (const p of pool) {
    const v = votes.get(p.employer);
    p.industry = v ? [...v.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  }
  return pool.filter((p) => !p.dutch_required);
}
function makeReference(bands, ages, tax, transitions) {
  const ageFactors = {};
  for (const row of ages)
    (ageFactors[row.sector] ??= {})[row.age_band] = Number(row.factor);
  return { bands: Object.fromEntries(bands.map((b) => [b.code, b])), ageFactors, tax, transitions: Object.fromEntries(transitions.map((t) => [t.title, t])) };
}
function signalsOf(posts) {
  const out = {};
  for (const post of posts) {
    const found = post.work_signals ?? [];
    if (found.length > 0)
      out[post.id] = { hybrid: found.includes("hybrid"), remote: found.includes("remote"), partTime: found.includes("partTime"), fullTime: found.includes("fullTime"), contract: found.includes("contract") };
  }
  return out;
}
var sharesOf = computeShares;
var DUTCH = { none: "none", basic: "basic", professional: "professional" };
function profileFrom(input) {
  const positions = (input.roles ?? []).map((r) => ({ Title: r.title, "Company Name": r.company ?? "", "Started On": r.start ?? "", "Finished On": r.end ?? "", Description: r.description ?? "" }));
  const education = (input.education ?? []).map((e) => ({ "School Name": e.school ?? "", "Degree Name": e.degree ?? "", "Field Of Study": e.field ?? "", "Start Date": e.start ?? "", "End Date": e.end ?? "" }));
  const skills = (input.skills ?? []).map((name) => ({ Name: name }));
  return { ...DEFAULT_PROFILE, positions, education, skills, headline: input.headline ?? "", dutch: input.dutch && DUTCH[input.dutch] || DEFAULT_PROFILE.dutch, studying: input.studying ?? null };
}
function profileFromSaved(data) {
  return { ...DEFAULT_PROFILE, ...data ?? {} };
}
var hasProfile = hasCvData;
function jobLine(post, ref) {
  const pay = payOf(post, ref);
  return {
    id: post.id,
    title: post.title,
    company: post.employer_display || post.employer,
    city: (post.region ?? "").split(/[,;]/)[0].trim() || null,
    level: post.level_view ?? null,
    field: fieldOf(post),
    posted_days_ago: post.days_open ?? null,
    closes: post.valid_through ? post.valid_through.slice(0, 10) : null,
    pay: pay.text ? `${pay.text} ${pay.perHour ? "an hour" : "a month"}, before tax` : null,
    pay_basis: pay.text ? pay.source : null,
    visa_sponsor: Boolean(post.ind_sponsor),
    applicants: post.applicants ?? null,
    workplace: post.workplace ?? null,
    url: post.url,
    odds_link: `${APP}/job/${post.id}`
  };
}
var known = (xs, allowed) => (xs ?? []).map((x) => allowed.find((a) => a.toLowerCase() === x.toLowerCase())).filter((x) => Boolean(x));
function filtersFrom(input) {
  const levels = known(input.levels, LEVELS);
  return {
    ...DEFAULT_FILTERS,
    query: input.query ?? "",
    field: known(input.fields, FIELD_OPTIONS),
    level: levels.length > 0 ? levels : DEFAULT_FILTERS.level,
    city: input.cities ?? [],
    sponsorOnly: input.sponsor_only === true,
    posted: input.posted_within ?? "any",
    minPay: typeof input.min_pay === "number" ? input.min_pay : null,
    workplace: input.workplace ?? []
  };
}
function search(pool, ref, signals, input) {
  const found = [...applyFilters(pool, filtersFrom(input), { signals, reference: ref })].sort((a, b) => (a.days_open ?? 1e9) - (b.days_open ?? 1e9));
  return { total: found.length, jobs: found.slice(0, Math.min(input.limit ?? 20, 50)).map((p) => jobLine(p, ref)) };
}
var plainLabel = (label) => label.replace(/^Most relevant: /, "").replace(/ \((same|a neighbouring|another) line of work\)$/, "");
function chanceFor(post, profile, ref, shares) {
  const st = standing(post, profile, ref, shares);
  if (!st.rate)
    return null;
  const v2 = oddsV2(post, profile, {});
  const pct = (x) => Math.round(x * 1000) / 10;
  return {
    chance_pct: pct(st.rate.mid),
    range_pct: [pct(st.rate.low), pct(st.rate.high)],
    applicants_estimate: Math.round(v2.pile.applicants),
    interviews_estimate: v2.pile.interviews,
    average_applicant_pct: pct(v2.pile.interviews / v2.pile.applicants),
    helps: v2.parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z).slice(0, 4).map((x) => plainLabel(x.label)),
    holds_back: v2.parts.filter((x) => x.z < -0.05).sort((a, b) => a.z - b.z).slice(0, 4).map((x) => plainLabel(x.label)),
    note: "An estimate from published hiring studies and the size of the applicant pile, not a promise. Real outcomes are not yet logged to calibrate it."
  };
}
function tailoredFor(pool, ref, signals, shares, profile, opts) {
  const fieldOrder = known(opts.fields, FIELD_OPTIONS);
  const filters = { ...DEFAULT_FILTERS, field: fieldOrder };
  const fields = profileFields(profile);
  const effective = fitFilters(filters, profile, fields);
  const ctx = { signals, reference: ref };
  const savedIds = new Set((opts.saved ?? []).map((p) => p.id));
  const open = pool.filter((p) => !savedIds.has(p.id) && !(opts.dismissed?.has(p.id) ?? false));
  const fitting = new Set(applyFilters(open, effective, ctx).map((p) => p.id));
  const candidates = [...applyFilters(open, withFitLanguage(filters), ctx)];
  const memo = new Map;
  const chanceOf = (post) => {
    let c = memo.get(post.id);
    if (c === undefined) {
      c = standing(post, profile, ref, shares).rate?.mid ?? 0;
      memo.set(post.id, c);
    }
    return c;
  };
  const liftOf = (post) => {
    const top = oddsV2(post, profile, {}).parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z)[0];
    return top ? plainLabel(top.label) : null;
  };
  const own = [...profile.positions.map((p) => p.Title ?? ""), profile.headline].filter((t) => t.trim() !== "");
  const rows = tailor({ candidates, fitting, saved: opts.saved ?? [], chanceOf, profiles: {}, liftOf, own, fieldOrder });
  const tags = hearBackFor(pool, profile, new Set, () => null);
  return rows.slice(0, Math.min(opts.limit ?? 15, 50)).map((r) => ({ ...jobLine(r.post, ref), chance_pct: Math.round(r.chance * 1000) / 10, why: r.note, most_likely_to_hear_back: tags.has(r.post.id) }));
}
export {
  FIELD_OPTIONS,
  LEVELS,
  chanceFor,
  filtersFrom,
  hasProfile,
  jobLine,
  makeReference,
  preparePool,
  profileFrom,
  profileFromSaved,
  search,
  sharesOf,
  signalsOf,
  tailoredFor
};
