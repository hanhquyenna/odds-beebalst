import { DEFAULT_PROFILE, type Profile } from "@/lib/types"

/**
 * A made-up profile for looking around: a finance graduate from Vietnam on an
 * orientation-year permit. It is stored on this device only, like any profile
 * before an account exists, and everything it produces is worked out from it
 * the same way as from a real one. The owner can change it on the profile page.
 */
export const EXAMPLE_PROFILE: Profile = {
  ...DEFAULT_PROFILE,
  permit: "orientation_year",
  birth: 1999,
  abroad: 20,
  origin: "non_eu",
  dutch: "basic",
  tailor: false,
  cv: "Financial analyst with IFRS reporting and Excel modelling. MSc Finance, Erasmus University Rotterdam.",
  positions: [
    { Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam", "Started On": "Mar 2021", "Finished On": "Aug 2023", Description: "Monthly reporting, Excel modelling, IFRS." },
  ],
  education: [{ "School Name": "Erasmus University Rotterdam", "Degree Name": "MSc Finance", "Start Date": "Sep 2023", "End Date": "Aug 2025" }],
  skills: [{ Name: "Excel" }, { Name: "IFRS" }],
  name: "",
  headline: "Example profile: a finance graduate from Vietnam, open to analyst roles",
  place: "Rotterdam",
  onboarded: true,
}
