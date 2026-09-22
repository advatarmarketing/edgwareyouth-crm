-- Edgware Youth CRM — Prompt 1.
-- Sections 2, 3, 4.3 and 4.17 of docs/SPEC.md.
--
-- The whole access model lives here. Every later migration builds its
-- policies out of has_permission() rather than repeating tier checks,
-- so that when the shura grant one sabiqun finance access, it takes
-- effect everywhere at once instead of in whichever screens remembered
-- to ask.

-- ---------------------------------------------------------------
-- 1. The rest of a person
-- ---------------------------------------------------------------

alter table profiles add column if not exists nickname   text;
alter table profiles add column if not exists email      text;
alter table profiles add column if not exists phone      text;

-- One named post, or none. Kept as a constrained text column rather
-- than an enum so the shura can be given more posts later without a
-- migration that rewrites a type every table depends on.
alter table profiles add column if not exists position text
  check (position in ('lead', 'vice_lead', 'head_of_finance', 'head_of_media', 'event_lead'));

alter table profiles add column if not exists skills text[] not null default '{}';
alter table profiles add column if not exists availability text;

-- Safeguarding paperwork. Nullable because "we have not checked yet"
-- and "checked, and it expired" are different states and the second
-- must not be able to masquerade as the first.
alter table profiles add column if not exists dbs_status text
  check (dbs_status in ('none', 'applied', 'valid'));
alter table profiles add column if not exists dbs_expiry date;
alter table profiles add column if not exists first_aid_trained boolean not null default false;
alter table profiles add column if not exists first_aid_expiry date;

alter table profiles add column if not exists date_joined date;
alter table profiles add column if not exists last_engaged_at timestamptz;

-- ---------------------------------------------------------------
-- 2. Teams
-- ---------------------------------------------------------------

create table if not exists teams (
  key       text primary key,
  name      text not null,
  -- Dawah/Outreach and Tarbiyah are built now and switched on next
  -- year (Part B decision 5). Inactive teams are hidden everywhere in
  -- the UI; their rows and policies already exist, so switching one on
  -- is a single update rather than a migration.
  is_active boolean not null default true,
  position  int not null default 0
);

insert into teams (key, name, is_active, position) values
  ('media',    'Media',           true,  1),
  ('finance',  'Finance',         true,  2),
  ('events',   'Events',          true,  3),
  ('dawah',    'Dawah/Outreach',  false, 4),
  ('tarbiyah', 'Tarbiyah',        false, 5)
on conflict (key) do nothing;

create table if not exists team_members (
  profile_id uuid not null references profiles (id) on delete cascade,
  team_key   text not null references teams (key)   on delete cascade,
  primary key (profile_id, team_key)
);

-- ---------------------------------------------------------------
-- 3. Permissions
--
-- Named keys, not booleans on profiles. A key can be granted by tier
-- default or by a per-person override, and code only ever asks
-- has_permission('finance.log') — never "is this person shura".
-- ---------------------------------------------------------------

create table if not exists permissions (
  key         text primary key,
  label       text not null,
  category    text not null,
  description text
);

insert into permissions (key, label, category, description) values
  ('members.view_directory', 'See the members list',            'Members',  'Names and teams of everyone.'),
  ('members.view_contact',   'See contact details',             'Members',  'Phone and email in the directory.'),
  ('members.manage',         'Add and edit members',            'Members',  'Invite, deactivate, set tier and teams.'),
  ('members.view_notes',     'See private notes on members',    'Members',  'Shura-only notes. Sensitive.'),
  ('permissions.manage',     'Change what people can do',       'Admin',    'The permissions screen itself.'),
  ('audit.view',             'See the audit log',               'Admin',    null),
  ('tasks.assign',           'Assign tasks to others',          'Tasks',    'Within their events and teams.'),
  ('sops.manage',            'Write and edit SOPs',             'SOPs',     'Including who each SOP is visible to.'),
  ('calendar.view_all',      'See every calendar layer',        'Calendar', null),
  ('meetings.manage',        'Create and run meetings',         'Meetings', 'Agendas, minutes, publishing actions.'),
  ('meetings.view_shura',    'See shura meetings and minutes',  'Meetings', 'Sensitive.'),
  ('events.propose',         'Propose an event',                'Events',   null),
  ('events.approve',         'Approve an event',                'Events',   null),
  ('events.view_all',        'See every event file',            'Events',   null),
  ('risk.manage',            'Edit risk and safeguarding',      'Events',   null),
  ('finance.view_totals',    'See finance totals and campaigns','Finance',  null),
  ('finance.view_individual','See individual contributions',    'Finance',  'Every member''s pledges. Sensitive.'),
  ('finance.log',            'Log donations and income',        'Finance',  null),
  ('finance.approve',        'Approve expense claims',          'Finance',  'Nobody can approve their own.'),
  ('strategy.edit',          'Edit VMV and the year plan',      'Strategy', null),
  ('yearplan.view',          'See the year plan',               'Strategy', null),
  ('okr.manage',             'Create and edit OKRs',            'Strategy', null),
  ('okr.update_own',         'Update key results they own',     'Strategy', null),
  ('kpi.view',               'See KPIs',                        'Strategy', null),
  ('announcements.post',     'Post announcements',              'Messaging',null),
  ('media.manage',           'Run the media module',            'Media',    null),
  ('media.edit',             'Edit media plans',                'Media',    null),
  ('development.view_all',   'See everyone''s progress',        'Members',  null),
  ('resources.upload',       'Upload to the resources library', 'Resources',null)
on conflict (key) do update set
  label = excluded.label, category = excluded.category, description = excluded.description;

-- Defaults per tier. 'ansar' is the badge, not a tier — someone with
-- tier 'sabiqun' and the badge gets the union of both rows.
create table if not exists tier_permissions (
  tier_key       text not null check (tier_key in ('shura', 'sabiqun', 'muhsinun', 'ansar')),
  permission_key text not null references permissions (key) on delete cascade,
  primary key (tier_key, permission_key)
);

insert into tier_permissions (tier_key, permission_key)
select 'shura', key from permissions
on conflict do nothing;

insert into tier_permissions (tier_key, permission_key) values
  ('sabiqun', 'members.view_directory'),
  ('sabiqun', 'members.view_contact'),
  ('sabiqun', 'tasks.assign'),
  ('sabiqun', 'meetings.manage'),
  ('sabiqun', 'events.propose'),
  ('sabiqun', 'events.view_all'),
  ('sabiqun', 'risk.manage'),
  ('sabiqun', 'yearplan.view'),
  ('sabiqun', 'okr.update_own'),
  ('sabiqun', 'kpi.view'),
  ('sabiqun', 'media.edit'),
  ('sabiqun', 'resources.upload'),
  ('muhsinun', 'members.view_directory'),
  ('ansar',    'members.view_directory')
on conflict do nothing;

-- Per-person override. `granted` is deliberately a boolean rather than
-- a row meaning "allow": the shura need to take a permission AWAY from
-- someone whose tier grants it (a sabiqun who should not see contact
-- details), and a row-present-means-yes design cannot express that.
create table if not exists profile_permissions (
  profile_id     uuid not null references profiles (id)     on delete cascade,
  permission_key text not null references permissions (key) on delete cascade,
  granted        boolean not null,
  set_by         uuid references profiles (id) on delete set null,
  set_at         timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

-- ---------------------------------------------------------------
-- 4. Private notes — a separate table, not a column
--
-- On profiles this would be one careless `select *` away from being
-- rendered to the person it is about. Its own table gets its own
-- policy and cannot be selected by accident.
-- ---------------------------------------------------------------

create table if not exists member_notes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  body       text not null,
  author_id  uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 5. The helpers
--
-- security definer so a policy on any table can ask about the caller's
-- own profile and permissions without recursing into the RLS on those
-- tables. Every one of them is stable and takes no user input beyond a
-- permission key, so there is nothing here to inject into.
-- ---------------------------------------------------------------

create or replace function public.current_tier()
returns text
language sql stable security definer set search_path = public
as $$
  select tier from profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_shura()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active and tier = 'shura'
  )
$$;

/**
 * The one question the rest of the schema asks.
 *
 * Order matters: a per-person override wins outright, including when
 * it revokes something the tier grants. Only if there is no override
 * do the tier defaults apply, and a person with the Ansar badge gets
 * the union of their tier's row and the 'ansar' row.
 *
 * An inactive member has no permissions at all, whatever their tier
 * says — deactivating somebody has to actually stop them.
 */
create or replace function public.has_permission(p_key text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tier     text;
  v_ansar    boolean;
  v_active   boolean;
  v_override boolean;
begin
  select tier, is_ansar, is_active
    into v_tier, v_ansar, v_active
    from profiles
   where id = auth.uid();

  if v_active is not true then
    return false;
  end if;

  select granted into v_override
    from profile_permissions
   where profile_id = auth.uid() and permission_key = p_key;

  if found then
    return v_override;
  end if;

  return exists (
    select 1 from tier_permissions
     where permission_key = p_key
       and (tier_key = v_tier or (v_ansar and tier_key = 'ansar'))
  );
end;
$$;

-- ---------------------------------------------------------------
-- 6. Policies
-- ---------------------------------------------------------------

alter table teams               enable row level security;
alter table team_members        enable row level security;
alter table permissions         enable row level security;
alter table tier_permissions    enable row level security;
alter table profile_permissions enable row level security;
alter table member_notes        enable row level security;

drop policy if exists "teams: members read" on teams;
create policy "teams: members read" on teams
  for select using (is_active_member());

drop policy if exists "teams: shura write" on teams;
create policy "teams: shura write" on teams
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

drop policy if exists "team_members: directory read" on team_members;
create policy "team_members: directory read" on team_members
  for select using (has_permission('members.view_directory'));

drop policy if exists "team_members: manage" on team_members;
create policy "team_members: manage" on team_members
  for all using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

-- The catalogue and the defaults are readable by any member: the app
-- needs them to render the permissions screen and to explain what a
-- key means. Neither table contains anybody's data.
drop policy if exists "permissions: members read" on permissions;
create policy "permissions: members read" on permissions
  for select using (is_active_member());

drop policy if exists "tier_permissions: members read" on tier_permissions;
create policy "tier_permissions: members read" on tier_permissions
  for select using (is_active_member());

drop policy if exists "tier_permissions: manage" on tier_permissions;
create policy "tier_permissions: manage" on tier_permissions
  for all using (has_permission('permissions.manage'))
  with check (has_permission('permissions.manage'));

-- You may see your own overrides — the app shows people what they can
-- do. Changing them needs permissions.manage.
drop policy if exists "profile_permissions: read own or manager" on profile_permissions;
create policy "profile_permissions: read own or manager" on profile_permissions
  for select using (profile_id = auth.uid() or has_permission('permissions.manage'));

drop policy if exists "profile_permissions: manage" on profile_permissions;
create policy "profile_permissions: manage" on profile_permissions
  for all using (has_permission('permissions.manage'))
  with check (has_permission('permissions.manage'));

drop policy if exists "member_notes: shura only" on member_notes;
create policy "member_notes: shura only" on member_notes
  for all using (has_permission('members.view_notes'))
  with check (has_permission('members.view_notes'));

-- Profiles: 0001 gave you your own row. Now the directory.
drop policy if exists "profiles: directory read" on profiles;
create policy "profiles: directory read" on profiles
  for select using (has_permission('members.view_directory'));

drop policy if exists "profiles: manage" on profiles;
create policy "profiles: manage" on profiles
  for update using (has_permission('members.manage'))
  with check (has_permission('members.manage'));

-- ---------------------------------------------------------------
-- 7. The directory view
--
-- Section 3 gives sabiqun "names, teams, contact" and the lower tiers
-- "names only". That is a COLUMN-level difference, which RLS cannot
-- express — a row policy is all-or-nothing on the row.
--
-- Postgres column grants can't vary by tier either, since every signed
-- in user shares one database role. So the masking happens here, in a
-- view that decides per column, and the app reads the directory
-- through it rather than from profiles directly.
--
-- security_invoker so the row policies above still apply: the view
-- narrows what you see of a row, it does not widen which rows you get.
-- ---------------------------------------------------------------

create or replace view member_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.nickname,
  p.tier,
  p.is_ansar,
  p.position,
  p.is_active,
  p.avatar_url,
  case when has_permission('members.view_contact') then p.email end as email,
  case when has_permission('members.view_contact') then p.phone end as phone,
  case when has_permission('members.manage') then p.skills else '{}'::text[] end as skills,
  case when has_permission('members.manage') then p.availability end as availability,
  case when has_permission('members.manage') then p.dbs_status end as dbs_status,
  case when has_permission('members.manage') then p.dbs_expiry end as dbs_expiry,
  case when has_permission('members.manage') then p.first_aid_trained end as first_aid_trained,
  case when has_permission('members.manage') then p.first_aid_expiry end as first_aid_expiry,
  case when has_permission('members.manage') then p.date_joined end as date_joined,
  case when has_permission('members.manage') then p.last_engaged_at end as last_engaged_at
from profiles p;

grant select on member_directory to authenticated;

-- ---------------------------------------------------------------
-- 8. Everything the caller can do, in one round trip
--
-- The nav needs the whole set, and asking has_permission() once per
-- key would be thirty round trips on every page load. This resolves
-- the same rules in one place — override wins, then tier defaults
-- unioned with the ansar row — so there is still only one definition
-- of what a permission means.
-- ---------------------------------------------------------------

create or replace function public.my_permissions()
returns setof text
language sql stable security definer set search_path = public
as $$
  with me as (
    select tier, is_ansar, is_active from profiles where id = auth.uid()
  ),
  defaults as (
    select tp.permission_key
      from tier_permissions tp, me
     where me.is_active
       and (tp.tier_key = me.tier or (me.is_ansar and tp.tier_key = 'ansar'))
  ),
  overrides as (
    select permission_key, granted
      from profile_permissions
     where profile_id = auth.uid()
  )
  select p.key
    from permissions p, me
   where me.is_active
     and coalesce(
           (select o.granted from overrides o where o.permission_key = p.key),
           exists (select 1 from defaults d where d.permission_key = p.key)
         )
$$;

grant execute on function public.my_permissions() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
