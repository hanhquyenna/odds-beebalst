# "How does it work": the target copy

The method as it will read once the work in `docs/credibility-plan.md` is done. Written in present tense, ready to paste into `OddsPanel` in `src/components/OddsExplain.tsx`.
Fill each [bracket] with the real figure when you have it, and paste a part only once it is true. The goal number in each heading matches the plan.

---

## Method

**1. Data**
Each estimate is built on [N] real applications with known outcomes, logged by students applying in the Netherlands since [month year], together with 109 million applications from employer hiring data (Ashby 2026) and 89 million (SmartRecruiters 2025). Every posting is coded into [N] properties: job family, level, required skills and how strongly each is asked, language, location, employer size and more. *(goals 1 and 5)*

**2. Model**
A logistic regression estimates how each property of your profile and the posting changes the chance of an interview. It is fitted on [N] applications and tested on [N] it has never seen (cross-validation). *(goal 2)*

**3. Effects from experiments**
Where real outcomes are too few, the model uses effects from controlled field experiments. The studies on each factor are pooled in a random-effects meta-analysis, which gives one effect with a 95% confidence interval, for example a non-Dutch background: ×[x] (95% CI [x] to [x]), from [N] studies and [N] applications. *(goal 3)*

**4. Your number**
The chance shown is the model's estimate for you and this job, with a 95% confidence interval. The interval is wider when fewer similar applications sit behind it. *(goal 4)*

**5. Combining applications**
P(at least one interview) = 1 − (1 − p₁) × (1 − p₂) × … × (1 − pₙ), corrected for the overlap between similar applications. *(goal 2: needs real data to estimate that overlap)*

## Accuracy

When odds says 5%, [x]% of those applications led to an interview. Across [N] applications the Brier score is [x], against [x] for a model that gives everyone the average. *(goal 1)*

Accuracy is checked separately for each background, field and level. The largest gap between groups is [x] points. *(goal 6)*

## Review

The method is public, versioned (now version [x]) and every change is logged. It was reviewed by [name, institution] in [month year]. *(goal 7)*

## Evidence

[N] research reports citing [N] sources: real application outcomes, employer hiring data, field experiments with matched CVs sent to real Dutch and European vacancies, and controlled studies on internships, referrals and CV tailoring.
