-- Edgware Youth CRM — fix-up after 0005 and 0006.
--
-- Symptom: creating a meeting failed with "new row violates row-level
-- security policy for table meetings", even though the caller had
-- meetings.manage and a plain insert with no .select() worked fine.
--
-- Cause: `insert ... returning` makes Postgres evaluate the SELECT
-- policy as well as the insert's WITH CHECK. The SELECT policies on
-- `meetings` and `sops` called can_see_meeting(id) / can_see_sop(id),
-- and those functions answer by running a fresh query AGAINST THE SAME
-- TABLE. A row inserted by the current command is not visible to a
-- separate query issued inside that command, so the lookup found
-- nothing, the policy returned false, and the whole statement was
-- rejected — with an error naming the insert rather than the read.
--
-- Fix: a SELECT policy on a table must test that row's OWN COLUMNS,
-- not go looking the row up again. The helper functions are kept
-- because the child tables (agenda items, actions, decisions, SOP
-- visibility rows) query them about a DIFFERENT table, where there is
-- no such problem.
--
-- The rule worth remembering: never write a policy on table X that
-- calls a function which selects from X.

drop policy if exists "meetings: read" on meetings;
create policy "meetings: read" on meetings
  for select using (
    -- Chair and minute-taker always, so a minute-taker who is not
    -- shura can still write up a shura meeting they were asked to take
    -- notes for.
    chair_id = auth.uid()
    or minute_taker_id = auth.uid()
    or has_permission('meetings.view_shura')
    or (minutes_visibility = 'all_staff' and is_active_member())
    or (
      minutes_visibility = 'attendees'
      and exists (
        select 1 from meeting_attendees a
         where a.meeting_id = meetings.id and a.profile_id = auth.uid()
      )
    )
  );

drop policy if exists "sops: read visible" on sops;
create policy "sops: read visible" on sops
  for select using (
    has_permission('sops.manage')
    or (
      status = 'published'
      and (
        visible_to_all
        or exists (
          select 1 from sop_visible_tiers v, profiles p
           where v.sop_id = sops.id
             and p.id = auth.uid()
             and p.is_active
             and (v.tier_key = p.tier or (p.is_ansar and v.tier_key = 'ansar'))
        )
        or exists (
          select 1 from sop_visible_teams v
           join team_members tm on tm.team_key = v.team_key
          where v.sop_id = sops.id and tm.profile_id = auth.uid()
        )
        or exists (
          select 1 from sop_visible_people v
           where v.sop_id = sops.id and v.profile_id = auth.uid()
        )
      )
    )
  );

notify pgrst, 'reload schema';
