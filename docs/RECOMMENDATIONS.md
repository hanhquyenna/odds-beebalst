# How odds recommends jobs

Three lists, one engine (`src/lib/tailor.ts`, `src/lib/profile-fit.ts`, `src/lib/fit-engine.ts`). The same code runs in the app and in the Claude connector
(`supabase/functions/mcp/core.src.ts`, rebuilt with `sh scripts/build-mcp-core.sh`).

| List | Where | Built from |
| --- | --- | --- |
| **Like the jobs you saved** | Home, under your own list; Claude: `similar_to_saved` | what you saved and applied to |
| **Jobs tailored to you** | Jobs page; Claude: `tailored_jobs` | your LinkedIn profile, your ranked job fields, your saved jobs |
| **Most likely to hear back** (a tag, not a list) | on any job row | your interview chance against the pile (`hear-back.ts`) |

## Like the jobs you saved (`similarMix`)
The mix follows the saved list: 3 finance, 3 marketing, 3 operations, 1 consulting out of 10 saved means about 3, 3, 3 and 1 of ten suggestions
(largest remainder, so five slots over four lines of equal weight are 2, 1, 1, 1: the extra slot goes to the first of the equals). What counts in "how much of the list":
- **each saved job's weight**: only saved 1; applied 1.5; interview 2.2; offer 2.5; rejected or no reply 0.7; withdrawn 0.4 (`STAGE_WEIGHT`);
- **ranked fields**: the line of work you put first counts 1.4, second 1.2, third 1.1;
- **dismissed jobs**: nothing is suggested that is much like a job you pressed X on, unless it is even more like something you saved.

Within a line, the job most like a saved one wins (title words most, then line of work, level, city, company type), lifted a little by your chance. One employer
once until nothing else is left. Never: closed to you (see below), past its closing date, or **older than two weeks** (below). Shown newest first.

**What a "cluster" is today: the line of work.** What else could be one, in the order that probably matters most for students: level (internship vs graduate
programme: today a score, could be a second split inside a line), the role theme in the title (audit vs treasury inside finance), the industry of the employer,
company type and size (bank, scale-up, big corporate), city, working mode (remote, hybrid), whether the employer is a recognised sponsor, pay band, start season.
Not built: a second-level split inside a line, because with five slots it would be noise; it needs a longer list.

## Two weeks, for both lists
Only postings from the last two weeks (`LIST_MAX_AGE_DAYS = 14`, `freshForLists`), or with a closing date still ahead: the employer says they are open, so they are not outdated
however long they have been up. A posting with no date and no closing date cannot be shown to be fresh and stays out (it is still in "All jobs"). Of 2,421 open jobs on
2026-10-11: 531 posted within two weeks, 787 older with a closing date ahead, 480 undated, 623 older with no closing date. Checking one LinkedIn job with the Apify actor (`job_status` is
`open` or `closed`) showed a 44-day-old posting still open, so age is a guess, not a fact; a daily check of the LinkedIn jobs on the lists would make it a fact (about $0.001-0.003 each).

## Jobs tailored to you
Ranked by: your ranked fields, then what you are into (like a saved job, or named like your own work, then your lines of work), then **how well your profile fits**,
then the newest, then your chance. Each row says why.

**Closed to you (left out):** asks for a current student and you graduated; asks for a language you do not list; asks for Dutch; an internship when you left university
over two years ago. Years or degree asked beyond your profile only count against a job.

**Fit** = content x (0.5 + 0.5 x logistics), so where a job is can never stand in for what it is:
- content: CV against the posting (skills, role words, line of work: `fit.ts`) 0.6; the same industry as an employer you worked at 0.2; the job named in your headline 0.2;
- logistics: level for where you are in your studies 0.4; the city you live in 0.3; a recognised IND sponsor, only for someone who needs a permit, 0.3;
- a posting that says nothing about the work (a title of "Internship", no skills) is held to 0.15.

The weights are our assumption: no study measures them. They are in the code and in `profile-fit.test.ts`.

## Not built yet (more LinkedIn-profile signals, in the order I would do them)
1. **Alumni**: employers where many people from your university work (`employer_facts.top_schools`, 373 employers). Needs those names in the company index the app loads.
2. **People like you**: the validated past hires (`job_candidate_evidence`) closest to your profile, and the jobs they got. 190 validated rows today: too few to rank on, enough for a reason.
3. **Where your seniors went**: the next role after yours, from the career-path data. `transitions` has 5 occupations today: too thin.
4. **Your start date**: a job starting February 2027 for someone finishing in July 2026. Needs a start date on postings.
5. **Learned weights**: once `chance_snapshots` and saved/dismissed behaviour exist for a few hundred people, fit the weights above instead of assuming them.
