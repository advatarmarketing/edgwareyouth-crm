-- Edgware Youth CRM — fix-up after 0003.
--
-- Symptom: every query on tasks / checklists / notifications came back
-- "Could not find the table 'public.tasks' in the schema cache", while
-- the service-role client could read them perfectly well.
--
-- Two causes, both handled here, because they look identical from the
-- outside and it is not worth a second round trip to tell them apart:
--
-- 1. PostgREST serves a cached copy of the schema. Tables created in
--    the SQL editor usually trigger a reload, but not reliably. Until
--    it reloads, a table that exists is invisible to the API.
--
-- 2. PostgREST also hides any table the requesting role has no
--    privilege on. Supabase's default privileges normally cover new
--    tables in `public`, but relying on that is how you end up with a
--    table that works for service_role — which bypasses everything —
--    and 404s for every actual user.
--
-- Granting here makes it explicit. This does NOT widen access: RLS is
-- still what decides which rows come back, and every one of these
-- tables has policies. A grant without a policy returns nothing.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  checklists,
  checklist_items,
  tasks,
  task_comments,
  notifications,
  notification_preferences
to authenticated;

-- 0002's tables, for the same reason. They happen to work today, which
-- means they were covered by default privileges — but stating it
-- removes the question.
grant select, insert, update, delete on
  teams,
  team_members,
  permissions,
  tier_permissions,
  profile_permissions,
  member_notes,
  profiles
to authenticated;

grant select on member_directory to authenticated;

grant execute on function public.can_see_task(uuid) to authenticated;

-- Force PostgREST to re-read the schema rather than waiting for it to
-- notice on its own.
notify pgrst, 'reload schema';
