-- Edgware Youth CRM — Prompt 7. Section 4.12 of docs/SPEC.md.
--
-- Vision, mission and values; the year plan; OKRs; KPIs.
--
-- The organising idea: a priority at the top, objectives hanging off
-- it, key results under those, and events and tasks pointing back up.
-- That chain is what lets somebody ask "why are we running this?" and
-- get an answer out of the system instead of out of a meeting.

-- ---------------------------------------------------------------
-- 1. Vision, mission, values
-- ---------------------------------------------------------------

-- Key/value rather than one row with four columns, so the shura can be
-- given a fifth statement without a migration.
create table if not exists org_statements (
  key        text primary key,
  label      text not null,
  body       text not null default '',
  position   int not null default 0,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into org_statements (key, label, body, position) values
  ('purpose', 'Purpose',
   'Developing brothers who are committed to working for Islam to its peak', 1),
  ('vision',  'Vision',
   'Young Muslims revive Islam & reform Edgware (Muslim) Society', 2),
  ('mission', 'Mission',
   'We cultivate believers, shape key conversations, and contribute to Edgware Society', 3)
on conflict (key) do nothing;

create table if not exists org_values (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  position    int not null default 0
);

insert into org_values (name, description, position) values
  ('Sincerity',      'Working for Allah''s pleasure alone', 1),
  ('Discipline',     'Honour all commitments diligently', 2),
  ('Accountability', 'Ownership over excuses', 3),
  ('Sacrifice',      'Mission before comfort, trust in Allah''s promise', 4),
  ('Brotherhood',    'Collaboration and genuine care', 5)
on conflict do nothing;

/**
 * The five priorities.
 *
 * `number` is what people say out loud — "that's a priority three
 * thing" — so it is a column rather than something derived from the
 * ordering, which would silently change if a row were reordered.
 */
create table if not exists org_priorities (
  id          uuid primary key default gen_random_uuid(),
  number      int not null unique check (number between 1 and 20),
  title       text not null,
  description text,
  is_active   boolean not null default true
);

insert into org_priorities (number, title, description) values
  (1, 'Nurturing a special brotherhood', 'Halaqat and internal retreats'),
  (2, 'Bolster recruitment',             'Interpersonal dawah'),
  (3, 'Promote our presence locally',    'Digital and offline'),
  (4, 'Fortify the organisation',        'Systems, structure and culture'),
  (5, 'Build finances',                  'Fundraisers and waqf')
on conflict (number) do nothing;

-- ---------------------------------------------------------------
-- 2. The year plan
-- ---------------------------------------------------------------

create table if not exists year_plan_goals (
  id          uuid primary key default gen_random_uuid(),
  year        int not null check (year between 2020 and 2100),
  quarter     int not null check (quarter between 1 and 4),
  title       text not null,
  detail      text,
  owner_id    uuid references profiles (id) on delete set null,
  priority_id uuid references org_priorities (id) on delete set null,
  -- The calendar link the spec asks for: a goal can name the event
  -- that delivers it.
  initiative_id uuid references initiatives (id) on delete set null,
  status      text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'dropped')),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists year_plan_period_idx on year_plan_goals (year, quarter, position);

-- ---------------------------------------------------------------
-- 3. OKRs
-- ---------------------------------------------------------------

create table if not exists objectives (
  id          uuid primary key default gen_random_uuid(),
  priority_id uuid references org_priorities (id) on delete set null,
  title       text not null,
  description text,
  year        int not null,
  quarter     int check (quarter between 1 and 4),
  owner_id    uuid references profiles (id) on delete set null,
  status      text not null default 'active'
    check (status in ('draft', 'active', 'done', 'dropped')),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

/**
 * A key result.
 *
 * `direction` exists because not every target is something you want to
 * go up. "Fewer than 3 volunteers dropping out" is a real key result,
 * and progress on it counted the usual way round would read as failure
 * the whole time.
 */
create table if not exists key_results (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null references objectives (id) on delete cascade,
  title        text not null,
  unit         text,
  start_value  numeric(12, 2) not null default 0,
  target_value numeric(12, 2) not null,
  current_value numeric(12, 2) not null default 0,
  direction    text not null default 'up' check (direction in ('up', 'down')),
  owner_id     uuid references profiles (id) on delete set null,
  quarter      int check (quarter between 1 and 4),
  year         int,
  updated_at   timestamptz not null default now(),
  position     int not null default 0,
  constraint target_differs_from_start check (target_value <> start_value)
);

create index if not exists key_results_owner_idx on key_results (owner_id);

-- Progress as a number everybody agrees on, computed once here rather
-- than in three different components that will drift.
create or replace view key_result_progress
with (security_invoker = true) as
select
  k.*,
  greatest(0, least(100, round(
    ((k.current_value - k.start_value) / nullif(k.target_value - k.start_value, 0)) * 100
  )))::int as percent_complete
from key_results k;

-- Events and tasks can point at a key result. Nullable, added rather
-- than designed in, because nothing before this phase knew OKRs existed.
alter table tasks       add column if not exists key_result_id uuid references key_results (id) on delete set null;
alter table initiatives add column if not exists key_result_id uuid references key_results (id) on delete set null;

create index if not exists tasks_key_result_idx on tasks (key_result_id) where key_result_id is not null;

-- ---------------------------------------------------------------
-- 4. KPIs
-- ---------------------------------------------------------------

create table if not exists kpis (
  id       uuid primary key default gen_random_uuid(),
  key      text not null unique,
  name     text not null,
  unit     text,
  -- What "one period" means for this number.
  cadence  text not null default 'monthly' check (cadence in ('weekly', 'monthly')),
  -- Whether the CRM can work it out. An auto KPI still accepts a
  -- manual value — see the comment on kpi_values.is_auto.
  is_auto  boolean not null default false,
  target   numeric(12, 2),
  direction text not null default 'up' check (direction in ('up', 'down')),
  description text,
  is_active boolean not null default true,
  position int not null default 0
);

/**
 * One value per KPI per period.
 *
 * `period` is always the first day of the month (or of the week for
 * weekly KPIs), so gaps are visible rather than merely absent.
 *
 * `is_auto` records how the number GOT here, which matters more than
 * it looks: when a calculated figure and somebody's count disagree,
 * the first question is always which one the system produced. A manual
 * value overwrites an automatic one and is never overwritten back —
 * see refresh_auto_kpis().
 */
create table if not exists kpi_values (
  id         uuid primary key default gen_random_uuid(),
  kpi_id     uuid not null references kpis (id) on delete cascade,
  period     date not null,
  value      numeric(12, 2) not null,
  is_auto    boolean not null default false,
  note       text,
  recorded_by uuid references profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (kpi_id, period)
);

create index if not exists kpi_values_period_idx on kpi_values (kpi_id, period desc);

insert into kpis (key, name, unit, cadence, is_auto, direction, description, position) values
  ('dars_attendance',      'Weekly dars attendance',        'people',  'monthly', true,  'up',
   'Average actual attendance across the dars and halaqat that month.', 1),
  ('first_timers',         'New attendees',                 'people',  'monthly', true,  'up',
   'First-timers recorded across everything that ran.', 2),
  ('active_volunteers',    'Active volunteers',             'people',  'monthly', true,  'up',
   'People who were on a rota or finished a task that month.', 3),
  ('muhsinun_promoted',    'Muhsinun promoted',             'people',  'monthly', false, 'up',
   'Manual until the development pathway is built.', 4),
  ('social_followers',     'Social followers',              'people',  'monthly', false, 'up',
   'Typed in. Nothing here talks to the platforms.', 5),
  ('monthly_donations',    'Donations received',            '£',       'monthly', true,  'up',
   'Everything recorded as money in, across all funds.', 6),
  ('pledges_collected_pct','Pledges collected',             '%',       'monthly', true,  'up',
   'Of the pledges recorded for that month, the share marked paid.', 7),
  ('actions_on_time_pct',  'Meeting actions done on time',  '%',       'monthly', true,  'up',
   'Tasks from minutes finished on or before their due date.', 8)
on conflict (key) do update set
  name = excluded.name, unit = excluded.unit, cadence = excluded.cadence,
  is_auto = excluded.is_auto, description = excluded.description,
  position = excluded.position;

/**
 * Fill in everything the CRM can work out for one month.
 *
 * Only touches rows it wrote itself. A number a human typed in is
 * never overwritten by a calculation — if somebody counted the room
 * and the system disagrees, the person who was in the room wins, and
 * the disagreement stays visible instead of being silently resolved at
 * three in the morning.
 *
 * Returns how many KPIs it filled.
 */
create or replace function public.refresh_auto_kpis(p_period date default date_trunc('month', current_date)::date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_month  date := date_trunc('month', p_period)::date;
  v_next   date := (v_month + interval '1 month')::date;
  v_filled int := 0;
begin
  -- Inline upserts rather than a helper per KPI: longer, but the whole
  -- calculation stays readable in one place, and each one's `where
  -- kpi_values.is_auto` is the clause that protects a human's entry.

  -- Average attendance at the recurring stuff.
  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month,
         coalesce(round(avg(i.actual_attendance)::numeric, 1), 0), true
    from kpis k
    left join initiatives i
      on i.initiative_type in ('dars', 'halaqah')
     and i.actual_attendance is not null
     and i.starts_on >= v_month and i.starts_on < v_next
   where k.key = 'dars_attendance'
   group by k.id
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month, coalesce(sum(i.first_timers), 0), true
    from kpis k
    left join initiatives i
      on i.first_timers is not null
     and i.starts_on >= v_month and i.starts_on < v_next
   where k.key = 'first_timers'
   group by k.id
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  -- On a rota, or finished a task.
  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month, (
    select count(distinct person) from (
      select v.profile_id as person
        from initiative_volunteers v
        join initiatives i on i.id = v.initiative_id
       where v.profile_id is not null
         and i.starts_on >= v_month and i.starts_on < v_next
      union
      select t.owner_id
        from tasks t
       where t.owner_id is not null
         and t.completed_at >= v_month and t.completed_at < v_next
    ) people
  ), true
    from kpis k where k.key = 'active_volunteers'
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month, coalesce((
    select sum(t.amount) from finance_transactions t
     where t.direction = 'in'
       and t.occurred_on >= v_month and t.occurred_on < v_next
  ), 0), true
    from kpis k where k.key = 'monthly_donations'
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  -- Share of that month's recorded pledges marked paid. Null when
  -- nothing was recorded — which is stored as no row at all, because a
  -- 0% that means "we did not check" is worse than a gap in the chart.
  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month, x.pct, true
    from kpis k
    join lateral (
      select round(
               100.0 * count(*) filter (where pp.status = 'paid')
               / nullif(count(*), 0), 1) as pct
        from pledge_payments pp
       where pp.month = v_month
    ) x on x.pct is not null
   where k.key = 'pledges_collected_pct'
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  -- Meeting actions finished on or before the day they were due.
  insert into kpi_values (kpi_id, period, value, is_auto)
  select k.id, v_month, x.pct, true
    from kpis k
    join lateral (
      select round(
               100.0 * count(*) filter (
                 where t.status = 'done'
                   and t.completed_at is not null
                   and t.completed_at::date <= t.due_date)
               / nullif(count(*), 0), 1) as pct
        from tasks t
       where t.source = 'meeting'
         and t.due_date >= v_month and t.due_date < v_next
    ) x on x.pct is not null
   where k.key = 'actions_on_time_pct'
  on conflict (kpi_id, period) do update
    set value = excluded.value, recorded_at = now()
    where kpi_values.is_auto;
  v_filled := v_filled + 1;

  return v_filled;
end;
$$;

-- ---------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------

alter table org_statements  enable row level security;
alter table org_values      enable row level security;
alter table org_priorities  enable row level security;
alter table year_plan_goals enable row level security;
alter table objectives      enable row level security;
alter table key_results     enable row level security;
alter table kpis            enable row level security;
alter table kpi_values      enable row level security;

-- VMV: everyone reads, shura edit. The one part of the strategy that
-- is deliberately visible to the whole organisation.
do $$
declare t text;
begin
  foreach t in array array['org_statements', 'org_values', 'org_priorities'] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format('create policy "%s: read" on %I for select using (is_active_member())', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using (has_permission(''strategy.edit'')) '
      || 'with check (has_permission(''strategy.edit''))', t, t);
  end loop;
end $$;

-- The year plan. Shura and sabiqun by tier; anyone else only if the
-- shura grant them yearplan.view individually, which is exactly what
-- "only if invited" means in the access matrix.
drop policy if exists "year_plan_goals: read" on year_plan_goals;
create policy "year_plan_goals: read" on year_plan_goals
  for select using (has_permission('yearplan.view'));

drop policy if exists "year_plan_goals: write" on year_plan_goals;
create policy "year_plan_goals: write" on year_plan_goals
  for all using (has_permission('strategy.edit'))
  with check (has_permission('strategy.edit'));

-- OKRs are not for everyone: the matrix gives ansar and muhsinun no
-- access at all, and neither tier holds either okr permission.
drop policy if exists "objectives: read" on objectives;
create policy "objectives: read" on objectives
  for select using (
    has_permission('okr.manage') or has_permission('okr.update_own')
  );

drop policy if exists "objectives: write" on objectives;
create policy "objectives: write" on objectives
  for all using (has_permission('okr.manage'))
  with check (has_permission('okr.manage'));

drop policy if exists "key_results: read" on key_results;
create policy "key_results: read" on key_results
  for select using (
    has_permission('okr.manage') or has_permission('okr.update_own')
  );

drop policy if exists "key_results: manage" on key_results;
create policy "key_results: manage" on key_results
  for all using (has_permission('okr.manage'))
  with check (has_permission('okr.manage'));

/**
 * "Owners update their own."
 *
 * The WITH CHECK repeats owner_id = auth.uid() so that updating a key
 * result cannot also hand it to somebody else. Without it, an owner
 * could reassign their own missed target to another person and it
 * would leave no trace.
 */
drop policy if exists "key_results: owner updates" on key_results;
create policy "key_results: owner updates" on key_results
  for update using (
    owner_id = auth.uid() and has_permission('okr.update_own')
  )
  with check (
    owner_id = auth.uid() and has_permission('okr.update_own')
  );

drop policy if exists "kpis: read" on kpis;
create policy "kpis: read" on kpis
  for select using (has_permission('kpi.view'));

drop policy if exists "kpis: write" on kpis;
create policy "kpis: write" on kpis
  for all using (has_permission('strategy.edit'))
  with check (has_permission('strategy.edit'));

drop policy if exists "kpi_values: read" on kpi_values;
create policy "kpi_values: read" on kpi_values
  for select using (has_permission('kpi.view'));

drop policy if exists "kpi_values: write" on kpi_values;
create policy "kpi_values: write" on kpi_values
  for all using (has_permission('strategy.edit'))
  with check (has_permission('strategy.edit'));

-- ---------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------

grant select, insert, update, delete on
  org_statements, org_values, org_priorities, year_plan_goals,
  objectives, key_results, kpis, kpi_values
to authenticated;

grant select on key_result_progress to authenticated;
grant execute on function public.refresh_auto_kpis(date) to authenticated;

notify pgrst, 'reload schema';
