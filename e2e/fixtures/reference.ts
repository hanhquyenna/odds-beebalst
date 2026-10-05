import type { Band, TaxParams, Transition } from "../../src/lib/types"

/** cbs_bands rows: CBS hourly pay quartiles per occupation group. */
export const BANDS: Band[] = [
  { code: "0411", label: "Accountants", year: 2024, p25_hourly: 28.4, p50_hourly: 36.4, p75_hourly: 47.1, employees_k: 64, cagr_2013_2024: 0.021, cagr_2019_2024: 0.034 },
  { code: "0412", label: "Financial specialists and economists", year: 2024, p25_hourly: 27.9, p50_hourly: 37.8, p75_hourly: 50.2, employees_k: 118, cagr_2013_2024: 0.024, cagr_2019_2024: 0.037 },
  { code: "0421", label: "HR specialists", year: 2024, p25_hourly: 24.1, p50_hourly: 30.6, p75_hourly: 39.0, employees_k: 71, cagr_2013_2024: 0.019, cagr_2019_2024: 0.031 },
  { code: "0422", label: "Customer service staff", year: 2024, p25_hourly: 16.2, p50_hourly: 19.4, p75_hourly: 23.8, employees_k: 95, cagr_2013_2024: 0.018, cagr_2019_2024: 0.029 },
  { code: "0431", label: "Marketing and PR specialists", year: 2024, p25_hourly: 23.5, p50_hourly: 30.1, p75_hourly: 39.6, employees_k: 82, cagr_2013_2024: 0.02, cagr_2019_2024: 0.033 },
  { code: "0432", label: "Logistics planners", year: 2024, p25_hourly: 21.0, p50_hourly: 26.3, p75_hourly: 32.8, employees_k: 54, cagr_2013_2024: 0.017, cagr_2019_2024: 0.03 },
  { code: "0433", label: "Account managers", year: 2024, p25_hourly: 22.7, p50_hourly: 29.5, p75_hourly: 38.9, employees_k: 103, cagr_2013_2024: 0.016, cagr_2019_2024: 0.028 },
  { code: "0811", label: "Software developers", year: 2024, p25_hourly: 27.2, p50_hourly: 35.0, p75_hourly: 44.6, employees_k: 167, cagr_2013_2024: 0.041, cagr_2019_2024: 0.046 },
]

/** cbs_age_factors rows: pay at an age relative to the sector mean. */
export const AGE_FACTORS: Array<{ sector: string; age_band: string; factor: number }> = ["K", "J", "M"].flatMap((sector) => [
  { sector: sector, age_band: "20 tot 25 jaar", factor: 0.62 },
  { sector: sector, age_band: "25 tot 30 jaar", factor: 0.81 },
  { sector: sector, age_band: "30 tot 35 jaar", factor: 0.96 },
  { sector: sector, age_band: "35 tot 40 jaar", factor: 1.07 },
])

/** tax_params.params for 2026, as stored in the database. */
export const TAX: TaxParams = {
  box1_brackets: [{ upto: 38883, rate: 0.3575 }, { upto: 78426, rate: 0.3756 }, { above: 78426, rate: 0.495 }],
  general_tax_credit: { max: 3115, phase_out_start: 29736, phase_out_rate: 0.06398, zero_at: 78426 },
  labour_tax_credit: { max: 5685, phase_out_start: 45592, phase_out_rate: 0.0651, zero_at: 132920 },
  ruling_30pct: { min_salary: 48013, min_salary_under30_masters: 36497, rate_2026: 0.3 },
  ind_hsm_thresholds_h2_2026_monthly_excl_holiday: { reduced_orientation_year: 3122, under_30: 4357, age_30_plus: 5942 },
  health_insurance_2026: { average_premium_month: 157 },
}

/** transitions rows: where people in a job title moved next. */
export const TRANSITIONS: Transition[] = [
  { title: "Financial Analyst", spells: 1840, with_next: 1210, tenure_q_median: 9, top: [["Senior Financial Analyst", 0.34], ["Controller", 0.21], ["Finance Manager", 0.12]] },
  { title: "Data Analyst", spells: 2210, with_next: 1530, tenure_q_median: 8, top: [["Senior Data Analyst", 0.31], ["Data Scientist", 0.22], ["Analytics Engineer", 0.11]] },
]
