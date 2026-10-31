-- Checks the drive push policy (supabase/migrations/20261031120000_drive_push.sql) the way Realtime decides a private channel join
-- (realtime.authorize): a probe row on the topic, read back as the joining user, and a send tried as that user. Fails loudly on any
-- breach, including a broader policy on realtime.messages from elsewhere. Everything is rolled back. Local or branch database only:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/check-drive-push-rls.sql
begin;

-- Whether `who` (as `role`) may receive, or send, broadcasts on `topic`. The probe runs in a block that is always rolled back, role
-- and settings included; only the answer survives (as in realtime.authorize).
create function pg_temp.may(role text, who uuid, topic text, send boolean) returns boolean language plpgsql as $$
declare
  probe uuid := gen_random_uuid();
  allowed boolean := false;
begin
  begin
    insert into realtime.messages (id, topic, extension, inserted_at, updated_at) values (probe, topic, 'broadcast', now(), now());
    perform set_config('role', role, true),
            set_config('realtime.topic', topic, true),
            set_config('request.jwt.claims', json_build_object('sub', who, 'role', role)::text, true),
            set_config('request.jwt.claim.sub', coalesce(who::text, ''), true),
            set_config('request.jwt.claim.role', role, true);
    if send then
      begin
        insert into realtime.messages (topic, extension, inserted_at, updated_at) values (topic, 'broadcast', now(), now());
        allowed := true;
      exception when insufficient_privilege then
        allowed := false;
      end;
    else
      allowed := exists (select 1 from realtime.messages m where m.id = probe);
    end if;
    raise sqlstate 'P0D01';
  exception when sqlstate 'P0D01' then
    null;
  end;
  return allowed;
end $$;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
begin
  if not pg_temp.may('authenticated', a, 'drive:' || a, false) then raise exception 'drive push: a person cannot listen on their own topic'; end if;
  if pg_temp.may('authenticated', b, 'drive:' || a, false) then raise exception 'drive push: a person can listen on someone else''s topic'; end if;
  if pg_temp.may('authenticated', a, 'drive:' || upper(a::text), false) then raise exception 'drive push: a look-alike topic is readable'; end if;
  if pg_temp.may('anon', null, 'drive:' || a, false) then raise exception 'drive push: an anonymous client can listen'; end if;
  if pg_temp.may('authenticated', a, 'drive:' || a, true) then raise exception 'drive push: a person can send on their own topic'; end if;
  if pg_temp.may('authenticated', b, 'drive:' || a, true) then raise exception 'drive push: a person can send on someone else''s topic'; end if;
  raise notice 'drive push policy: ok (own topic only, nobody sends)';
end $$;

rollback;
