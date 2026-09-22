-- Edgware Youth CRM — Prompt 9, parts one and two.
-- Sections 4.11 (Media planning) and 4.14 (Development pathway).
--
-- Media planning ONLY. There is no editing workflow, no review queue,
-- no asset approval — the spec is explicit, and the template's video
-- review feature was removed in Prompt 0 for the same reason. What
-- this holds is the plan: what we are posting, why, when, and who is
-- doing it.

-- ---------------------------------------------------------------
-- 1. Media goals, platforms, pillars
-- ---------------------------------------------------------------

create table if not exists media_goals (
  id        uuid primary key default gen_random_uuid(),
  title     text not null,
  metric    text,
  target    numeric(12, 2),
  current_value numeric(12, 2) not null default 0,
  -- The link the spec asks for: a media goal that serves a key result
  -- rather than floating on its own.
  key_result_id uuid references key_results (id) on delete set null,
  year      int not null default extract(year from current_date),
  quarter   int check (quarter between 1 and 4),
  owner_id  uuid references profiles (id) on delete set null,
  position  int not null default 0
);

create table if not exists media_platforms (
  id        uuid primary key default gen_random_uuid(),
  platform  text not null unique,
  purpose   text,
  audience  text,
  frequency text,
  what_works text,
  is_active boolean not null default true,
  position  int not null default 0
);

insert into media_platforms (platform, purpose, audience, frequency, position) values
  ('Instagram', 'Reach and recognition. The first place someone looks us up.', 'Local 15-25s and their parents', 'Twice a week', 1),
  ('TikTok',    'Reach people who have never heard of us.', 'Under 20s', 'Twice a week', 2),
  ('YouTube',   'The long form — full talks, so a good one keeps working.', 'Anyone searching for the topic', 'After each event', 3),
  ('WhatsApp',  'The people who already come. Reminders, not marketing.', 'Attendees and volunteers', 'Weekly, before the dars', 4)
on conflict (platform) do nothing;

create table if not exists content_pillars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  position    int not null default 0
);

insert into content_pillars (name, description, position) values
  ('Seerah and stories',   'The life of the Prophet ﷺ and the people around him.', 1),
  ('Answering questions',  'The things young Muslims are actually asked.', 2),
  ('Brotherhood',          'What the community looks like from the inside.', 3),
  ('What is on',           'Events, times, places. The useful ones.', 4)
on conflict do nothing;

create table if not exists content_calendar (
  id          uuid primary key default gen_random_uuid(),
  planned_for date not null,
  platform    text,
  pillar_id   uuid references content_pillars (id) on delete set null,
  title       text not null,
  notes       text,
  owner_id    uuid references profiles (id) on delete set null,
  initiative_id uuid references initiatives (id) on delete set null,
  status      text not null default 'idea'
    check (status in ('idea', 'planned', 'posted', 'dropped')),
  posted_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists content_calendar_date_idx on content_calendar (planned_for);

-- The shot list for an event. Separate from the media plan because a
-- plan item is "a recap post" and a shot is "the moment everyone
-- stands for salah" — different granularity, different person.
create table if not exists initiative_shot_list (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  shot          text not null,
  owner_id      uuid references profiles (id) on delete set null,
  captured      boolean not null default false,
  position      int not null default 0
);

create table if not exists media_guidelines (
  id       uuid primary key default gen_random_uuid(),
  section  text not null,
  body     text not null default '',
  position int not null default 0
);

insert into media_guidelines (section, body, position) values
  ('Tone of voice',
   'Warm, plain and unhurried. We are not selling anything. Write the way you would speak to someone you respect who has never been to a halaqah.', 1),
  ('Do',
   'Name people. Show faces of those who have consented. Say when and where. Post the useful thing before the beautiful thing.', 2),
  ('Do not',
   'No photographs of under-18s without recorded consent — check the event file. No music beds. No countdown to something that is not booked.', 3),
  ('Logo',
   'logo-dark.png is BLACK lettering, for light backgrounds. logo-light.png is white, for dark. Getting these the wrong way round makes it invisible.', 4),
  ('Colours',
   'Accent #2F5283. Hover #243F66. Tint #E6ECF4. On dark backgrounds the accent lightens to #8FAED9 so it stays readable.', 5)
on conflict do nothing;

/**
 * The monthly media review, which feeds the KPI.
 *
 * Numbers typed in, because nothing here talks to the platforms and
 * pretending otherwise would give a figure that silently goes stale.
 */
create table if not exists media_reviews (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique,
  followers   int,
  reach       int,
  posts       int,
  engagement  int,
  what_worked text,
  what_did_not text,
  recorded_by uuid references profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint media_month_is_the_first
    check (date_trunc('month', month)::date = month)
);

-- ---------------------------------------------------------------
-- 2. Event media plans, dated backwards
-- ---------------------------------------------------------------

create table if not exists template_media_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  channel     text not null,
  asset       text not null,
  offset_days int not null default 0,
  role_key    text,
  position    int not null default 0
);

-- The same five beats every event needs, scaled by weight.
insert into template_media_items (template_id, channel, asset, offset_days, role_key, position)
select t.id, m.channel, m.asset, m.offset_days, 'media', m.position
  from initiative_templates t
  join (values
    ('Instagram', 'Poster',                    -21, 1, array['standard','heavy']),
    ('Instagram', 'Teaser clip',               -10, 2, array['standard','heavy']),
    ('WhatsApp',  'Reminder to the group',      -2, 3, array['light','standard','heavy']),
    ('Instagram', 'Countdown story',            -1, 4, array['standard','heavy']),
    ('Instagram', 'On the day coverage',         0, 5, array['light','standard','heavy']),
    ('Instagram', 'Recap post',                  2, 6, array['standard','heavy']),
    ('YouTube',   'Full talk uploaded',          7, 7, array['heavy'])
  ) as m(channel, asset, offset_days, position, weights)
    on t.weight = any(m.weights)
where not exists (
  select 1 from template_media_items x where x.template_id = t.id
);

-- Extend the approval function so the media plan appears with the rest
-- of the plan, dated backwards from the event like the milestones.
create or replace function public.build_initiative_media_plan(p_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_i    initiatives%rowtype;
  v_base date;
  v_made int := 0;
begin
  if not (has_permission('events.approve') or can_edit_initiative(p_id)) then
    raise exception 'Not allowed to build the media plan for this initiative.'
      using errcode = '42501';
  end if;

  select * into v_i from initiatives where id = p_id;
  if not found or v_i.template_id is null then return 0; end if;
  v_base := coalesce(v_i.starts_on, current_date);

  insert into initiative_media_plan
    (initiative_id, channel, asset, due_date, owner_id, status, position)
  select p_id, t.channel, t.asset, v_base + t.offset_days,
         (select r.profile_id from initiative_roles r
           where r.initiative_id = p_id and r.role_key = t.role_key),
         'idea', t.position
    from template_media_items t
   where t.template_id = v_i.template_id
     and not exists (
       select 1 from initiative_media_plan p
        where p.initiative_id = p_id and p.asset = t.asset and p.channel = t.channel
     );

  get diagnostics v_made = row_count;
  return v_made;
end;
$$;

-- ---------------------------------------------------------------
-- 3. Development pathway (Muhsinun -> Sabiqun)
-- ---------------------------------------------------------------

create table if not exists development_milestones (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  -- What the CRM can count for itself. Null means somebody ticks it.
  auto_source text check (auto_source in (
    'events_volunteered', 'responsibilities_held', 'tasks_completed',
    'meetings_attended', 'sops_read'
  )),
  target_count int not null default 1 check (target_count >= 1),
  is_active   boolean not null default true,
  position    int not null default 0
);

insert into development_milestones (key, name, description, auto_source, target_count, position) values
  ('volunteered',   'Volunteered at events',        'On the rota, and turned up.',                 'events_volunteered',  3, 1),
  ('responsibility','Took a responsibility',        'Held a named role on an event.',              'responsibilities_held', 1, 2),
  ('halaqat',       'Attended halaqat or a retreat','Came to the tarbiyah side, not just events.', 'meetings_attended',   4, 3),
  ('led_a_task',    'Led a task through to done',   'Owned something and finished it.',            'tasks_completed',     5, 4),
  ('sops',          'Read the key SOPs',            'Safeguarding first.',                         'sops_read',           3, 5),
  ('course',        'Completed a course',           'Ticked by the shura.',                        null,                  1, 6),
  ('shadowed',      'Shadowed an event lead',       'Ticked by the shura.',                        null,                  1, 7)
on conflict (key) do update set
  name = excluded.name, description = excluded.description,
  auto_source = excluded.auto_source, target_count = excluded.target_count,
  position = excluded.position;

create table if not exists development_progress (
  profile_id   uuid not null references profiles (id) on delete cascade,
  milestone_id uuid not null references development_milestones (id) on delete cascade,
  count_so_far int not null default 0 check (count_so_far >= 0),
  -- A shura tick. Set by hand, and never overwritten by the counter —
  -- same rule as the KPIs: a person's judgement outranks a count.
  marked_done  boolean not null default false,
  marked_by    uuid references profiles (id) on delete set null,
  note         text,
  updated_at   timestamptz not null default now(),
  primary key (profile_id, milestone_id)
);

/**
 * Count what the CRM already knows about somebody.
 *
 * Only touches count_so_far. A milestone the shura ticked by hand
 * stays ticked whatever the count says — see marked_done above.
 */
create or replace function public.refresh_development_progress()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_rows int := 0;
begin
  insert into development_progress (profile_id, milestone_id, count_so_far, updated_at)
  select p.id, m.id,
         case m.auto_source
           when 'events_volunteered' then (
             select count(distinct v.initiative_id) from initiative_volunteers v
              where v.profile_id = p.id)
           when 'responsibilities_held' then (
             select count(distinct r.initiative_id) from initiative_roles r
              where r.profile_id = p.id)
           when 'tasks_completed' then (
             select count(*) from tasks t
              where t.owner_id = p.id and t.status = 'done')
           when 'meetings_attended' then (
             select count(*) from meeting_attendees a
              where a.profile_id = p.id and a.attendance = 'present')
           when 'sops_read' then (
             select count(*) from sop_reads s where s.profile_id = p.id)
           else 0
         end,
         now()
    from profiles p
    cross join development_milestones m
   where p.is_active and m.is_active and m.auto_source is not null
  on conflict (profile_id, milestone_id) do update
    set count_so_far = excluded.count_so_far, updated_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

/**
 * Who is ready to step up.
 *
 * A muhsin counts as ready when every ACTIVE milestone is either
 * counted past its target or ticked by the shura. It is a suggestion,
 * not a promotion — the decision stays with people.
 */
create or replace view ready_to_step_up
with (security_invoker = true) as
select
  p.id as profile_id,
  p.full_name,
  count(*) filter (
    where d.marked_done or coalesce(d.count_so_far, 0) >= m.target_count
  ) as met,
  count(*) as total
from profiles p
cross join development_milestones m
left join development_progress d on d.profile_id = p.id and d.milestone_id = m.id
where p.is_active and p.tier = 'muhsinun' and m.is_active
group by p.id, p.full_name;

/**
 * The dawah target list.
 *
 * Built now, switched on when the Dawah/Outreach team is (Part B
 * decision 5). The gate is `teams.is_active` rather than a new flag,
 * because that switch already exists and already hides the team
 * everywhere else.
 */
create table if not exists dawah_targets (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references profiles (id) on delete cascade,
  name      text not null,
  contact   text,
  stage     text not null default 'not_started'
    check (stage in ('not_started', 'spoken', 'invited', 'came', 'regular')),
  next_step text,
  next_step_on date,
  notes     text,
  created_at timestamptz not null default now()
);

create index if not exists dawah_targets_owner_idx on dawah_targets (owner_id);

create or replace function public.dawah_is_live()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_active from teams where key = 'dawah'), false);
$$;

-- ---------------------------------------------------------------
-- 4. Resources library (4.15)
-- ---------------------------------------------------------------
--
-- Per-folder visibility, modelled on SOPs (0005) including the reason
-- `visible_to_all` is an explicit column rather than "no rows means
-- everyone": a folder called "Safeguarding policies" defaulting to the
-- whole organisation is the wrong way for an absent rule to fail.

create table if not exists resource_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  visible_to_all boolean not null default false,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists resource_folder_tiers (
  folder_id uuid not null references resource_folders (id) on delete cascade,
  tier_key  text not null check (tier_key in ('shura', 'sabiqun', 'muhsinun', 'ansar')),
  primary key (folder_id, tier_key)
);

create table if not exists resource_folder_teams (
  folder_id uuid not null references resource_folders (id) on delete cascade,
  team_key  text not null references teams (key) on delete cascade,
  primary key (folder_id, team_key)
);

create table if not exists resources (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references resource_folders (id) on delete cascade,
  title      text not null,
  description text,
  path       text,
  filename   text,
  mime_type  text,
  size_bytes bigint,
  -- A resource can be a link instead of a file.
  url        text,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint a_resource_needs_a_file_or_a_link
    check (path is not null or url is not null)
);

insert into resource_folders (name, description, visible_to_all, position) values
  ('Policies',          'Safeguarding, data protection, code of conduct.', true,  1),
  ('Forms',             'Photo consent, parental consent, incident report.', true, 2),
  ('Volunteer packs',   'What to bring, where to report, what the day looks like.', true, 3),
  ('Speaker briefs',    'The template we send, and past briefs worth copying.', false, 4),
  ('Brand files',       'Logos, colours, fonts. Read the media guidelines first.', true, 5)
on conflict do nothing;

-- Speaker briefs are shura and sabiqun: a draft brief names fees and
-- travel arrangements that are not everybody's business.
insert into resource_folder_tiers (folder_id, tier_key)
select f.id, t.tier_key
  from resource_folders f
  join (values ('shura'), ('sabiqun')) as t(tier_key) on true
 where f.name = 'Speaker briefs'
on conflict do nothing;

create or replace function public.can_see_folder(p_folder_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from resource_folders f
     where f.id = p_folder_id
       and (
         has_permission('resources.upload')
         or f.visible_to_all
         or exists (
           select 1 from resource_folder_tiers v, profiles p
            where v.folder_id = f.id and p.id = auth.uid() and p.is_active
              and (v.tier_key = p.tier or (p.is_ansar and v.tier_key = 'ansar'))
         )
         or exists (
           select 1 from resource_folder_teams v
             join team_members tm on tm.team_key = v.team_key
            where v.folder_id = f.id and tm.profile_id = auth.uid()
         )
       )
  );
$$;

-- ---------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------

alter table media_goals            enable row level security;
alter table media_platforms        enable row level security;
alter table content_pillars        enable row level security;
alter table content_calendar       enable row level security;
alter table initiative_shot_list   enable row level security;
alter table media_guidelines       enable row level security;
alter table media_reviews          enable row level security;
alter table template_media_items   enable row level security;
alter table development_milestones enable row level security;
alter table development_progress   enable row level security;
alter table dawah_targets          enable row level security;
alter table resource_folders       enable row level security;
alter table resource_folder_tiers  enable row level security;
alter table resource_folder_teams  enable row level security;
alter table resources              enable row level security;

-- Media planning: everybody reads, the media team edits, the head of
-- media manages. Per the access matrix.
do $$
declare t text;
begin
  foreach t in array array[
    'media_goals', 'media_platforms', 'content_pillars', 'content_calendar',
    'media_guidelines', 'media_reviews', 'template_media_items'
  ] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format('create policy "%s: read" on %I for select using (is_active_member())', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using ('
      || 'has_permission(''media.manage'') or has_permission(''media.edit'')) '
      || 'with check (has_permission(''media.manage'') or has_permission(''media.edit''))', t, t);
  end loop;
end $$;

-- A shot list belongs to its event, so it follows the event's rules.
drop policy if exists "initiative_shot_list: read" on initiative_shot_list;
create policy "initiative_shot_list: read" on initiative_shot_list
  for select using (can_see_initiative(initiative_id));

drop policy if exists "initiative_shot_list: write" on initiative_shot_list;
create policy "initiative_shot_list: write" on initiative_shot_list
  for all using (can_edit_initiative(initiative_id) or has_permission('media.edit'))
  with check (can_edit_initiative(initiative_id) or has_permission('media.edit'));

drop policy if exists "development_milestones: read" on development_milestones;
create policy "development_milestones: read" on development_milestones
  for select using (is_active_member());

drop policy if exists "development_milestones: write" on development_milestones;
create policy "development_milestones: write" on development_milestones
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

-- Your own progress is yours. The shura see everybody's, which is what
-- makes the "ready to step up" list possible.
drop policy if exists "development_progress: read" on development_progress;
create policy "development_progress: read" on development_progress
  for select using (
    profile_id = auth.uid() or has_permission('development.view_all')
  );

drop policy if exists "development_progress: write" on development_progress;
create policy "development_progress: write" on development_progress
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

/**
 * The dawah list: private to its owner, and invisible to everyone
 * while the team is switched off.
 *
 * dawah_is_live() gates the whole table rather than the UI, so
 * "switched off" means the rows genuinely cannot be read — including
 * by the shura, and including through the API.
 */
drop policy if exists "dawah_targets: read" on dawah_targets;
create policy "dawah_targets: read" on dawah_targets
  for select using (
    dawah_is_live()
    and (owner_id = auth.uid() or has_permission('development.view_all'))
  );

drop policy if exists "dawah_targets: write own" on dawah_targets;
create policy "dawah_targets: write own" on dawah_targets
  for all using (dawah_is_live() and owner_id = auth.uid())
  with check (dawah_is_live() and owner_id = auth.uid());

drop policy if exists "resource_folders: read" on resource_folders;
create policy "resource_folders: read" on resource_folders
  for select using (
    has_permission('resources.upload')
    or visible_to_all
    or exists (
      select 1 from resource_folder_tiers v, profiles p
       where v.folder_id = resource_folders.id and p.id = auth.uid() and p.is_active
         and (v.tier_key = p.tier or (p.is_ansar and v.tier_key = 'ansar'))
    )
    or exists (
      select 1 from resource_folder_teams v
        join team_members tm on tm.team_key = v.team_key
       where v.folder_id = resource_folders.id and tm.profile_id = auth.uid()
    )
  );

drop policy if exists "resource_folders: write" on resource_folders;
create policy "resource_folders: write" on resource_folders
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

do $$
declare t text;
begin
  foreach t in array array['resource_folder_tiers', 'resource_folder_teams'] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format('create policy "%s: read" on %I for select using (can_see_folder(folder_id))', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using (has_permission(''members.manage'')) '
      || 'with check (has_permission(''members.manage''))', t, t);
  end loop;
end $$;

drop policy if exists "resources: read" on resources;
create policy "resources: read" on resources
  for select using (can_see_folder(folder_id));

drop policy if exists "resources: upload" on resources;
create policy "resources: upload" on resources
  for insert with check (
    has_permission('resources.upload') and can_see_folder(folder_id)
  );

drop policy if exists "resources: manage" on resources;
create policy "resources: manage" on resources
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

-- ---------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------

grant select, insert, update, delete on
  media_goals, media_platforms, content_pillars, content_calendar,
  initiative_shot_list, media_guidelines, media_reviews, template_media_items,
  development_milestones, development_progress, dawah_targets,
  resource_folders, resource_folder_tiers, resource_folder_teams, resources
to authenticated;

grant select on ready_to_step_up to authenticated;

grant execute on function public.can_see_folder(uuid) to authenticated;
grant execute on function public.dawah_is_live() to authenticated;
grant execute on function public.refresh_development_progress() to authenticated;
grant execute on function public.build_initiative_media_plan(uuid) to authenticated;

notify pgrst, 'reload schema';
