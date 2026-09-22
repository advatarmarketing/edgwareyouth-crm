-- Edgware Youth CRM — Prompt 4b. Section 4.6 of docs/SPEC.md.
--
-- The point of the whole module: straight after a meeting, every
-- person given an action has it on their CRM as a checklist with a due
-- date, without anyone retyping it.
--
-- Actions live in meeting_actions while the minutes are being worked
-- on, and only become rows in `tasks` at publish. That separation is
-- deliberate — a half-typed action must not appear on somebody's task
-- list, and the review screen has to be able to delete one without
-- leaving a task behind.

create table if not exists meeting_templates (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  -- Free text rather than an enum: the shura add meeting types without
  -- a migration, and "Matters arising" is matched on this value.
  meeting_type text not null,
  agenda_sections text[] not null default '{}',
  minutes_visibility text not null default 'attendees'
    check (minutes_visibility in ('shura', 'attendees', 'all_staff')),
  default_chair_id        uuid references profiles (id) on delete set null,
  default_minute_taker_id uuid references profiles (id) on delete set null,
  is_active boolean not null default true,
  position  int not null default 0
);

create table if not exists meetings (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references meeting_templates (id) on delete set null,
  title       text not null,
  meeting_type text not null,
  -- A DATE, not a timestamp. This is what the parser resolves "next
  -- Friday" against, and it must be the day the room met rather than
  -- anything timezone-dependent.
  meeting_date date not null,
  starts_at    time,
  chair_id        uuid references profiles (id) on delete set null,
  minute_taker_id uuid references profiles (id) on delete set null,
  minutes_visibility text not null default 'attendees'
    check (minutes_visibility in ('shura', 'attendees', 'all_staff')),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published')),
  -- The audio file, for the record only. Nothing transcribes it.
  recording_path text,
  notes text,
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists meetings_type_date_idx on meetings (meeting_type, meeting_date desc);

create table if not exists meeting_attendees (
  meeting_id uuid not null references meetings (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  attendance text not null default 'expected'
    check (attendance in ('expected', 'present', 'apologies', 'absent')),
  primary key (meeting_id, profile_id)
);

create table if not exists meeting_agenda_items (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  title      text not null,
  notes      text,
  position   int  not null default 0,
  -- Where the item came from, so "Matters arising" and somebody's
  -- suggestion are distinguishable in the UI.
  origin text not null default 'manual'
    check (origin in ('template', 'matters_arising', 'suggested', 'manual')),
  suggested_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

/**
 * An action as it stands in the minutes, before publishing.
 *
 * `steps` is a plain text[] rather than a checklist row, because until
 * publish there is nothing to tick and a checklist with no task to
 * hang off would be an orphan if the action were deleted. The
 * checklist engine turns these into real checklist_items at publish.
 *
 * `task_id` is filled in at that point, which is also what stops a
 * second publish creating duplicates.
 */
create table if not exists meeting_actions (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  agenda_item_id uuid references meeting_agenda_items (id) on delete set null,
  owner_id   uuid references profiles (id) on delete set null,
  text       text not null,
  due_date   date,
  steps      text[] not null default '{}',
  task_id    uuid references tasks (id) on delete set null,
  -- The line this came from, kept so the review screen can show what
  -- was actually written when something looks wrong.
  source_line text,
  created_at timestamptz not null default now()
);

create table if not exists meeting_decisions (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  agenda_item_id uuid references meeting_agenda_items (id) on delete set null,
  text       text not null,
  created_at timestamptz not null default now()
);

/**
 * Lines the parser would not resolve.
 *
 * These exist as rows rather than being held in the page's state
 * because the review screen is not necessarily finished in one sitting
 * — somebody pastes the notes, gets called away, and comes back. A
 * line that is only in a React state object is lost at that point,
 * which is the opposite of "nothing is silently dropped".
 */
create table if not exists meeting_unresolved (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  line       text not null,
  reason     text not null,
  candidates jsonb,
  steps      text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Who may see a meeting
-- ---------------------------------------------------------------

create or replace function public.can_see_meeting(p_meeting_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from meetings m
     where m.id = p_meeting_id
       and (
         -- Chair and minute-taker always, so a minute-taker who is not
         -- shura can still write up a shura meeting they were asked to
         -- take notes for.
         m.chair_id = auth.uid()
         or m.minute_taker_id = auth.uid()
         or has_permission('meetings.view_shura')
         or (m.minutes_visibility = 'all_staff' and is_active_member())
         or (
           m.minutes_visibility = 'attendees'
           and exists (
             select 1 from meeting_attendees a
              where a.meeting_id = m.id and a.profile_id = auth.uid()
           )
         )
       )
  )
$$;

/** Running a meeting: creating it, editing minutes, publishing. */
create or replace function public.can_run_meeting(p_meeting_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from meetings m
     where m.id = p_meeting_id
       and (
         m.chair_id = auth.uid()
         or m.minute_taker_id = auth.uid()
         or has_permission('meetings.view_shura')
       )
  )
$$;

-- ---------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------

alter table meeting_templates    enable row level security;
alter table meetings             enable row level security;
alter table meeting_attendees    enable row level security;
alter table meeting_agenda_items enable row level security;
alter table meeting_actions      enable row level security;
alter table meeting_decisions    enable row level security;
alter table meeting_unresolved   enable row level security;

drop policy if exists "meeting_templates: read" on meeting_templates;
create policy "meeting_templates: read" on meeting_templates
  for select using (is_active_member());
drop policy if exists "meeting_templates: manage" on meeting_templates;
create policy "meeting_templates: manage" on meeting_templates
  for all using (has_permission('meetings.view_shura'))
  with check (has_permission('meetings.view_shura'));

drop policy if exists "meetings: read" on meetings;
create policy "meetings: read" on meetings
  for select using (can_see_meeting(id));

drop policy if exists "meetings: create" on meetings;
create policy "meetings: create" on meetings
  for insert with check (has_permission('meetings.manage'));

drop policy if exists "meetings: update" on meetings;
create policy "meetings: update" on meetings
  for update using (can_run_meeting(id));

drop policy if exists "meetings: delete" on meetings;
create policy "meetings: delete" on meetings
  for delete using (can_run_meeting(id));

-- Attendees are visible to anyone who can see the meeting; only the
-- people running it can change the list or mark attendance.
drop policy if exists "meeting_attendees: read" on meeting_attendees;
create policy "meeting_attendees: read" on meeting_attendees
  for select using (can_see_meeting(meeting_id));
drop policy if exists "meeting_attendees: manage" on meeting_attendees;
create policy "meeting_attendees: manage" on meeting_attendees
  for all using (can_run_meeting(meeting_id)) with check (can_run_meeting(meeting_id));

-- "Add to agenda": any active member may suggest an item for a meeting
-- they can see. Everything else on the agenda needs to be running it.
drop policy if exists "meeting_agenda_items: read" on meeting_agenda_items;
create policy "meeting_agenda_items: read" on meeting_agenda_items
  for select using (can_see_meeting(meeting_id));
drop policy if exists "meeting_agenda_items: suggest" on meeting_agenda_items;
create policy "meeting_agenda_items: suggest" on meeting_agenda_items
  for insert with check (
    can_run_meeting(meeting_id)
    or (can_see_meeting(meeting_id) and origin = 'suggested' and suggested_by = auth.uid())
  );
drop policy if exists "meeting_agenda_items: manage" on meeting_agenda_items;
create policy "meeting_agenda_items: manage" on meeting_agenda_items
  for all using (can_run_meeting(meeting_id)) with check (can_run_meeting(meeting_id));

drop policy if exists "meeting_actions: read" on meeting_actions;
create policy "meeting_actions: read" on meeting_actions
  for select using (can_see_meeting(meeting_id));
drop policy if exists "meeting_actions: manage" on meeting_actions;
create policy "meeting_actions: manage" on meeting_actions
  for all using (can_run_meeting(meeting_id)) with check (can_run_meeting(meeting_id));

drop policy if exists "meeting_decisions: read" on meeting_decisions;
create policy "meeting_decisions: read" on meeting_decisions
  for select using (can_see_meeting(meeting_id));
drop policy if exists "meeting_decisions: manage" on meeting_decisions;
create policy "meeting_decisions: manage" on meeting_decisions
  for all using (can_run_meeting(meeting_id)) with check (can_run_meeting(meeting_id));

-- Unresolved lines are working material for whoever is writing up the
-- minutes. Nobody else needs them and they may contain half-written
-- notes about people.
drop policy if exists "meeting_unresolved: run only" on meeting_unresolved;
create policy "meeting_unresolved: run only" on meeting_unresolved
  for all using (can_run_meeting(meeting_id)) with check (can_run_meeting(meeting_id));

grant select, insert, update, delete on
  meeting_templates, meetings, meeting_attendees, meeting_agenda_items,
  meeting_actions, meeting_decisions, meeting_unresolved
to authenticated;

grant execute on function public.can_see_meeting(uuid) to authenticated;
grant execute on function public.can_run_meeting(uuid) to authenticated;

-- Seed the meeting types from spec 4.6.
insert into meeting_templates (name, meeting_type, agenda_sections, minutes_visibility, position) values
  ('Shura weekly',        'shura',        array['Matters arising','Events for approval','Expense claims','Finance & KPIs','Any other business'], 'shura',     1),
  ('Sabiqun meeting',     'sabiqun',      array['Matters arising','Events in planning','Team updates','Any other business'],                     'attendees', 2),
  ('Team meeting',        'team',         array['Matters arising','This month''s work','Blockers','Any other business'],                         'attendees', 3),
  ('Event planning',      'event_plan',   array['Matters arising','Programme','Logistics','Volunteers','Risks','Budget'],                        'attendees', 4),
  ('Event debrief',       'event_debrief',array['What went well','What was hard','Ihsan & the senses','Numbers','Lessons for the template'],     'attendees', 5),
  ('Year planning',       'year_plan',    array['Last year reviewed','Purpose, vision, mission','Priorities','Objectives & key results','Calendar','Budget'], 'shura', 6),
  ('General staff meeting','general',     array['Announcements','Matters arising','Any other business'],                                          'all_staff',7)
on conflict do nothing;

notify pgrst, 'reload schema';
