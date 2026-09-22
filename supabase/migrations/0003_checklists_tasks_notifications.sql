-- Edgware Youth CRM — Prompt 2.
-- Sections 4.1 (checklist engine), 4.4 (Tasks), 4.7 (Calendar) and
-- 4.16 (Notifications) of docs/SPEC.md.

-- Two permissions this phase needs that 0002 did not define.
insert into permissions (key, label, category, description) values
  ('tasks.view_all', 'See everyone''s tasks', 'Tasks',
   'The org-wide overdue view. Without it you see only your own and ones you assigned.'),
  ('calendar.view_org', 'See the org calendar', 'Calendar', null)
on conflict (key) do update set
  label = excluded.label, category = excluded.category, description = excluded.description;

insert into tier_permissions (tier_key, permission_key) values
  ('shura',    'tasks.view_all'),
  ('shura',    'calendar.view_org'),
  ('sabiqun',  'calendar.view_org'),
  ('muhsinun', 'calendar.view_org'),
  ('ansar',    'calendar.view_org')
on conflict do nothing;

-- ---------------------------------------------------------------
-- 1. Checklists
--
-- One table pair used by SOPs, meetings, events and tasks alike, which
-- is the whole point of section 4.1 — four modules growing four
-- slightly different splitters is the thing this prevents.
--
-- `source` plus `source_id` is a deliberate soft link rather than four
-- nullable foreign keys. The tables it points at (sops, meetings,
-- events) do not exist yet and arrive over the next three prompts; a
-- real FK per source would mean editing this table three more times.
-- The cost is that nothing stops a dangling source_id, which is why
-- every reader treats a missing source as "no link" rather than an
-- error.
-- ---------------------------------------------------------------

create table if not exists checklists (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  source     text not null default 'manual'
    check (source in ('sop', 'meeting', 'event', 'okr', 'manual')),
  source_id  uuid,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists (id) on delete cascade,
  text         text not null,
  -- 0 is a top-level step, 1+ an indented sub-step. Meeting notes
  -- (4.6) put the lines under an ACTION here.
  depth        int  not null default 0,
  position     int  not null default 0,
  done         boolean not null default false,
  done_by      uuid references profiles (id) on delete set null,
  done_at      timestamptz
);

create index if not exists checklist_items_checklist_idx
  on checklist_items (checklist_id, position);

-- ---------------------------------------------------------------
-- 2. Tasks
-- ---------------------------------------------------------------

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,

  owner_id    uuid references profiles (id) on delete set null,
  created_by  uuid references profiles (id) on delete set null,

  due_date    date,
  priority    text not null default 'normal' check (priority in ('low', 'normal', 'high')),

  status      text not null default 'todo'
    check (status in ('todo', 'doing', 'done', 'blocked')),

  -- Spec 4.4: "Blocked needs a reason". Enforced here rather than in
  -- the form, so a task cannot be parked silently from a script or the
  -- dashboard either.
  blocked_reason text,
  constraint blocked_needs_a_reason
    check (status <> 'blocked' or (blocked_reason is not null and blocked_reason <> '')),

  checklist_id uuid references checklists (id) on delete set null,

  source     text not null default 'manual'
    check (source in ('sop', 'meeting', 'event', 'okr', 'manual')),
  source_id  uuid,

  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_owner_idx on tasks (owner_id, status, due_date);
create index if not exists tasks_due_idx   on tasks (due_date) where status <> 'done';

create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  author_id  uuid references profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  kind       text not null check (kind in (
    'task_new', 'task_due_soon', 'task_overdue', 'task_blocked',
    'meeting_pack', 'mention', 'event_decision', 'expense_decision',
    'announcement', 'sop_to_read'
  )),
  title      text not null,
  body       text,
  href       text,
  read       boolean not null default false,
  -- Set once the nightly job has emailed this one, so a re-run cannot
  -- send it twice.
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on notifications (user_id, read, created_at desc);

-- Per-person, per-kind email opt-out (spec 4.16: "Each person chooses
-- email on/off per type"). A missing row means on — people should not
-- have to opt in to being told their task is overdue.
create table if not exists notification_preferences (
  user_id       uuid not null references profiles (id) on delete cascade,
  kind          text not null,
  email_enabled boolean not null default true,
  primary key (user_id, kind)
);

-- ---------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------

alter table checklists               enable row level security;
alter table checklist_items          enable row level security;
alter table tasks                    enable row level security;
alter table task_comments            enable row level security;
alter table notifications            enable row level security;
alter table notification_preferences enable row level security;

/**
 * Who may see a task.
 *
 * Yours, ones you handed out, or everything if you hold
 * tasks.view_all. Kept in a function because checklists, checklist
 * items and comments all have to answer the same question, and three
 * copies of one subquery is how they drift apart.
 */
create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tasks t
     where t.id = p_task_id
       and (t.owner_id = auth.uid()
            or t.created_by = auth.uid()
            or has_permission('tasks.view_all'))
  )
$$;

drop policy if exists "tasks: read" on tasks;
create policy "tasks: read" on tasks
  for select using (
    owner_id = auth.uid() or created_by = auth.uid() or has_permission('tasks.view_all')
  );

-- Anyone active may make themselves a task. Putting one on somebody
-- else needs tasks.assign.
drop policy if exists "tasks: insert" on tasks;
create policy "tasks: insert" on tasks
  for insert with check (
    is_active_member()
    and (owner_id = auth.uid() or has_permission('tasks.assign'))
  );

drop policy if exists "tasks: update" on tasks;
create policy "tasks: update" on tasks
  for update using (
    owner_id = auth.uid() or created_by = auth.uid() or has_permission('tasks.assign')
  );

drop policy if exists "tasks: delete" on tasks;
create policy "tasks: delete" on tasks
  for delete using (created_by = auth.uid() or has_permission('tasks.assign'));

drop policy if exists "task_comments: follow the task" on task_comments;
create policy "task_comments: follow the task" on task_comments
  for all using (can_see_task(task_id))
  with check (can_see_task(task_id) and author_id = auth.uid());

-- A checklist is readable if it is yours, or if it hangs off a task
-- you can see. Checklists on an SOP or a meeting get their own policy
-- added by the prompt that builds those tables — this one deliberately
-- does not guess at them.
drop policy if exists "checklists: read" on checklists;
create policy "checklists: read" on checklists
  for select using (
    created_by = auth.uid()
    or exists (select 1 from tasks t where t.checklist_id = checklists.id and can_see_task(t.id))
  );

drop policy if exists "checklists: write own" on checklists;
create policy "checklists: write own" on checklists
  for all using (created_by = auth.uid() or has_permission('tasks.assign'))
  with check (is_active_member());

drop policy if exists "checklist_items: follow the checklist" on checklist_items;
create policy "checklist_items: follow the checklist" on checklist_items
  for all using (
    exists (
      select 1 from checklists c
       where c.id = checklist_items.checklist_id
         and (c.created_by = auth.uid()
              or exists (select 1 from tasks t where t.checklist_id = c.id and can_see_task(t.id)))
    )
  )
  with check (is_active_member());

-- Notifications are yours alone. Nobody reads anyone else's, including
-- the shura — there is nothing in them that is not already visible on
-- the thing they point at.
drop policy if exists "notifications: own" on notifications;
create policy "notifications: own" on notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notification_preferences: own" on notification_preferences;
create policy "notification_preferences: own" on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 5. Realtime for the unread badge
-- ---------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
