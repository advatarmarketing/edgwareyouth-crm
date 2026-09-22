-- Edgware Youth CRM — Prompt 8. Section 4.13 of docs/SPEC.md.
--
-- The template's messaging was stripped in Prompt 0, so this is built
-- rather than upgraded — which is the better outcome, because the
-- thing the spec asks to fix was baked into its shape.
--
-- THE FIX: the template had ONE `read` flag per message. Whoever
-- opened a channel first marked the message read for everybody, so
-- "has the team seen the safeguarding notice?" could not be answered,
-- and worse, appeared to be answered. Read state is per person here
-- and always was — message_reads has a two-column primary key, so
-- there is no shared flag to regress to.

-- ---------------------------------------------------------------
-- 1. Channels
-- ---------------------------------------------------------------

create table if not exists channels (
  id   uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('announcement', 'team', 'event', 'dm')),
  name text,
  description text,
  -- Team channels point at a team, event channels at their event.
  team_key      text references teams (key) on delete cascade,
  initiative_id uuid references initiatives (id) on delete cascade,
  -- Archived, not deleted. An event's conversation is part of its
  -- record; closing it should stop it, not erase it.
  is_archived boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint team_channels_name_a_team
    check (kind <> 'team' or team_key is not null),
  constraint event_channels_name_an_event
    check (kind <> 'event' or initiative_id is not null),
  -- A direct message has no name; the people in it are the name.
  constraint dms_have_no_name
    check (kind <> 'dm' or name is null)
);

create unique index if not exists channels_one_per_team
  on channels (team_key) where kind = 'team';
create unique index if not exists channels_one_per_event
  on channels (initiative_id) where kind = 'event';

/**
 * Who is in a channel.
 *
 * The announcements channel is the exception and has no rows: every
 * active member is in it by definition, and 60 rows that have to be
 * kept in step with the members table is a bug waiting to happen.
 * can_see_channel() handles that case.
 */
create table if not exists channel_members (
  channel_id uuid not null references channels (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  is_owner   boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create index if not exists channel_members_person_idx on channel_members (profile_id);

-- ---------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels (id) on delete cascade,
  author_id  uuid references profiles (id) on delete set null,
  body       text not null,
  reply_to_id uuid references messages (id) on delete set null,
  /**
   * Announcement targeting.
   *
   * True means everyone in the channel. False means the tiers and
   * teams named in the two tables below — which is why it defaults to
   * true: a message that reaches nobody because its audience rows
   * failed to insert is a worse failure than one that reaches too many.
   */
  audience_all boolean not null default true,
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  -- Soft delete. A removed message leaves a gap people can see rather
  -- than silently rewriting a conversation somebody else remembers.
  deleted_at timestamptz
);

create index if not exists messages_channel_idx on messages (channel_id, created_at desc);

create table if not exists message_audience_tiers (
  message_id uuid not null references messages (id) on delete cascade,
  tier_key   text not null check (tier_key in ('shura', 'sabiqun', 'muhsinun', 'ansar')),
  primary key (message_id, tier_key)
);

create table if not exists message_audience_teams (
  message_id uuid not null references messages (id) on delete cascade,
  team_key   text not null references teams (key) on delete cascade,
  primary key (message_id, team_key)
);

/**
 * PER-PERSON read receipts. The whole point of this migration.
 *
 * A row means this person has seen this message. No row means they
 * have not — which is a real answer, not missing data, and is what
 * makes "who hasn't read the safeguarding notice?" answerable.
 */
create table if not exists message_reads (
  message_id uuid not null references messages (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists message_reads_person_idx on message_reads (profile_id);

/**
 * Mentions as rows, not as a regex re-run at read time.
 *
 * Resolved once when the message is posted, so "mentions of me" is a
 * query rather than a scan, and so a person later renamed does not
 * quietly lose the mentions that were about them.
 */
create table if not exists message_mentions (
  message_id uuid not null references messages (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (message_id, profile_id)
);

create table if not exists message_attachments (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages (id) on delete cascade,
  path       text not null,
  filename   text not null,
  mime_type  text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. Seed the one channel that always exists
-- ---------------------------------------------------------------

insert into channels (kind, name, description)
select 'announcement', 'Announcements', 'Everyone sees this. Posting is limited to those permitted.'
where not exists (select 1 from channels where kind = 'announcement');

-- A channel per team, created here rather than on demand so that a new
-- team's channel is never missing at the moment somebody needs it.
insert into channels (kind, name, team_key, description)
select 'team', t.name, t.key, 'Team channel'
  from teams t
 where not exists (select 1 from channels c where c.kind = 'team' and c.team_key = t.key);

-- ---------------------------------------------------------------
-- 4. Who can see and post
-- ---------------------------------------------------------------

/**
 * Used by the CHILD tables (messages, reads, mentions), never by a
 * policy on `channels` itself — 0007's rule.
 */
create or replace function public.can_see_channel(p_channel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from channels c
     where c.id = p_channel_id
       and (
         -- Announcements: everybody, with no membership rows to keep
         -- in step with the members table.
         (c.kind = 'announcement' and is_active_member())
         or exists (
           select 1 from channel_members m
            where m.channel_id = c.id and m.profile_id = auth.uid()
         )
       )
  );
$$;

create or replace function public.can_post_in_channel(p_channel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from channels c
     where c.id = p_channel_id
       and not c.is_archived
       and case
             -- Announcements are a broadcast, so posting is a
             -- permission rather than a membership.
             when c.kind = 'announcement' then has_permission('announcements.post')
             else exists (
               select 1 from channel_members m
                where m.channel_id = c.id and m.profile_id = auth.uid()
             )
           end
  );
$$;

-- ---------------------------------------------------------------
-- 5. Event channels: created on approval, archived on close
-- ---------------------------------------------------------------

/**
 * A trigger rather than something the approve action does.
 *
 * An event can reach 'planning' from a server action, a script or the
 * Supabase dashboard, and the channel should exist in all three cases.
 * Putting it next to the stage change means it cannot be forgotten by
 * whatever moves the stage next.
 */
create or replace function public.sync_initiative_channel()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_channel uuid;
begin
  if new.stage in ('approved', 'planning', 'live', 'wrap_up')
     and coalesce(old.stage, 'idea') in ('idea', 'proposal') then

    select id into v_channel from channels where initiative_id = new.id and kind = 'event';

    if v_channel is null then
      insert into channels (kind, name, initiative_id, description, created_by)
      values ('event', new.title, new.id, 'Everyone working on this event.', new.lead_id)
      returning id into v_channel;
    end if;

    -- The lead, plus anybody already holding a role.
    insert into channel_members (channel_id, profile_id, is_owner)
    select v_channel, new.lead_id, true
     where new.lead_id is not null
    on conflict do nothing;

    insert into channel_members (channel_id, profile_id)
    select v_channel, r.profile_id
      from initiative_roles r
     where r.initiative_id = new.id and r.profile_id is not null
    on conflict do nothing;
  end if;

  if new.stage = 'closed' and coalesce(old.stage, '') <> 'closed' then
    update channels set is_archived = true
     where initiative_id = new.id and kind = 'event';
  end if;

  return new;
end;
$$;

drop trigger if exists initiatives_channel_sync on initiatives;
create trigger initiatives_channel_sync
  after update on initiatives
  for each row execute function public.sync_initiative_channel();

-- Somebody given a role after approval joins the channel too.
create or replace function public.add_role_holder_to_channel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.profile_id is not null then
    insert into channel_members (channel_id, profile_id)
    select c.id, new.profile_id
      from channels c
     where c.initiative_id = new.initiative_id and c.kind = 'event'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists initiative_roles_channel_sync on initiative_roles;
create trigger initiative_roles_channel_sync
  after insert or update of profile_id on initiative_roles
  for each row execute function public.add_role_holder_to_channel();

-- Team membership keeps the team channel in step, both ways.
create or replace function public.sync_team_channel_membership()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from channel_members cm
     using channels c
     where c.id = cm.channel_id
       and c.kind = 'team' and c.team_key = old.team_key
       and cm.profile_id = old.profile_id;
    return old;
  end if;

  insert into channel_members (channel_id, profile_id)
  select c.id, new.profile_id from channels c
   where c.kind = 'team' and c.team_key = new.team_key
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists team_members_channel_sync on team_members;
create trigger team_members_channel_sync
  after insert or delete on team_members
  for each row execute function public.sync_team_channel_membership();

-- Backfill for teams that already had members before this migration.
insert into channel_members (channel_id, profile_id)
select c.id, tm.profile_id
  from channels c
  join team_members tm on tm.team_key = c.team_key
 where c.kind = 'team'
on conflict do nothing;

-- ---------------------------------------------------------------
-- 6. Unread
-- ---------------------------------------------------------------

/**
 * Unread counts per channel, for the badge.
 *
 * security_invoker, so the message policies do the filtering: a
 * targeted announcement nobody has aimed at you does not count towards
 * your badge, because you cannot see it in the first place.
 *
 * Your own messages never count. Nothing is more irritating than a
 * badge for something you wrote.
 */
create or replace view channel_unread
with (security_invoker = true) as
select
  m.channel_id,
  count(*) as unread,
  max(m.created_at) as latest_at
from messages m
left join message_reads r
  on r.message_id = m.id and r.profile_id = auth.uid()
where m.deleted_at is null
  and m.author_id is distinct from auth.uid()
  and r.message_id is null
group by m.channel_id;

/**
 * Who has and has not read an announcement.
 *
 * The question the shared `read` flag made unanswerable. A row per
 * active member per message, with read_at null for the ones who have
 * not — the absence is the answer, so it has to be a row.
 */
create or replace view announcement_read_status
with (security_invoker = true) as
select
  m.id as message_id,
  m.channel_id,
  p.id as profile_id,
  p.full_name,
  r.read_at
from messages m
cross join profiles p
left join message_reads r on r.message_id = m.id and r.profile_id = p.id
where p.is_active
  and m.deleted_at is null
  and exists (select 1 from channels c where c.id = m.channel_id and c.kind = 'announcement');

-- ---------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------

alter table channels              enable row level security;
alter table channel_members       enable row level security;
alter table messages              enable row level security;
alter table message_audience_tiers enable row level security;
alter table message_audience_teams enable row level security;
alter table message_reads         enable row level security;
alter table message_mentions      enable row level security;
alter table message_attachments   enable row level security;

-- Own columns only, plus other tables. 0007's rule: a policy on
-- `channels` must not call can_see_channel(), which selects from it.
drop policy if exists "channels: read" on channels;
create policy "channels: read" on channels
  for select using (
    (kind = 'announcement' and is_active_member())
    or exists (
      select 1 from channel_members m
       where m.channel_id = channels.id and m.profile_id = auth.uid()
    )
  );

-- Direct messages are the one kind anybody may start.
drop policy if exists "channels: create dm" on channels;
create policy "channels: create dm" on channels
  for insert with check (
    kind = 'dm' and is_active_member() and created_by = auth.uid()
  );

drop policy if exists "channels: manage" on channels;
create policy "channels: manage" on channels
  for all using (has_permission('announcements.post') or has_permission('members.manage'))
  with check (has_permission('announcements.post') or has_permission('members.manage'));

drop policy if exists "channel_members: read" on channel_members;
create policy "channel_members: read" on channel_members
  for select using (
    profile_id = auth.uid() or can_see_channel(channel_id)
  );

/**
 * You may add people to a direct message you are already in.
 *
 * Team and event membership is not editable here at all: it follows
 * from the team and the event, kept in step by the triggers above. A
 * channel you can add yourself to would make "who is in the finance
 * channel" a different question from "who is on the finance team".
 */
drop policy if exists "channel_members: manage dm" on channel_members;
create policy "channel_members: manage dm" on channel_members
  for insert with check (
    exists (
      select 1 from channels c
       where c.id = channel_members.channel_id
         and c.kind = 'dm'
         and (
           c.created_by = auth.uid()
           or exists (select 1 from channel_members mine
                       where mine.channel_id = c.id and mine.profile_id = auth.uid())
         )
    )
  );

/**
 * A message is visible if you can see the channel AND it is aimed at
 * you.
 *
 * The targeting half only bites on announcements, because everywhere
 * else audience_all is left true. Written as one policy rather than
 * two so that there is a single answer to "can this person read this
 * message" — two permissive policies OR'd together is how a targeted
 * message ends up visible to everyone by accident.
 */
drop policy if exists "messages: read" on messages;
create policy "messages: read" on messages
  for select using (
    author_id = auth.uid()
    or (
      can_see_channel(channel_id)
      and (
        audience_all
        or exists (
          select 1 from message_audience_tiers t
            join profiles p on p.id = auth.uid()
           where t.message_id = messages.id
             and (t.tier_key = p.tier or (p.is_ansar and t.tier_key = 'ansar'))
        )
        or exists (
          select 1 from message_audience_teams t
            join team_members tm on tm.team_key = t.team_key
           where t.message_id = messages.id and tm.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "messages: post" on messages;
create policy "messages: post" on messages
  for insert with check (
    author_id = auth.uid() and can_post_in_channel(channel_id)
  );

-- Your own words are yours to correct. Editing somebody else's is not
-- a thing anyone can do, including the shura.
drop policy if exists "messages: edit own" on messages;
create policy "messages: edit own" on messages
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['message_audience_tiers', 'message_audience_teams'] loop
    execute format('drop policy if exists "%s: read" on %I', t, t);
    execute format(
      'create policy "%s: read" on %I for select using ('
      || 'exists (select 1 from messages m where m.id = message_id and can_see_channel(m.channel_id)))', t, t);
    execute format('drop policy if exists "%s: write" on %I', t, t);
    execute format(
      'create policy "%s: write" on %I for all using ('
      || 'exists (select 1 from messages m where m.id = message_id and m.author_id = auth.uid())) '
      || 'with check (exists (select 1 from messages m where m.id = message_id and m.author_id = auth.uid()))', t, t);
  end loop;
end $$;

/**
 * Read receipts.
 *
 * You write your own and nobody else's — otherwise "everyone has read
 * the safeguarding notice" could be produced by the person who most
 * wanted it to be true.
 *
 * The author of a message can READ them all, which is what the spec
 * asks for: senders of announcements see who has and has not read.
 */
drop policy if exists "message_reads: read" on message_reads;
create policy "message_reads: read" on message_reads
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from messages m
       where m.id = message_reads.message_id and m.author_id = auth.uid()
    )
  );

drop policy if exists "message_reads: mark own" on message_reads;
create policy "message_reads: mark own" on message_reads
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from messages m
       where m.id = message_reads.message_id and can_see_channel(m.channel_id)
    )
  );

drop policy if exists "message_mentions: read" on message_mentions;
create policy "message_mentions: read" on message_mentions
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from messages m
       where m.id = message_mentions.message_id and can_see_channel(m.channel_id)
    )
  );

drop policy if exists "message_mentions: write" on message_mentions;
create policy "message_mentions: write" on message_mentions
  for insert with check (
    exists (
      select 1 from messages m
       where m.id = message_mentions.message_id and m.author_id = auth.uid()
    )
  );

drop policy if exists "message_attachments: read" on message_attachments;
create policy "message_attachments: read" on message_attachments
  for select using (
    exists (
      select 1 from messages m
       where m.id = message_attachments.message_id and can_see_channel(m.channel_id)
    )
  );

drop policy if exists "message_attachments: write" on message_attachments;
create policy "message_attachments: write" on message_attachments
  for insert with check (
    exists (
      select 1 from messages m
       where m.id = message_attachments.message_id and m.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------

grant select, insert, update, delete on
  channels, channel_members, messages, message_audience_tiers,
  message_audience_teams, message_reads, message_mentions, message_attachments
to authenticated;

grant select on channel_unread, announcement_read_status to authenticated;

grant execute on function public.can_see_channel(uuid) to authenticated;
grant execute on function public.can_post_in_channel(uuid) to authenticated;

notify pgrst, 'reload schema';
