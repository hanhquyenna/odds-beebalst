# Making the odds credible: the plan

This is the work behind the table "How we will prove it" in `src/components/OddsExplain.tsx`. Each row there is one goal here. When a goal moves, change its status on the page too, and keep the status honest: the page only says "done" when the work is done and published.

## Where the model is now (4 Oct 2026)

- Base rate per job family from employer hiring data (Ashby 2026, 109M applications; SmartRecruiters 2025, 89M), carried as a low and a high bound.
- Effects from controlled studies applied as multipliers (Thijssen et al. 2021, Baert et al. 2021, Ashby 2026, ResumeGo 2020, a Mathematica audit study).
- A fit score with weights we set ourselves (skills 35, line of work 25, consistency 15, role 15, level 10).
- Applications combined as independent, so the total is an upper bound.
- Never checked against real outcomes.

## The goals, in the order that matters

### 1. Check the chances against real outcomes (calibration). Status: started
What would convince a sceptic most: "when we said 5%, about 5% heard back".
- Have: the tracker records applied, interview, offer, rejected, no reply. But the database has 0 accounts, so nothing is collected yet. Sign-in has to work first (see the database check of 4 Oct: site URL and email confirmation).
- Need: for each logged application, store the chance we showed at the time it was applied (a snapshot, since the model will change), and the outcome after a fixed window (for example 6 weeks with no reply counts as no).
- Publish: a calibration chart (predicted vs observed, in bands), the Brier score, and how many applications it is based on.
- Suggested bar before saying "validated": a few hundred applications with outcomes per job family. That number is a target to decide on, not a fact.

### 2. Estimate the weights from data (logistic regression). Status: planned
- Once goal 1 has data: fit interview (yes/no) on the fit parts, the factors and the base rate, instead of the hand-set weights.
- Check with cross-validation (train on part, test on the rest), and compare with the current model on the same data. Only switch if it predicts better.

### 3. Pool the studies (meta-analysis). Status: planned
- For each factor (origin, internship, referral, tailoring), collect every study's effect and sample size, and combine them with a random-effects meta-analysis.
- Result: one effect per factor with a 95% confidence interval, and a measure of how much the studies disagree. This replaces "x0.76 to x0.93" with a pooled number and interval.

### 4. A confidence interval on every chance. Status: planned
- Carry the uncertainty from goals 2 and 3 through to each job (for example by simulation), and show the interval next to the number.
- Wider where there are few similar jobs or a thin profile.

### 5. Dutch data, today. Status: planned
- Most effects come from other countries or years. Collect Dutch applications with outcomes: odds users first, then university career services and student associations as partners.
- Record the job family, level, and the student's background with consent, so the Dutch effects can be estimated on their own.

### 6. Fairness check. Status: planned
- Once there are outcomes: is the model equally well calibrated across backgrounds, fields and levels? Publish the result, including where it is worse.

### 7. Open method and outside review. Status: planned
- A public method page with a version number and a changelog (what changed, when, why).
- Ask one or two labour-market researchers (for example the authors of the Dutch field experiments) to review it, and publish what they said.

## Rules for the page
- Never write that something is validated, fitted or reviewed before it is, and the result is published.
- Every number on the page must trace to the research pages or to our own published data.
