-- Employer-level titles describe department contacts, not hiring responsibility for a vacancy.
-- Original data is snapshotted in outputs/people-audit-2026-10-15 before this correction.
alter table public.job_outreach_contacts
 add column relationship_verified boolean not null default false,
 add column evidence_url text,
 add column evidence_quote text,
 add column verified_at timestamptz;

update public.job_people set jev=coalesce(jev,'{}'::jsonb)||jsonb_build_object(
 'role_before_relationship_audit',jev->>'role','role','department_manager',
 'hiring_manager_verified',false,'relationship_basis','title_only',
 'relationship_audited_at',now()) where jev->>'role'='hiring_manager';
update public.job_outreach_contacts set role='department_manager' where role='hiring_manager';

-- Old importers may still send the search-bucket name. It must never become a verified claim.
create function public.guard_person_relationship() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.jev->>'role'='hiring_manager' then
  new.jev:=new.jev||jsonb_build_object('role','department_manager','hiring_manager_verified',false,'relationship_basis','title_only');
 end if;
 return new;
end $$;
create trigger guard_person_relationship before insert or update on public.job_people
for each row execute function public.guard_person_relationship();

create function public.guard_job_relationship() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.role='hiring_manager' and not coalesce(new.relationship_verified and new.evidence_url ~ '^https://' and length(btrim(new.evidence_quote))>=20 and new.verified_at is not null,false) then
  new.role:='department_manager';
  new.relationship_verified:=false;
 end if;
 return new;
end $$;
create trigger guard_job_relationship before insert or update on public.job_outreach_contacts
for each row execute function public.guard_job_relationship();
alter table public.job_outreach_contacts add constraint hiring_relationship_requires_evidence
 check(role<>'hiring_manager' or coalesce(relationship_verified and evidence_url ~ '^https://' and length(btrim(evidence_quote))>=20 and verified_at is not null,false));
revoke all on function public.guard_person_relationship(),public.guard_job_relationship() from public,anon,authenticated;
