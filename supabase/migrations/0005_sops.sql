-- Edgware Youth CRM — Prompt 3. Section 4.5 of docs/SPEC.md.
--
-- An SOP is a written guide plus a checklist generated from its steps.
-- The checklist on the SOP itself is the MASTER: it is never ticked.
-- "Run this SOP" copies it into a fresh checklist attached to a task,
-- so two people running the same SOP never tread on each other, and
-- the library keeps showing the standard rather than somebody's
-- half-finished copy.

create table if not exists sops (
  id        uuid primary key default gen_random_uuid(),
  title     text not null,
  category  text not null default 'General',
  -- The full written guide. People read this; the checklist is the
  -- doing-it version of the same thing.
  body      text not null default '',

  checklist_id uuid references checklists (id) on delete set null,

  status  text not null default 'draft' check (status in ('draft', 'published')),

  -- Bumped whenever the body or steps change. sop_reads stores the
  -- version somebody read, so a change turns their tick back into
  -- "needs re-reading" without anybody having to clear anything.
  version int not null default 1,

  -- Explicit, rather than "no visibility rows means everyone".
  -- An absent rule reading as "show it to the whole organisation" is
  -- the wrong way for a default to fail on a table that will hold
  -- "Handling cash" and "Safeguarding: reporting a concern".
  visible_to_all boolean not null default false,

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Visibility by tier, by team, and by named person — spec 4.5 allows
-- any combination, so these are three tables rather than one column.
create table if not exists sop_visible_tiers (
  sop_id   uuid not null references sops (id) on delete cascade,
  tier_key text not null check (tier_key in ('shura', 'sabiqun', 'muhsinun', 'ansar')),
  primary key (sop_id, tier_key)
);

create table if not exists sop_visible_teams (
  sop_id   uuid not null references sops (id) on delete cascade,
  team_key text not null references teams (key) on delete cascade,
  primary key (sop_id, team_key)
);

create table if not exists sop_visible_people (
  sop_id     uuid not null references sops (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (sop_id, profile_id)
);

-- "I've read this", against the version that was read.
create table if not exists sop_reads (
  sop_id       uuid not null references sops (id)     on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  version_read int not null,
  read_at      timestamptz not null default now(),
  primary key (sop_id, profile_id)
);

create table if not exists sop_versions (
  id         uuid primary key default gen_random_uuid(),
  sop_id     uuid not null references sops (id) on delete cascade,
  version    int  not null,
  title      text not null,
  body       text not null,
  changed_by uuid references profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists sop_versions_sop_idx on sop_versions (sop_id, version desc);

-- ---------------------------------------------------------------
-- Who may see an SOP
--
-- security definer, because it reads profiles and team_members, both
-- of which have their own RLS — a plain subquery inside a policy would
-- see only what the caller can already see and quietly return the
-- wrong answer.
--
-- The Ansar badge is checked alongside the tier, not instead of it, so
-- a sabiqun with the badge sees SOPs aimed at either.
-- ---------------------------------------------------------------

create or replace function public.can_see_sop(p_sop_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    has_permission('sops.manage')
    or exists (
      select 1
        from sops s
       where s.id = p_sop_id
         and s.status = 'published'
         and (
           s.visible_to_all
           or exists (
             select 1 from sop_visible_tiers v, profiles p
              where v.sop_id = s.id
                and p.id = auth.uid()
                and p.is_active
                and (v.tier_key = p.tier or (p.is_ansar and v.tier_key = 'ansar'))
           )
           or exists (
             select 1 from sop_visible_teams v
              join team_members tm on tm.team_key = v.team_key
             where v.sop_id = s.id and tm.profile_id = auth.uid()
           )
           or exists (
             select 1 from sop_visible_people v
              where v.sop_id = s.id and v.profile_id = auth.uid()
           )
         )
    )
$$;

-- ---------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------

alter table sops                enable row level security;
alter table sop_visible_tiers   enable row level security;
alter table sop_visible_teams   enable row level security;
alter table sop_visible_people  enable row level security;
alter table sop_reads           enable row level security;
alter table sop_versions        enable row level security;

drop policy if exists "sops: read visible" on sops;
create policy "sops: read visible" on sops
  for select using (can_see_sop(id));

drop policy if exists "sops: manage" on sops;
create policy "sops: manage" on sops
  for all using (has_permission('sops.manage'))
  with check (has_permission('sops.manage'));

-- The visibility rows are readable by anyone who can see the SOP, so
-- the page can say "shura and the finance team" without a second
-- privileged call. Editing them is sops.manage.
drop policy if exists "sop_visible_tiers: read" on sop_visible_tiers;
create policy "sop_visible_tiers: read" on sop_visible_tiers
  for select using (can_see_sop(sop_id));
drop policy if exists "sop_visible_tiers: manage" on sop_visible_tiers;
create policy "sop_visible_tiers: manage" on sop_visible_tiers
  for all using (has_permission('sops.manage')) with check (has_permission('sops.manage'));

drop policy if exists "sop_visible_teams: read" on sop_visible_teams;
create policy "sop_visible_teams: read" on sop_visible_teams
  for select using (can_see_sop(sop_id));
drop policy if exists "sop_visible_teams: manage" on sop_visible_teams;
create policy "sop_visible_teams: manage" on sop_visible_teams
  for all using (has_permission('sops.manage')) with check (has_permission('sops.manage'));

drop policy if exists "sop_visible_people: read" on sop_visible_people;
create policy "sop_visible_people: read" on sop_visible_people
  for select using (can_see_sop(sop_id));
drop policy if exists "sop_visible_people: manage" on sop_visible_people;
create policy "sop_visible_people: manage" on sop_visible_people
  for all using (has_permission('sops.manage')) with check (has_permission('sops.manage'));

-- You write your own read receipt. The shura read everyone's, because
-- "who hasn't read this yet" is the entire point of tracking it.
drop policy if exists "sop_reads: own" on sop_reads;
create policy "sop_reads: own" on sop_reads
  for all using (profile_id = auth.uid() or has_permission('sops.manage'))
  with check (profile_id = auth.uid());

drop policy if exists "sop_versions: follow the sop" on sop_versions;
create policy "sop_versions: follow the sop" on sop_versions
  for select using (can_see_sop(sop_id));
drop policy if exists "sop_versions: manage" on sop_versions;
create policy "sop_versions: manage" on sop_versions
  for all using (has_permission('sops.manage')) with check (has_permission('sops.manage'));

-- A checklist attached to an SOP you can see is readable. 0003's
-- policy deliberately did not guess at this; here it is now that sops
-- exists.
drop policy if exists "checklists: read via sop" on checklists;
create policy "checklists: read via sop" on checklists
  for select using (
    source = 'sop' and source_id is not null and can_see_sop(source_id)
  );

drop policy if exists "checklist_items: read via sop" on checklist_items;
create policy "checklist_items: read via sop" on checklist_items
  for select using (
    exists (
      select 1 from checklists c
       where c.id = checklist_items.checklist_id
         and c.source = 'sop'
         and c.source_id is not null
         and can_see_sop(c.source_id)
    )
  );

-- Grants. RLS still decides the rows; see 0004 for why this is
-- explicit rather than left to default privileges.
grant select, insert, update, delete on
  sops, sop_visible_tiers, sop_visible_teams, sop_visible_people, sop_reads, sop_versions
to authenticated;

grant execute on function public.can_see_sop(uuid) to authenticated;

notify pgrst, 'reload schema';
