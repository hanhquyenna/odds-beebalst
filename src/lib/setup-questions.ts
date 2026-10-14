/** The questions every form asks again, with the words kept for each tap. Pure data, so the form-filling rules can be tested against it. */
export interface SetupQuestion {
  key: string
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
]
