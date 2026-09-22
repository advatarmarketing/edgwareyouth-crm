-- Edgware Youth CRM — Phase 0: identity only.
--
-- Deliberately minimal. This creates just enough for a person to log in
-- and for the app to know who they are. The real role model from
-- sections 2 and 3 of docs/SPEC.md — positions, teams, nicknames,
-- per-person permission overrides and the has_permission() helper —
-- is Prompt 1's job and lands in 0002.
--
-- Two columns are here rather than in 0002 because login and the nav
-- cannot function without them: `tier` (which decides what the nav
-- renders) and `is_active` (which decides whether the person gets in
-- at all).

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  full_name  text,
  avatar_url text,

  -- Null is a real, valid state: it means "Ansar only" — someone who
  -- carries the badge without sitting at any tier. See spec section 2.
  -- Do not add a NOT NULL here in a later migration without re-reading
  -- that section first.
  tier text check (tier in ('shura', 'sabiqun', 'muhsinun')),

  -- The Ansar badge sits on top of any tier, or stands alone. It is
  -- not a tier and must never be folded into the column above.
  is_ansar boolean not null default false,

  is_active boolean not null default true,

  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Everyone reads their own row. This is what role-based routing needs
-- immediately after login. Reading anyone else's profile is a
-- permission question, so it waits for has_permission() in 0002 rather
-- than being granted loosely here and tightened later.
create policy "profiles: read own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------
-- Auto-provisioning. Every new auth.users row gets a profile.
--
-- A new signup lands with tier NULL and is_active TRUE, which reads as
-- "Ansar only, active" — the least privileged state that is still a
-- real person. The shura set the actual tier at invite time via the
-- admin flow (service-role client), immediately after
-- auth.admin.inviteUserByEmail() creates the user.
-- ---------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
