-- Push for Broods' browser steps (ODDS_DRIVE_PUSH=1 on the mcp function): each queued step wakes the person's extension over Realtime
-- Broadcast on the private topic drive:<user id>, and the extension then takes the step through /ext/drive-next with its own key.
-- Realtime Authorization joins a private channel only when a SELECT policy on realtime.messages lets the joining user see the topic:
-- each signed-in person listens on their own topic and on no one else's. No INSERT policy, so no client can send on it (the function
-- sends with the service role). A wake carries only the run id. Checked by scripts/check-drive-push-rls.sql.
create policy drive_push_own_topic on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'drive:' || (select auth.uid())::text);
