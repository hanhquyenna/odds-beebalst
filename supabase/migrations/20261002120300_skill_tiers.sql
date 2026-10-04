-- How much each posting insists on each skill it names, precomputed from the tiered requirement lines
-- (scripts/make-skill-tiers.ts, using the same code as the job page). The list, the ranking, the dashboard and the job page then
-- use identical tiers, so the same job shows the same interview chance everywhere. Null: the posting has no requirement lines.
alter table public.postings add column if not exists skill_tiers jsonb;
comment on column public.postings.skill_tiers is '{"sql": "must", "tableau": "optional", "excel": null}: the skills the job page compares a CV on, each with the strongest tier any requirement line gives it (null: named without saying how much it insists). {} is a posting whose requirement lines name no skill.';
