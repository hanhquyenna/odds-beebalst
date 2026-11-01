# Interview chance: a method we can defend

Status: what the app does today (sections 1 to 3) is built and sourced. Sections 4 to 6 are the plan to make it measured and defensible. Nothing in 4 to 6 is built yet, and the app must not claim it until it is.

## 0. What the number means

The probability that one application like yours gets at least one interview (a positive response from the employer). It is a probability for a group of similar applicants, shown as a range. It is not a prediction about one person and not the chance of a job offer.

## 1. Today: a prior from market data (built)

Base interview rate for the kind of role (business, technical, other), from applicant-tracking data: Ashby 2026 (109 million applications; hires per application in EMEA) and SmartRecruiters 2025 (interviews per offer, offer acceptance). Low end derived from hires per application; high end from the reported interview rate. Source and arithmetic for each figure sit next to it in `FACTORS` in `src/lib/engine.ts`.

Limit: these are all applicants, mostly not international students, not only the Netherlands.

## 2. Today: adjustments from controlled experiments (built)

Each adjustment is a multiplier taken from a study that changed one thing and measured the response, and is shown with its source on the job page.

| Factor | Size | Source | Strength of evidence |
| --- | --- | --- | --- |
| Foreign background | x0.76 all levels (low end), x0.93 graduate level (high end) | Thijssen et al. 2019, 2021; SCP 2010 (Dutch field experiments) | Strong, Dutch, but not international students |
| Work mostly outside the EU | x0.88, low end only | Mathematica audit study | Weak, not Dutch |
| Internship on the CV | x1.126 | Baert et al. 2021 (Belgium) | Medium |
| Referral | x1.49 | Ashby 2026 (global) | Medium, observational |
| Tailored application | x1.31, high end only | ResumeGo 2020 (US vendor) | Weak |

Rule: weak evidence moves only one end of the range, never both.

## 3. Today: fit between the CV and the posting (built, partly assumed)

A 0 to 100% score from skills, line of work, role, level and track record (employers, schools, positions, prizes, grades read from the profile by Jev), with the posting's must-haves counted most. An average applicant sits at 40%. The score places the person inside a range anchored on the Dutch matched-CV experiments (a CV built to fit a vacancy got a positive response 18% to 54% of the time, 4,211 applications, Thijssen et al. 2019). Below average fit lowers the range, by at most about 23% (Bertrand and Mullainathan 2004 found strong CVs got 30% more callbacks than weak ones, which is a 23% drop the other way round).

Assumed, not measured: the weights of the parts (`src/lib/fit.ts`), the track-record scale (`src/lib/strength.ts`), which lines of work are adjacent. They are written down and shown in the app. This is the weakest link and the first thing to validate.

## 4. Next: validate the fit score against what employers actually hire

Goal: replace "our weights" with evidence. Two routes, use both.

1. **Peer benchmark ("who already holds this job").** For a role at an employer, take the profiles of people currently in it (skills, schools, previous employers, years) and measure how a candidate compares: how many of the peer group's common skills they have, how their path compares. Hired people are one possible proxy for what the employer selects; whether it is a good proxy is something to test, not assume. Needs a lawful source of employee profiles and a privacy decision before it is built.
2. **Rated pairs.** Show recruiters or hiring managers (even 30 to 50) a posting and a CV and ask for "would you interview" yes/no. Fit the weights of the parts to those answers with a logistic regression. This directly tests the 0.4/0.4/0.2 style weights and gives a confidence interval for each.

Report the result as: correlation between fit score and rater decisions, and the weights with intervals. If the correlation is weak, say so on the page.

## 5. Next: calibrate with real outcomes, starting from the literature

Log every application and its outcome (the `applications` table already has stages and dates). When there is data, fit a Bayesian logistic regression where:

- the intercept prior is the benchmark of section 1 and the coefficient priors are the multipliers of section 2, each with a spread that reflects the strength of evidence (wide for weak studies);
- features: line of work, level, fit score, referral, tailoring, internship, background, employer size, source of the job;
- partial pooling by occupation and by employer, so small groups borrow from the whole;
- the posterior replaces the prior only as far as the data justifies: with few outcomes the app still shows the literature range, with many it shows a data range.

Pre-register the success criteria before looking: calibration slope between 0.8 and 1.2, Brier score better than the benchmark-only model, checked on a time-ordered holdout. Do not publish a "measured" label until these hold. The minimum useful sample is not known yet (a guess of a few hundred logged applications with outcomes, to be replaced by a power calculation); until then the label stays "estimated from research".

## 6. Next: combine studies properly

Where several studies measure the same effect (foreign background in the Netherlands, Belgium, Sweden, Germany), combine them with a random-effects meta-analysis and show the pooled effect and its interval, instead of picking one study. Record for each: country, year, method (field experiment, audit, survey), sample size, and why it applies or not to international students in the Netherlands.

## 7. Wording rules for the page (language the reader uses)

- Say benchmark, base rate and callback rate, and define each in one line.
- Name the three kinds of evidence: market data, controlled experiments, and (once built) outcomes logged here.
- Always say what is measured and what is our assumption.
- Never say "historical successful candidates", "culture fit" or "regression model" about the live number until sections 4 and 5 are built and pass their criteria.
- Background (origin) is in the model because employers' behaviour in the experiments differs by it; the page says this plainly and the user can see its size. It describes what employers do, not what is fair.

## 8. What a skeptical reader would ask, and the answer

| Question | Answer today | After 4 to 6 |
| --- | --- | --- |
| Where does the starting number come from? | Ashby and SmartRecruiters applicant data, arithmetic shown | Same, plus our own logged outcomes |
| Why does my background change it? | Dutch matched-CV experiments measured it | Pooled across studies, checked against our outcomes |
| How do you judge my CV? | Skills, field, role, level, track record against the posting; weights are our scale | Weights fitted to recruiter ratings and to who is hired |
| Is it validated? | No: not on international students in the Netherlands | Calibration and Brier score on a held-out set, published |
| Is it a promise? | No: a range for people like you | Same, with a narrower interval as data grows |
