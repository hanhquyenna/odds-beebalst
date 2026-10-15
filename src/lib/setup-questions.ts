/** The questions every form asks again, with the words kept for each tap. Pure data, so the form-filling rules can be tested against it. */
export interface SetupQuestion {
  key: string
  /** Asked, but setup is complete without it. */
  optional?: boolean
  maxSelections?: number
  title: string
  /** Short name for the chip shown while it is missing. */
  chip: string
  /** The choices to tap, each with what is kept for it. Without them the answer is typed. */
  choices?: ReadonlyArray<{ label: string; value: string }>
  placeholder?: string
}

/**
 * What every form asks again. The kept words are the ones the form-filling rules read (supabase/functions/_shared/apply-form.ts): a
 * permit answer says plainly whether it is needed, so "need a visa?" and "allowed to work?" are never confused.
 */
export const SETUP_QUESTIONS: ReadonlyArray<SetupQuestion> = [
  { key: "role_values", title: "What do you value in a new role?", chip: "Role values", optional: true, maxSelections: 3,
    choices: ["Mentorship & skill development", "Work-life balance", "Innovative product & tech", "Diversity & inclusion", "Impactful work", "Fast-growing company", "Independence & autonomy", "Transparency & communication", "Progressive leadership", "Social responsibility & sustainability"].map((value) => ({ label: value, value })) },
  { key: "first_name", title: "What is your first name?", chip: "First name", placeholder: "Given names, as they should appear on applications" },
  { key: "last_name", title: "What is your last name?", chip: "Last name", placeholder: "Family name" },
  { key: "email", title: "Which email should employers use?", chip: "Email", placeholder: "you@example.com" },
  { key: "phone", title: "What is your phone number?", chip: "Phone", placeholder: "+31 6 12345678" },
  {
    key: "work_authorization",
    title: "Do you need a visa or permit to work in the Netherlands?",
    chip: "Visa",
    choices: [
      { label: "No, I can work freely", value: "Yes, I am free to work in the Netherlands" },
      { label: "Yes, the employer sponsors it", value: "I need a work permit; the employer sponsors it" },
      { label: "I already have a permit", value: "Yes, I have a residence permit that allows me to work" },
    ],
  },
  { key: "start_date", title: "When can you start?", chip: "Start date", placeholder: "1 February 2027" },
  { key: "hours_per_week", title: "How many hours a week?", chip: "Hours", placeholder: "40" },
  { key: "university", title: "Which university or school?", chip: "University", placeholder: "University of Amsterdam" },
  { key: "degree", title: "Which degree are you doing?", chip: "Degree", placeholder: "Master's degree (MSc)" },
  { key: "field_of_study", title: "What do you study?", chip: "Field of study", placeholder: "Data science" },
  { key: "graduation_date", title: "When do you graduate?", chip: "Graduation", placeholder: "July 2027" },
  {
    key: "study_year",
    title: "Which year of your studies are you in?",
    chip: "Year of study",
    choices: [
      { label: "1st year", value: "1st year" },
      { label: "2nd year", value: "2nd year" },
      { label: "3rd year", value: "3rd year" },
      { label: "4th year or later", value: "4th year" },
    ],
  },
  {
    key: "study_status",
    title: "Are you a student now?",
    chip: "Student",
    choices: [
      { label: "Yes, full time", value: "Yes, enrolled full time" },
      { label: "Yes, part time", value: "Yes, enrolled part time" },
      { label: "No", value: "No" },
    ],
  },
  {
    key: "internship_agreement",
    title: "Does your university sign an internship agreement?",
    chip: "Internship agreement",
    choices: [
      { label: "Yes, it signs one", value: "Yes, my university signs one" },
      { label: "No, not needed", value: "No" },
      { label: "I need to ask them", value: "I still need to ask my university" },
    ],
  },
  { key: "nationality", title: "What is your nationality?", chip: "Nationality", placeholder: "Vietnamese" },
  {
    key: "onsite_ok",
    optional: true,
    title: "Are you fine working from the office a few days a week?",
    chip: "Office days",
    choices: [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No" },
    ],
  },
  {
    key: "demographics",
    optional: true,
    title: "Forms ask about gender, age and background. What should odds do?",
    chip: "Background questions",
    choices: [
      { label: "Choose “Prefer not to say”", value: "Prefer not to say" },
      { label: "I answer them myself", value: "I answer them myself" },
    ],
  },
  {
    key: "prior_agreements",
    optional: true,
    title: "Have you signed a non-compete or a confidentiality agreement with a past employer?",
    chip: "Past agreements",
    choices: [
      { label: "No", value: "No" },
      { label: "Yes", value: "Yes" },
    ],
  },
  {
    key: "insider",
    optional: true,
    title: "Do you or a close family member work at companies you apply to?",
    chip: "Family at employer",
    choices: [
      { label: "No", value: "No" },
      { label: "Sometimes", value: "It depends" },
    ],
  },
  { key: "address", title: "What is your street and house number?", chip: "Street", placeholder: "Damrak 1" },
  { key: "postcode", title: "What is your postcode?", chip: "Postcode", placeholder: "1012 LG" },
  { key: "city", title: "Which city do you live in?", chip: "City", placeholder: "Amsterdam" },
  { key: "expected_salary", optional: true, title: "What pay do you expect?", chip: "Pay", placeholder: "EUR 600 a month" },
  {
    key: "relocation",
    optional: true,
    title: "Would you move for a job?",
    chip: "Moving",
    choices: [
      { label: "Yes, anywhere in the Netherlands", value: "Yes, anywhere in the Netherlands" },
      { label: "Only near where I live", value: "Only near where I live" },
      { label: "No", value: "No" },
    ],
  },
]

/** Only a short review and the few details that cannot be read from LinkedIn. */
export const QUICK_SETUP_KEYS = new Set(["first_name", "last_name", "email", "phone", "work_authorization", "start_date", "hours_per_week", "internship_agreement"])
