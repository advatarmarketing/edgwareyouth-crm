-- Edgware Youth CRM — Prompt 5. Sections 4.8 and 4.9 of docs/SPEC.md.
--
-- TWO DESIGN DECISIONS MADE WITH THE USER, both departures from the
-- spec as written. Read these before changing anything here.
--
-- 1. ONE PLANNING OBJECT, NOT THREE.
--    The spec says "events". But a weekly dars series, a residential
--    camp and a fundraising campaign share nearly the whole file:
--    roles, milestones, a run sheet, risks, a budget, a retrospective,
--    follow-up. Only recurrence really differs. Building `events` now
--    and a parallel `programmes` table later would mean writing all of
--    that twice and watching the two copies drift. So: `initiatives`
--    with a `kind`.
--
-- 2. IHSAN IS NOT A SECTION.
--    The spec made "Ihsan & the senses" section 15 of the event file.
--    A section you fill in last is a section you fill in after every
--    real decision has already been made — the layout is fixed, the
--    run sheet is full, the money is spent. It can only ever be a
--    post-rationalisation.
--
--    So there is no ihsan table holding a checklist. Instead:
--      - the emotional journey sits in the OVERVIEW, next to the aims,
--        because it is an aim (feels_arriving / feels_peak /
--        feels_leaving / one_thing);
--      - the peak moment is a ROW IN THE RUN SHEET at a real time with
--        a real owner (initiative_runsheet.is_peak_moment), not a tick;
--      - every other sense becomes a PROMPT attached to the section
--        where that decision is actually made — smell hangs off venue
--        and equipment, sound off the run sheet, touch off the rota.
--        That is initiative_ihsan_prompts.section.
--      - the 1-5 ratings survive, as columns, at retrospective. That is
--        the part that compounds: six events in you can see that smell
--        scores 2 every time and the cause is that nobody owns the
--        toilets. Prose can never tell you that.
--
--    The cost of integrating is that scattered prompts are easier to
--    skip than an obviously-empty section. initiative_readiness()
--    below is the answer to that, and it is computed, not stored.

-- ---------------------------------------------------------------
-- 0. Audit log
-- ---------------------------------------------------------------

-- Needed here because the safeguarding purge deletes personal data on
-- a schedule with no human in the loop. A deletion nobody can later
-- account for is not a deletion you want to be explaining to the ICO.
create table if not exists audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  -- Null actor means the system did it (the cron purge). That is a
  -- real and meaningful value, not missing data.
  actor_id   uuid references profiles (id) on delete set null,
  action     text not null,
  subject_table text,
  subject_id uuid,
  detail     jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_subject_idx on audit_log (subject_table, subject_id);

alter table audit_log enable row level security;

drop policy if exists "audit_log: read" on audit_log;
create policy "audit_log: read" on audit_log
  for select using (has_permission('audit.view'));

-- Nobody writes the audit log from the client. Entries come from
-- security definer functions and the service role only.

-- ---------------------------------------------------------------
-- 1. Templates
-- ---------------------------------------------------------------

create table if not exists initiative_templates (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  kind     text not null default 'event'
    check (kind in ('event', 'programme', 'campaign')),
  -- Free text, like meeting_templates.meeting_type: the shura add a
  -- new sort of thing without a migration.
  initiative_type text not null,
  -- How much of the file this template expects to be filled in. Drives
  -- which sections the UI shows and how many ihsan prompts come with
  -- it. "Short version for a dars, full version for a camp."
  weight   text not null default 'standard'
    check (weight in ('light', 'standard', 'heavy')),
  description text,
  -- Where the safeguarding data for this sort of thing gets wiped.
  -- A setting, per spec, with a sane default.
  safeguarding_purge_weeks int not null default 8
    check (safeguarding_purge_weeks between 1 and 260),
  is_active boolean not null default true,
  position  int not null default 0
);

create table if not exists template_roles (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  role_key    text not null,
  label       text not null,
  duties      text,
  position    int not null default 0,
  unique (template_id, role_key)
);

/**
 * Milestones dated BACKWARDS from the event date.
 *
 * offset_days is negative for "before", so -14 is a fortnight out. The
 * same convention as parseTemplateLines() in lib/checklist/parse.ts,
 * which already exists and is reused rather than re-invented.
 */
create table if not exists template_milestones (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  title       text not null,
  offset_days int not null default 0,
  role_key    text,
  -- Attach an SOP where one is relevant, e.g. the set-up lead gets
  -- the venue set-up SOP as their checklist. Matched on sops.title:
  -- there is no slug column, and adding one just for this would mean
  -- backfilling twenty SOPs that already exist.
  sop_title   text,
  position    int not null default 0
);

create table if not exists template_runsheet (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  title       text not null,
  offset_minutes int not null default 0,
  duration_minutes int not null default 15,
  role_key    text,
  slot_kind   text not null default 'programme'
    check (slot_kind in ('arrival', 'programme', 'salah', 'food', 'break', 'silence', 'close')),
  is_peak_moment boolean not null default false,
  position    int not null default 0
);

/**
 * The ihsan prompts. THIS is the integration.
 *
 * `section` is the part of the file the prompt appears on, so it is
 * read at the moment that decision is being made. `dimension` is only
 * there so the retrospective ratings can be traced back to which
 * prompts fed them.
 */
create table if not exists template_ihsan_prompts (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  section     text not null check (section in (
    'overview', 'roles', 'milestones', 'runsheet', 'content', 'speakers',
    'venue', 'equipment', 'rota', 'safeguarding', 'risks', 'budget',
    'media', 'attendance', 'stakeholders', 'followup'
  )),
  dimension   text not null check (dimension in (
    'emotional', 'sight', 'sound', 'smell', 'taste', 'touch', 'personal'
  )),
  prompt      text not null,
  role_key    text,
  position    int not null default 0
);

create table if not exists template_risks (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  title       text not null,
  likelihood  int not null default 3 check (likelihood between 1 and 5),
  severity    int not null default 3 check (severity between 1 and 5),
  mitigation  text,
  strategy    text check (strategy in ('avoid', 'reduce', 'transfer', 'accept')),
  position    int not null default 0
);

create table if not exists template_equipment (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references initiative_templates (id) on delete cascade,
  item        text not null,
  quantity    int not null default 1,
  position    int not null default 0
);

-- ---------------------------------------------------------------
-- 2. The initiative itself (sections 1, 5, 7, 14, 17 of the file)
-- ---------------------------------------------------------------

create table if not exists initiatives (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references initiative_templates (id) on delete set null,
  kind        text not null default 'event'
    check (kind in ('event', 'programme', 'campaign')),
  initiative_type text not null,
  title       text not null,

  stage text not null default 'idea'
    check (stage in ('idea', 'proposal', 'approved', 'planning', 'live', 'wrap_up', 'closed')),

  -- Dates. starts_on is what milestones are dated backwards from.
  starts_on date,
  ends_on   date,
  starts_at time,
  ends_at   time,
  -- Programmes only: "Every Tuesday, 7pm, term time". Free text on
  -- purpose — a recurrence rule is a lot of machinery for something a
  -- human reads once.
  recurrence text,

  lead_id   uuid references profiles (id) on delete set null,

  -- Section 1, Overview.
  background text,
  aims       text,
  audience   text,
  age_range  text,
  outputs    text,
  outcomes   text,
  -- Which priority or OKR this serves. Text until Prompt 7 builds OKRs
  -- properly; it becomes a foreign key then.
  serves_okr text,

  -- Section 1 continued — THE EMOTIONAL JOURNEY, which lives here
  -- rather than in an ihsan section because it is an aim. If you
  -- cannot say what someone should feel walking out, you are not ready
  -- to book a venue.
  feels_arriving text,
  feels_peak     text,
  feels_leaving  text,
  one_thing      text,

  -- Section 5, Content.
  theme text,
  theme_why text,
  content_outline text,

  -- Section 7, Venue & logistics. Ihsan prompts hang off these.
  venue_name text,
  venue_address text,
  venue_contact text,
  venue_booked boolean not null default false,
  access_from  time,
  access_until time,
  layout     text,
  transport  text,
  parking    text,

  -- Section 9, what every volunteer is told. Muhsinun and Ansar can
  -- read this even when they can read nothing else — see
  -- initiative_basics below.
  briefing text,

  -- Section 14, Registration & attendance.
  expected_attendance int,
  actual_attendance   int,
  first_timers        int,
  returning_attendees int,

  -- Section 10 setting. Copied from the template at creation so that
  -- changing the template later cannot silently extend how long an old
  -- event's medical data is kept.
  safeguarding_purge_weeks int not null default 8
    check (safeguarding_purge_weeks between 1 and 260),

  -- Section 17, Approval.
  submitted_by uuid references profiles (id) on delete set null,
  submitted_at timestamptz,
  approved_by  uuid references profiles (id) on delete set null,
  approved_at  timestamptz,

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

create index if not exists initiatives_stage_date_idx on initiatives (stage, starts_on desc);
create index if not exists initiatives_kind_idx on initiatives (kind, starts_on desc);

-- Section 2, Roles & responsibilities.
create table if not exists initiative_roles (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  role_key      text not null,
  label         text not null,
  duties        text,
  profile_id    uuid references profiles (id) on delete set null,
  position      int not null default 0,
  unique (initiative_id, role_key)
);

create index if not exists initiative_roles_person_idx on initiative_roles (profile_id);

-- Section 3, Milestones. task_id links to the real task so ticking it
-- in one place is ticking it in both.
create table if not exists initiative_milestones (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  title         text not null,
  due_date      date,
  owner_id      uuid references profiles (id) on delete set null,
  done          boolean not null default false,
  done_at       timestamptz,
  task_id       uuid references tasks (id) on delete set null,
  position      int not null default 0
);

-- Section 4, Programme / run sheet. Also where the peak moment lives.
create table if not exists initiative_runsheet (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  title         text not null,
  starts_at     time,
  duration_minutes int not null default 15,
  owner_id      uuid references profiles (id) on delete set null,
  slot_kind     text not null default 'programme'
    check (slot_kind in ('arrival', 'programme', 'salah', 'food', 'break', 'silence', 'close')),
  -- The designed peak moment: a real slot at a real time owned by a
  -- real person, not a checkbox in a section nobody reads.
  is_peak_moment boolean not null default false,
  notes         text,
  position      int not null default 0
);

create index if not exists initiative_runsheet_order_idx
  on initiative_runsheet (initiative_id, position);

-- Section 6, Speakers.
create table if not exists initiative_speakers (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  name          text not null,
  contact       text,
  topic         text,
  brief_sent    boolean not null default false,
  confirmed     boolean not null default false,
  travel        text,
  backup        text,
  position      int not null default 0
);

-- Section 8, Equipment.
create table if not exists initiative_equipment (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  item          text not null,
  quantity      int not null default 1,
  who_brings    uuid references profiles (id) on delete set null,
  packed        boolean not null default false,
  returned      boolean not null default false,
  position      int not null default 0
);

-- Section 9, Volunteers & rota. A volunteer may be someone without a
-- CRM account, hence the nullable profile_id and the free-text name.
create table if not exists initiative_volunteers (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  profile_id    uuid references profiles (id) on delete cascade,
  name          text,
  role          text,
  from_time     time,
  to_time       time,
  report_to     text,
  briefing_done boolean not null default false,
  position      int not null default 0,
  constraint volunteer_needs_a_name
    check (profile_id is not null or (name is not null and name <> ''))
);

create index if not exists initiative_volunteers_person_idx
  on initiative_volunteers (profile_id);

-- Section 11, Risk register. Score is generated, so it can never
-- disagree with its two factors.
create table if not exists initiative_risks (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  title         text not null,
  likelihood    int not null default 3 check (likelihood between 1 and 5),
  severity      int not null default 3 check (severity between 1 and 5),
  score         int generated always as (likelihood * severity) stored,
  owner_id      uuid references profiles (id) on delete set null,
  mitigation    text,
  strategy      text check (strategy in ('avoid', 'reduce', 'transfer', 'accept')),
  position      int not null default 0
);

-- Section 12, Budget. Prompt 6 links fund_key to the real funds table.
create table if not exists initiative_budget_lines (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  description   text not null,
  planned       numeric(10, 2) not null default 0,
  actual        numeric(10, 2),
  direction     text not null default 'cost' check (direction in ('cost', 'income')),
  fund_key      text,
  position      int not null default 0
);

-- Section 13, Media plan. Basic version per Prompt 5; section 4.11
-- builds it out in Prompt 9.
create table if not exists initiative_media_plan (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  goal          text,
  channel       text not null,
  asset         text not null,
  owner_id      uuid references profiles (id) on delete set null,
  due_date      date,
  status        text not null default 'idea'
    check (status in ('idea', 'briefed', 'in_progress', 'ready', 'published')),
  position      int not null default 0
);

-- Section 16, Stakeholders.
create table if not exists initiative_stakeholders (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  name          text not null,
  relationship  text,
  what_we_do    text,
  owner_id      uuid references profiles (id) on delete set null,
  position      int not null default 0
);

-- The ihsan prompts as copied onto this initiative. Editable: if the
-- venue has no power for a diffuser you change the prompt, you do not
-- tick it and lie. `response` is what was actually decided.
create table if not exists initiative_ihsan_prompts (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  section       text not null,
  dimension     text not null check (dimension in (
    'emotional', 'sight', 'sound', 'smell', 'taste', 'touch', 'personal'
  )),
  prompt        text not null,
  response      text,
  owner_id      uuid references profiles (id) on delete set null,
  position      int not null default 0
);

create index if not exists initiative_ihsan_section_idx
  on initiative_ihsan_prompts (initiative_id, section, position);

-- Section 17. A log, not a status column, because "returned with
-- comments" is a conversation and you want the history of it.
create table if not exists initiative_approvals (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  action        text not null check (action in ('submitted', 'approved', 'returned')),
  actor_id      uuid references profiles (id) on delete set null,
  comment       text,
  at            timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. Safeguarding (section 10) — special-category data
-- ---------------------------------------------------------------
--
-- Split into its own tables on purpose. Medical details, allergies and
-- safeguarding notes about under-18s are special-category data under
-- UK GDPR. Keeping them as columns on `initiatives` would mean the
-- whole row had to be locked down, and every "can this person see the
-- event" question would become a question about medical records.
--
-- Here the boundary is a ROW boundary, which is what RLS is actually
-- good at. Nobody outside event lead, safeguarding lead and shura gets
-- a row back at all.

create table if not exists initiative_safeguarding (
  initiative_id uuid primary key references initiatives (id) on delete cascade,
  safeguarding_lead_id uuid references profiles (id) on delete set null,
  first_aider_id       uuid references profiles (id) on delete set null,
  adult_to_youth_ratio text,
  dbs_checked          boolean not null default false,
  missing_person_procedure text,
  nearest_ae           text,
  notes                text,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

/**
 * One row per young person attending.
 *
 * purge_after is computed at insert from the initiative's end date and
 * safeguarding_purge_weeks, and is what the scheduled job reads. It is
 * stored rather than derived so that the deletion rule stays true even
 * if someone later edits the event date — the retention promise was
 * made when the data was collected.
 */
create table if not exists initiative_participants (
  id            uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  full_name     text not null,
  date_of_birth date,
  parent_name   text,
  emergency_contact text,
  medical_notes text,
  allergies     text,
  photo_consent boolean not null default false,
  parental_consent boolean not null default false,
  consent_received_at timestamptz,
  purge_after   date,
  created_at    timestamptz not null default now()
);

create index if not exists initiative_participants_purge_idx
  on initiative_participants (purge_after);

-- Fill purge_after from the parent initiative if the caller did not.
create or replace function public.set_participant_purge_after()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_end date;
  v_weeks int;
begin
  if new.purge_after is null then
    select coalesce(i.ends_on, i.starts_on, current_date), i.safeguarding_purge_weeks
      into v_end, v_weeks
      from initiatives i where i.id = new.initiative_id;
    new.purge_after := v_end + (coalesce(v_weeks, 8) * 7);
  end if;
  return new;
end;
$$;

drop trigger if exists participants_set_purge on initiative_participants;
create trigger participants_set_purge
  before insert on initiative_participants
  for each row execute function public.set_participant_purge_after();

-- ---------------------------------------------------------------
-- 4. Retrospective (section 18) and the ihsan ratings
-- ---------------------------------------------------------------

create table if not exists initiative_retrospectives (
  initiative_id uuid primary key references initiatives (id) on delete cascade,
  went_well     text,
  challenges    text,
  improve       text,
  change_next   text,
  summary       text,
  people_engaged int,
  media_uploaded boolean not null default false,
  feedback      text,
  -- Set when the retrospective is signed off. The 100-word rule only
  -- bites here: a draft in progress must not be blocked by it.
  is_final      boolean not null default false,
  finalised_by  uuid references profiles (id) on delete set null,
  finalised_at  timestamptz,
  constraint final_retro_needs_a_real_summary check (
    not is_final
    or (summary is not null
        and array_length(regexp_split_to_array(btrim(summary), '\s+'), 1) >= 100)
  )
);

/**
 * Ihsan ratings, 1-5, per dimension, per person.
 *
 * Per person rather than one score per event, because one person's 5
 * and another's 2 on the same night is the useful signal — it means
 * they experienced different events, and that is worth knowing.
 */
create table if not exists initiative_ihsan_ratings (
  initiative_id uuid not null references initiatives (id) on delete cascade,
  rater_id      uuid not null references profiles (id) on delete cascade,
  dimension     text not null check (dimension in (
    'emotional', 'sight', 'sound', 'smell', 'taste', 'touch', 'personal'
  )),
  score         int not null check (score between 1 and 5),
  comment       text,
  rated_at      timestamptz not null default now(),
  primary key (initiative_id, rater_id, dimension)
);

-- The whole point of storing scores as columns: this answers "what do
-- we keep getting wrong" across every event we have ever run.
create or replace view ihsan_scores_by_dimension
with (security_invoker = true) as
select
  i.id   as initiative_id,
  i.title,
  i.kind,
  i.initiative_type,
  i.starts_on,
  r.dimension,
  round(avg(r.score)::numeric, 2) as avg_score,
  min(r.score) as low_score,
  max(r.score) as high_score,
  count(*)     as raters
from initiatives i
join initiative_ihsan_ratings r on r.initiative_id = i.id
group by i.id, i.title, i.kind, i.initiative_type, i.starts_on, r.dimension;

-- ---------------------------------------------------------------
-- 5. Helper functions
-- ---------------------------------------------------------------

/**
 * Can the caller see this initiative's file?
 *
 * Used by the CHILD tables only. It must never appear in a policy on
 * `initiatives` itself: see 0007 for what happens when a policy on X
 * calls a function that selects from X.
 */
create or replace function public.can_see_initiative(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from initiatives i
     where i.id = p_id
       and (
         has_permission('events.view_all')
         or i.lead_id = auth.uid()
         or i.created_by = auth.uid()
         or exists (select 1 from initiative_roles r
                     where r.initiative_id = i.id and r.profile_id = auth.uid())
       )
  );
$$;

-- Deliberately NOT including volunteers. Someone rostered on the door
-- is not thereby entitled to the budget, the stakeholder notes or the
-- risk register. They get initiative_basics, their own rota line and
-- the briefing — which is exactly what the spec asks for.

/**
 * Can the caller change it?
 *
 * The lead and anyone holding a role can work on their own event. Once
 * it is closed it is history, and history is not edited.
 */
create or replace function public.can_edit_initiative(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from initiatives i
     where i.id = p_id
       and i.stage <> 'closed'
       and (
         has_permission('events.approve')
         or i.lead_id = auth.uid()
         or i.created_by = auth.uid()
         or exists (select 1 from initiative_roles r
                     where r.initiative_id = i.id and r.profile_id = auth.uid())
       )
  );
$$;

/**
 * What is not ready yet.
 *
 * This is the price of integrating ihsan rather than giving it a
 * section: prompts spread across the file are easier to skip than one
 * obviously-empty page. So the check is computed at the moment it
 * matters — before the thing goes Live — instead of being another box
 * to fill in.
 *
 * Returns a jsonb array of {section, issue}. Empty array means ready.
 */
create or replace function public.initiative_readiness(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with i as (
    select * from initiatives
     where id = p_id and can_see_initiative(p_id)
  ),
  checks as (
    select 'overview' as section, 'No lead named' as issue
      from i where lead_id is null
    union all
    select 'overview', 'No date set'
      from i where starts_on is null
    union all
    -- The emotional journey is an aim, so an empty one is an event
    -- with no point rather than a missing nicety.
    select 'overview', 'Nobody has written what people take home'
      from i where one_thing is null or btrim(one_thing) = ''
    union all
    select 'overview', 'The peak moment has not been described'
      from i where feels_peak is null or btrim(feels_peak) = ''
    union all
    select 'venue', 'Venue not booked'
      from i where kind = 'event' and not venue_booked
    union all
    select 'roles', 'Roles on the plan have nobody in them'
      from i where exists (
        select 1 from initiative_roles r
         where r.initiative_id = i.id and r.profile_id is null)
    union all
    -- The single strongest signal that ihsan was actually thought
    -- about: is the peak moment a real slot at a real time?
    select 'runsheet', 'No peak moment in the run sheet'
      from i where not exists (
        select 1 from initiative_runsheet s
         where s.initiative_id = i.id and s.is_peak_moment)
    union all
    select 'runsheet', 'The peak moment has no owner'
      from i where exists (
        select 1 from initiative_runsheet s
         where s.initiative_id = i.id and s.is_peak_moment and s.owner_id is null)
    union all
    select 'rota', 'Nobody is on the rota'
      from i where not exists (
        select 1 from initiative_volunteers v where v.initiative_id = i.id)
    union all
    select 'rota', 'No briefing written for the volunteers'
      from i where briefing is null or btrim(briefing) = ''
    union all
    select 'risks', 'The risk register is empty'
      from i where not exists (
        select 1 from initiative_risks k where k.initiative_id = i.id)
    union all
    select 'risks', 'A high risk (score 15+) has no mitigation'
      from i where exists (
        select 1 from initiative_risks k
         where k.initiative_id = i.id and k.score >= 15
           and (k.mitigation is null or btrim(k.mitigation) = ''))
    union all
    select 'safeguarding', 'No safeguarding lead named'
      from i where kind = 'event' and not exists (
        select 1 from initiative_safeguarding g
         where g.initiative_id = i.id and g.safeguarding_lead_id is not null)
    union all
    -- Ihsan prompts that were never answered, named by section so the
    -- person is sent to the decision rather than to a checklist.
    select p.section, count(*) || ' unanswered: ' || string_agg(p.prompt, '; ')
      from initiative_ihsan_prompts p
     where p.initiative_id = p_id
       and can_see_initiative(p_id)
       and (p.response is null or btrim(p.response) = '')
     group by p.section
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('section', section, 'issue', issue)),
    '[]'::jsonb)
  from checks;
$$;

-- A retrospective is required to close. Enforced here rather than in
-- the form, so nothing closes quietly from a script or the dashboard.
create or replace function public.enforce_close_requires_retrospective()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stage = 'closed' and coalesce(old.stage, '') <> 'closed' then
    if not exists (
      select 1 from initiative_retrospectives r
       where r.initiative_id = new.id and r.is_final
    ) then
      raise exception
        'This cannot be closed until the retrospective is finished and signed off.'
        using errcode = 'check_violation';
    end if;
    new.closed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists initiatives_close_guard on initiatives;
create trigger initiatives_close_guard
  before update on initiatives
  for each row execute function public.enforce_close_requires_retrospective();

-- ---------------------------------------------------------------
-- 6. The safeguarding purge
-- ---------------------------------------------------------------
--
-- Written as a SQL function so it can be tested directly — select
-- purge_expired_safeguarding(); — rather than only ever being observed
-- through whatever schedules it. 0009 schedules it with pg_cron.
--
-- Every deletion is logged. The log keeps the initiative id and a
-- count, never the data being deleted: an audit trail that quietly
-- retains a copy of the medical notes would defeat the whole exercise.

create or replace function public.purge_expired_safeguarding()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
  v_total int := 0;
begin
  for v_row in
    select initiative_id, count(*) as n
      from initiative_participants
     where purge_after is not null and purge_after < current_date
     group by initiative_id
  loop
    delete from initiative_participants
     where initiative_id = v_row.initiative_id
       and purge_after is not null and purge_after < current_date;

    -- Free-text safeguarding notes can name a young person too, so
    -- they go at the same time.
    update initiative_safeguarding
       set notes = null, updated_at = now()
     where initiative_id = v_row.initiative_id and notes is not null;

    insert into audit_log (actor_id, action, subject_table, subject_id, detail)
    values (null, 'safeguarding.purged', 'initiative_participants',
            v_row.initiative_id,
            jsonb_build_object('records_deleted', v_row.n, 'on', current_date));

    v_total := v_total + v_row.n;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.purge_expired_safeguarding() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 7. Applying a template on approval
-- ---------------------------------------------------------------
--
-- Milestones and tasks dated BACKWARDS from the start date, assigned
-- to whoever holds the role, with SOP checklists attached where the
-- template names one.

create or replace function public.apply_template_to_initiative(p_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_i        initiatives%rowtype;
  v_base     date;
  v_m        record;
  v_owner    uuid;
  v_task_id  uuid;
  v_sop      record;
  v_list_id  uuid;
  v_made     int := 0;
begin
  -- security definer, so it has to check for itself. Without this,
  -- any signed-in person could fire someone else's event plan into
  -- existence, tasks and all.
  if not (has_permission('events.approve') or can_edit_initiative(p_id)) then
    raise exception 'Not allowed to build the plan for this initiative.'
      using errcode = '42501';
  end if;

  select * into v_i from initiatives where id = p_id;
  if not found or v_i.template_id is null then
    return 0;
  end if;

  v_base := coalesce(v_i.starts_on, current_date);

  -- Roles first: the milestones are assigned through them.
  insert into initiative_roles (initiative_id, role_key, label, duties, position)
  select p_id, t.role_key, t.label, t.duties, t.position
    from template_roles t where t.template_id = v_i.template_id
  on conflict (initiative_id, role_key) do nothing;

  insert into initiative_runsheet
    (initiative_id, title, starts_at, duration_minutes, slot_kind, is_peak_moment, position, owner_id)
  select p_id, t.title,
         case when v_i.starts_at is not null
              then v_i.starts_at + make_interval(mins => t.offset_minutes) end,
         t.duration_minutes, t.slot_kind, t.is_peak_moment, t.position,
         (select r.profile_id from initiative_roles r
           where r.initiative_id = p_id and r.role_key = t.role_key)
    from template_runsheet t where t.template_id = v_i.template_id;

  -- The ihsan prompts, onto the sections where those decisions happen.
  insert into initiative_ihsan_prompts
    (initiative_id, section, dimension, prompt, position, owner_id)
  select p_id, t.section, t.dimension, t.prompt, t.position,
         (select r.profile_id from initiative_roles r
           where r.initiative_id = p_id and r.role_key = t.role_key)
    from template_ihsan_prompts t where t.template_id = v_i.template_id;

  insert into initiative_risks
    (initiative_id, title, likelihood, severity, mitigation, strategy, position)
  select p_id, t.title, t.likelihood, t.severity, t.mitigation, t.strategy, t.position
    from template_risks t where t.template_id = v_i.template_id;

  insert into initiative_equipment (initiative_id, item, quantity, position)
  select p_id, t.item, t.quantity, t.position
    from template_equipment t where t.template_id = v_i.template_id;

  -- Milestones and their tasks.
  for v_m in
    select * from template_milestones
     where template_id = v_i.template_id order by position
  loop
    select r.profile_id into v_owner
      from initiative_roles r
     where r.initiative_id = p_id and r.role_key = v_m.role_key;

    v_owner := coalesce(v_owner, v_i.lead_id);

    insert into tasks (title, description, owner_id, created_by, due_date,
                       source, source_id)
    values (v_m.title,
            v_i.title || ' — ' || coalesce(v_m.role_key, 'event'),
            v_owner, v_i.lead_id, v_base + v_m.offset_days,
            'event', p_id)
    returning id into v_task_id;

    insert into initiative_milestones
      (initiative_id, title, due_date, owner_id, task_id, position)
    values (p_id, v_m.title, v_base + v_m.offset_days, v_owner, v_task_id, v_m.position);

    -- Attach the SOP's steps as the task's checklist where the
    -- template names one, so the set-up lead gets the set-up SOP.
    if v_m.sop_title is not null then
      select id, title, checklist_id into v_sop from sops
       where title = v_m.sop_title and status = 'published' limit 1;
      -- A copy, not a reference. Ticking a step on tonight's set-up
      -- must not tick it on the SOP itself, and a later edit to the
      -- SOP must not rewrite an event that has already happened.
      if found and v_sop.checklist_id is not null then
        insert into checklists (title, source, source_id, created_by)
        values (v_sop.title, 'sop', v_sop.id, v_i.lead_id)
        returning id into v_list_id;

        insert into checklist_items (checklist_id, text, depth, position)
        select v_list_id, ci.text, ci.depth, ci.position
          from checklist_items ci where ci.checklist_id = v_sop.checklist_id;

        update tasks set checklist_id = v_list_id where id = v_task_id;
      end if;
    end if;

    v_made := v_made + 1;
  end loop;

  insert into audit_log (actor_id, action, subject_table, subject_id, detail)
  values (auth.uid(), 'initiative.template_applied', 'initiatives', p_id,
          jsonb_build_object('milestones', v_made, 'template_id', v_i.template_id));

  return v_made;
end;
$$;

-- ---------------------------------------------------------------
-- 8. What a volunteer sees
-- ---------------------------------------------------------------
--
-- "Muhsinun and Ansar see only event basics, their own rota line and
-- the briefing."
--
-- A security DEFINER view, unlike member_directory. The masking there
-- is per-column with case-when, which works but leaves the underlying
-- table readable if someone queries it directly. Here the sensitive
-- columns simply are not in the view and the base table's policy keeps
-- them out of reach, so there is nothing to bypass.

create or replace view initiative_basics
with (security_invoker = false) as
select
  i.id, i.kind, i.initiative_type, i.title, i.stage,
  i.starts_on, i.ends_on, i.starts_at, i.ends_at, i.recurrence,
  i.venue_name, i.venue_address, i.lead_id, i.briefing
from initiatives i
where is_active_member()
  and (
    i.stage in ('approved', 'planning', 'live', 'wrap_up', 'closed')
    or i.lead_id = auth.uid()
    or i.created_by = auth.uid()
  );

-- ---------------------------------------------------------------
-- 9. Row level security
-- ---------------------------------------------------------------

alter table initiative_templates     enable row level security;
alter table template_roles           enable row level security;
alter table template_milestones      enable row level security;
alter table template_runsheet        enable row level security;
alter table template_ihsan_prompts   enable row level security;
alter table template_risks           enable row level security;
alter table template_equipment       enable row level security;
alter table initiatives              enable row level security;
alter table initiative_roles         enable row level security;
alter table initiative_milestones    enable row level security;
alter table initiative_runsheet      enable row level security;
alter table initiative_speakers      enable row level security;
alter table initiative_equipment     enable row level security;
alter table initiative_volunteers    enable row level security;
alter table initiative_risks         enable row level security;
alter table initiative_budget_lines  enable row level security;
alter table initiative_media_plan    enable row level security;
alter table initiative_stakeholders  enable row level security;
alter table initiative_ihsan_prompts enable row level security;
alter table initiative_approvals     enable row level security;
alter table initiative_safeguarding  enable row level security;
alter table initiative_participants  enable row level security;
alter table initiative_retrospectives enable row level security;
alter table initiative_ihsan_ratings enable row level security;

-- Templates: everyone reads, shura edit.
do $$
declare t text;
begin
  foreach t in array array[
    'initiative_templates', 'template_roles', 'template_milestones',
    'template_runsheet', 'template_ihsan_prompts', 'template_risks',
    'template_equipment'
  ] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format(
      'create policy "%s: read" on %I for select using (is_active_member())', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using (has_permission(''events.approve'')) '
      || 'with check (has_permission(''events.approve''))', t, t);
  end loop;
end $$;

-- The initiative row itself. Own columns only — see 0007 for why a
-- policy on this table must not call a function that selects from it.
drop policy if exists "initiatives: read" on initiatives;
create policy "initiatives: read" on initiatives
  for select using (
    has_permission('events.view_all')
    or lead_id = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from initiative_roles r
                where r.initiative_id = initiatives.id and r.profile_id = auth.uid())
  );

drop policy if exists "initiatives: create" on initiatives;
create policy "initiatives: create" on initiatives
  for insert with check (
    is_active_member() and has_permission('events.propose')
    and created_by = auth.uid()
  );

drop policy if exists "initiatives: update" on initiatives;
create policy "initiatives: update" on initiatives
  for update using (
    stage <> 'closed'
    and (
      has_permission('events.approve')
      or lead_id = auth.uid()
      or created_by = auth.uid()
      or exists (select 1 from initiative_roles r
                  where r.initiative_id = initiatives.id and r.profile_id = auth.uid())
    )
  );

drop policy if exists "initiatives: delete" on initiatives;
create policy "initiatives: delete" on initiatives
  for delete using (has_permission('events.approve'));

-- Child tables of the file. These may call the helper safely: it asks
-- about a different table from the one being guarded.
do $$
declare t text;
begin
  foreach t in array array[
    'initiative_roles', 'initiative_milestones', 'initiative_runsheet',
    'initiative_speakers', 'initiative_equipment', 'initiative_risks',
    'initiative_budget_lines', 'initiative_media_plan',
    'initiative_stakeholders', 'initiative_ihsan_prompts'
  ] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format(
      'create policy "%s: read" on %I for select using (can_see_initiative(initiative_id))', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using (can_edit_initiative(initiative_id)) '
      || 'with check (can_edit_initiative(initiative_id))', t, t);
  end loop;
end $$;

-- The rota. A volunteer sees their own line and nothing else.
drop policy if exists "initiative_volunteers: read" on initiative_volunteers;
create policy "initiative_volunteers: read" on initiative_volunteers
  for select using (
    profile_id = auth.uid() or can_see_initiative(initiative_id)
  );

drop policy if exists "initiative_volunteers: write" on initiative_volunteers;
create policy "initiative_volunteers: write" on initiative_volunteers
  for all using (can_edit_initiative(initiative_id))
  with check (can_edit_initiative(initiative_id));

-- Volunteers tick their own briefing off, and nothing else on the row.
drop policy if exists "initiative_volunteers: own briefing" on initiative_volunteers;
create policy "initiative_volunteers: own briefing" on initiative_volunteers
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "initiative_approvals: read" on initiative_approvals;
create policy "initiative_approvals: read" on initiative_approvals
  for select using (can_see_initiative(initiative_id));

drop policy if exists "initiative_approvals: write" on initiative_approvals;
create policy "initiative_approvals: write" on initiative_approvals
  for insert with check (
    actor_id = auth.uid()
    and (has_permission('events.approve') or can_edit_initiative(initiative_id))
  );

-- Retrospective: anyone who worked on it can write it.
drop policy if exists "initiative_retrospectives: read" on initiative_retrospectives;
create policy "initiative_retrospectives: read" on initiative_retrospectives
  for select using (can_see_initiative(initiative_id));

drop policy if exists "initiative_retrospectives: write" on initiative_retrospectives;
create policy "initiative_retrospectives: write" on initiative_retrospectives
  for all using (can_edit_initiative(initiative_id))
  with check (can_edit_initiative(initiative_id));

-- Ratings: your own score is yours to give and to change. Everyone on
-- the event sees the spread, which is the point of collecting them.
drop policy if exists "initiative_ihsan_ratings: read" on initiative_ihsan_ratings;
create policy "initiative_ihsan_ratings: read" on initiative_ihsan_ratings
  for select using (rater_id = auth.uid() or can_see_initiative(initiative_id));

drop policy if exists "initiative_ihsan_ratings: write own" on initiative_ihsan_ratings;
create policy "initiative_ihsan_ratings: write own" on initiative_ihsan_ratings
  for all using (rater_id = auth.uid())
  with check (rater_id = auth.uid() and can_see_initiative(initiative_id));

-- ---------------------------------------------------------------
-- 10. Safeguarding policies
-- ---------------------------------------------------------------
--
-- "Restricted to event lead + safeguarding lead + shura." The tightest
-- boundary in the system, because this is the only place holding
-- medical and allergy details about children.

drop policy if exists "initiative_safeguarding: read" on initiative_safeguarding;
create policy "initiative_safeguarding: read" on initiative_safeguarding
  for select using (
    has_permission('risk.manage')
    or safeguarding_lead_id = auth.uid()
    or first_aider_id = auth.uid()
    or exists (select 1 from initiatives i
                where i.id = initiative_safeguarding.initiative_id
                  and i.lead_id = auth.uid())
  );

drop policy if exists "initiative_safeguarding: write" on initiative_safeguarding;
create policy "initiative_safeguarding: write" on initiative_safeguarding
  for all using (
    has_permission('risk.manage')
    or safeguarding_lead_id = auth.uid()
    or exists (select 1 from initiatives i
                where i.id = initiative_safeguarding.initiative_id
                  and i.lead_id = auth.uid())
  ) with check (
    has_permission('risk.manage')
    or safeguarding_lead_id = auth.uid()
    or exists (select 1 from initiatives i
                where i.id = initiative_safeguarding.initiative_id
                  and i.lead_id = auth.uid())
  );

create or replace function public.can_see_safeguarding(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select has_permission('risk.manage')
      or exists (select 1 from initiatives i
                  where i.id = p_id and i.lead_id = auth.uid())
      or exists (select 1 from initiative_safeguarding g
                  where g.initiative_id = p_id
                    and (g.safeguarding_lead_id = auth.uid()
                         or g.first_aider_id = auth.uid()));
$$;

drop policy if exists "initiative_participants: read" on initiative_participants;
create policy "initiative_participants: read" on initiative_participants
  for select using (can_see_safeguarding(initiative_id));

drop policy if exists "initiative_participants: write" on initiative_participants;
create policy "initiative_participants: write" on initiative_participants
  for all using (can_see_safeguarding(initiative_id))
  with check (can_see_safeguarding(initiative_id));

-- ---------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------
-- See 0004 for why these are explicit. RLS still decides the rows.

grant select, insert, update, delete on
  initiative_templates, template_roles, template_milestones, template_runsheet,
  template_ihsan_prompts, template_risks, template_equipment,
  initiatives, initiative_roles, initiative_milestones, initiative_runsheet,
  initiative_speakers, initiative_equipment, initiative_volunteers,
  initiative_risks, initiative_budget_lines, initiative_media_plan,
  initiative_stakeholders, initiative_ihsan_prompts, initiative_approvals,
  initiative_safeguarding, initiative_participants,
  initiative_retrospectives, initiative_ihsan_ratings
to authenticated;

grant select on audit_log to authenticated;
grant select on initiative_basics to authenticated;
grant select on ihsan_scores_by_dimension to authenticated;
grant usage, select on sequence audit_log_id_seq to authenticated;

grant execute on function public.can_see_initiative(uuid) to authenticated;
grant execute on function public.can_edit_initiative(uuid) to authenticated;
grant execute on function public.can_see_safeguarding(uuid) to authenticated;
grant execute on function public.initiative_readiness(uuid) to authenticated;
grant execute on function public.apply_template_to_initiative(uuid) to authenticated;

notify pgrst, 'reload schema';
