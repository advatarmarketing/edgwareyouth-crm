-- Edgware Youth CRM — fix-up after 0014.
--
-- Symptom: every read of `messages` failed with
--   42P17: infinite recursion detected in policy for relation "messages"
-- which took the unread badge, the announcement read-status view and
-- three verify-rls checks down with it.
--
-- Cause: a MUTUAL reference between two tables' policies.
--
--   messages: read            -> selects message_audience_tiers/_teams
--   message_audience_*: read  -> selects messages
--
-- Each subquery inside a policy is itself filtered by the other
-- table's policy, so the two call each other forever. Postgres detects
-- it and refuses the whole query.
--
-- This is the same family as 0007, one step out. There the rule was
-- "never write a policy on table X that calls a function which selects
-- from X". The fuller rule, which this adds:
--
--   POLICIES MUST NOT FORM A CYCLE. If A's policy reads B and B's
--   policy reads A, it does not matter that neither reads itself.
--
-- Fix: break the cycle with security definer helpers. A definer
-- function runs as its owner, so the tables it touches are read
-- WITHOUT their policies, and the loop has nowhere to go. The
-- functions are deliberately narrow — each answers one question and
-- none of them selects from the table whose policy calls it.

-- ---------------------------------------------------------------
-- 1. The helpers
-- ---------------------------------------------------------------

-- Selects from `messages`, so it may only be used by policies on OTHER
-- tables. Never in a policy on messages itself.
create or replace function public.message_channel_id(p_message_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select channel_id from messages where id = p_message_id;
$$;

create or replace function public.message_author_id(p_message_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select author_id from messages where id = p_message_id;
$$;

/**
 * Is this announcement aimed at the caller?
 *
 * Reads ONLY the two audience tables, which is what makes it safe to
 * call from the policy on `messages`. It must never learn to look at
 * `messages` itself or the recursion comes straight back.
 */
create or replace function public.message_is_aimed_at_me(p_message_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from message_audience_tiers t
      join profiles p on p.id = auth.uid()
     where t.message_id = p_message_id
       and (t.tier_key = p.tier or (p.is_ansar and t.tier_key = 'ansar'))
  )
  or exists (
    select 1
      from message_audience_teams t
      join team_members tm on tm.team_key = t.team_key
     where t.message_id = p_message_id
       and tm.profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------
-- 2. The policies, rewritten with no cycle
-- ---------------------------------------------------------------

drop policy if exists "messages: read" on messages;
create policy "messages: read" on messages
  for select using (
    author_id = auth.uid()
    or (
      can_see_channel(channel_id)
      and (audience_all or message_is_aimed_at_me(id))
    )
  );

-- These now reach `messages` through a definer helper rather than a
-- subquery, which is the half of the cycle being cut.
drop policy if exists "message_audience_tiers: read" on message_audience_tiers;
create policy "message_audience_tiers: read" on message_audience_tiers
  for select using (can_see_channel(message_channel_id(message_id)));

drop policy if exists "message_audience_tiers: write" on message_audience_tiers;
create policy "message_audience_tiers: write" on message_audience_tiers
  for all using (message_author_id(message_id) = auth.uid())
  with check (message_author_id(message_id) = auth.uid());

drop policy if exists "message_audience_teams: read" on message_audience_teams;
create policy "message_audience_teams: read" on message_audience_teams
  for select using (can_see_channel(message_channel_id(message_id)));

drop policy if exists "message_audience_teams: write" on message_audience_teams;
create policy "message_audience_teams: write" on message_audience_teams
  for all using (message_author_id(message_id) = auth.uid())
  with check (message_author_id(message_id) = auth.uid());

-- The read, mention and attachment policies all selected from
-- `messages` too. None of them caused the cycle on their own, but each
-- one made an ordinary read of message_reads pay for a full evaluation
-- of the messages policy. Same treatment.
drop policy if exists "message_reads: read" on message_reads;
create policy "message_reads: read" on message_reads
  for select using (
    profile_id = auth.uid()
    or message_author_id(message_id) = auth.uid()
  );

drop policy if exists "message_reads: mark own" on message_reads;
create policy "message_reads: mark own" on message_reads
  for insert with check (
    profile_id = auth.uid()
    and can_see_channel(message_channel_id(message_id))
  );

drop policy if exists "message_mentions: read" on message_mentions;
create policy "message_mentions: read" on message_mentions
  for select using (
    profile_id = auth.uid()
    or can_see_channel(message_channel_id(message_id))
  );

drop policy if exists "message_mentions: write" on message_mentions;
create policy "message_mentions: write" on message_mentions
  for insert with check (message_author_id(message_id) = auth.uid());

drop policy if exists "message_attachments: read" on message_attachments;
create policy "message_attachments: read" on message_attachments
  for select using (can_see_channel(message_channel_id(message_id)));

drop policy if exists "message_attachments: write" on message_attachments;
create policy "message_attachments: write" on message_attachments
  for insert with check (message_author_id(message_id) = auth.uid());

-- ---------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------

grant execute on function public.message_channel_id(uuid) to authenticated;
grant execute on function public.message_author_id(uuid) to authenticated;
grant execute on function public.message_is_aimed_at_me(uuid) to authenticated;

notify pgrst, 'reload schema';
