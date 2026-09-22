-- Edgware Youth CRM — Prompt 6. Section 4.10 of docs/SPEC.md.
--
-- The CRM records money. It does not take payments, and it never
-- stores a bank or card number — there is no column for one, which is
-- the only storage rule that cannot be forgotten under pressure.
--
-- Two rules in this file are enforced by the DATABASE rather than by a
-- server action, because both are integrity rules about money held in
-- trust and both must survive a script, the Supabase dashboard, and
-- whatever the app looks like in three years:
--
--   1. Zakat cannot be moved into any other fund. Trigger, because the
--      rule spans two rows in `funds`.
--   2. Nobody approves their own expense claim. A CHECK constraint,
--      because both columns are on the same row — which makes it
--      stronger than a trigger: there is no path around it at all.

-- ---------------------------------------------------------------
-- 0. "That looks like a card number"
-- ---------------------------------------------------------------
--
-- Not security theatre: the realistic failure is somebody pasting a
-- sort code and account number into a description field so a treasurer
-- can pay them back. This refuses the write and says why.

create or replace function public.looks_like_an_account_number(p_text text)
returns boolean
language sql immutable
as $$
  -- 13 or more digits in a row, ignoring spaces and dashes. Long enough
  -- not to catch an invoice reference or a phone number.
  select p_text is not null
     and regexp_replace(p_text, '[\s-]', '', 'g') ~ '[0-9]{13,}';
$$;

-- ---------------------------------------------------------------
-- 1. Funds
-- ---------------------------------------------------------------

create table if not exists funds (
  id   uuid primary key default gen_random_uuid(),
  key  text not null unique,
  name text not null,
  -- 'zakat' is the one that matters. Everything below keys off it.
  kind text not null check (kind in ('general', 'zakat', 'sadaqah', 'waqf', 'event')),
  -- Event funds point at the thing they belong to.
  initiative_id uuid references initiatives (id) on delete set null,
  description text,
  is_active boolean not null default true,
  position  int not null default 0
);

insert into funds (key, name, kind, description, position) values
  ('general',  'General',          'general',  'Day to day running. Anything not restricted.', 1),
  ('zakat',    'Zakat',            'zakat',    'Held in trust for those entitled to it. Cannot be moved into any other fund.', 2),
  ('sadaqah',  'Sadaqah',          'sadaqah',  'Voluntary giving.', 3),
  ('waqf',     'Waqf / Baitul Maal','waqf',    'Endowment. Capital is preserved.', 4)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 2. Money in and out
-- ---------------------------------------------------------------

create table if not exists finance_transactions (
  id        uuid primary key default gen_random_uuid(),
  fund_id   uuid not null references funds (id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),
  -- Always positive. Direction carries the sign, so a report cannot
  -- accidentally add an outgoing to an incoming.
  amount    numeric(10, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  description text,

  source text not null default 'other' check (source in (
    'pledge', 'standing_order', 'business_donor', 'campaign',
    'collection', 'card_machine', 'event', 'grant', 'other'
  )),

  member_id     uuid references profiles (id) on delete set null,
  initiative_id uuid references initiatives (id) on delete set null,
  campaign_id   uuid,

  -- Spec 4.10: mosque collections are counted by two people, named.
  -- Two columns rather than a note, so "who counted it" survives.
  counted_by_1 uuid references profiles (id) on delete set null,
  counted_by_2 uuid references profiles (id) on delete set null,

  recorded_by uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint no_account_numbers_in_transactions
    check (not looks_like_an_account_number(description)),

  -- A collection counted by one person is not counted.
  constraint collections_need_two_counters check (
    source <> 'collection'
    or (counted_by_1 is not null and counted_by_2 is not null
        and counted_by_1 <> counted_by_2)
  )
);

create index if not exists finance_tx_fund_date_idx
  on finance_transactions (fund_id, occurred_on desc);
create index if not exists finance_tx_member_idx
  on finance_transactions (member_id, occurred_on desc);

-- ---------------------------------------------------------------
-- 3. THE ZAKAT RULE
-- ---------------------------------------------------------------

create table if not exists fund_transfers (
  id           uuid primary key default gen_random_uuid(),
  from_fund_id uuid not null references funds (id) on delete restrict,
  to_fund_id   uuid not null references funds (id) on delete restrict,
  amount       numeric(10, 2) not null check (amount > 0),
  reason       text,
  moved_by     uuid references profiles (id) on delete set null,
  at           timestamptz not null default now(),
  constraint no_transfer_to_itself check (from_fund_id <> to_fund_id)
);

/**
 * Zakat cannot leave the zakat fund by transfer.
 *
 * This is the rule the spec singles out, and it is here rather than in
 * a server action on purpose. Money held in trust should not depend on
 * everyone remembering to route their writes through the right
 * function — a migration script, a fix applied in the Supabase
 * dashboard at midnight, or next year's rewritten app would all bypass
 * app-layer logic without anybody noticing.
 *
 * Zakat -> zakat is allowed (splitting a pot). Anything else out of a
 * zakat fund is refused.
 */
create or replace function public.enforce_zakat_separation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_from text;
  v_to   text;
begin
  select kind into v_from from funds where id = new.from_fund_id;
  select kind into v_to   from funds where id = new.to_fund_id;

  if v_from = 'zakat' and v_to is distinct from 'zakat' then
    raise exception
      'Zakat cannot be moved into the % fund. It is held in trust for those entitled to it.', v_to
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists fund_transfers_zakat_guard on fund_transfers;
create trigger fund_transfers_zakat_guard
  before insert or update on fund_transfers
  for each row execute function public.enforce_zakat_separation();

/**
 * Closing the obvious way round the rule.
 *
 * Without this you could transfer zakat -> zakat, then edit the
 * destination fund's kind to 'general' and have moved the money in two
 * legal-looking steps. So a fund that has been used cannot change what
 * kind of fund it is; make a new one instead.
 */
create or replace function public.enforce_fund_kind_is_permanent()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.kind is distinct from old.kind then
    if exists (select 1 from finance_transactions t where t.fund_id = new.id)
       or exists (select 1 from fund_transfers f
                   where f.from_fund_id = new.id or f.to_fund_id = new.id) then
      raise exception
        'This fund has money recorded against it, so what kind of fund it is cannot be changed. Create a new fund instead.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists funds_kind_guard on funds;
create trigger funds_kind_guard
  before update on funds
  for each row execute function public.enforce_fund_kind_is_permanent();

-- ---------------------------------------------------------------
-- 4. Monthly member pledges
-- ---------------------------------------------------------------

create table if not exists pledges (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  fund_id    uuid not null references funds (id) on delete restrict,
  amount     numeric(10, 2) not null check (amount > 0),
  started_on date not null default current_date,
  ended_on   date,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists pledges_person_idx on pledges (profile_id);

/**
 * One row per month per pledge.
 *
 * `month` is always the first of the month — a date rather than a
 * text "2026-09", so ordering and gaps behave. A missed month is a ROW
 * saying missed, not an absent row: "we never recorded it" and "they
 * did not pay" are different facts and the difference matters when
 * somebody is asked about it a year later.
 */
create table if not exists pledge_payments (
  id         uuid primary key default gen_random_uuid(),
  pledge_id  uuid not null references pledges (id) on delete cascade,
  month      date not null,
  status     text not null default 'paid'
    check (status in ('paid', 'missed', 'partial', 'waived')),
  amount_paid numeric(10, 2) check (amount_paid >= 0),
  recorded_by uuid references profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (pledge_id, month),
  constraint month_is_the_first
    check (date_trunc('month', month)::date = month),
  constraint partial_needs_an_amount
    check (status <> 'partial' or amount_paid is not null)
);

-- ---------------------------------------------------------------
-- 5. Donor outreach
-- ---------------------------------------------------------------

create table if not exists donor_targets (
  profile_id uuid primary key references profiles (id) on delete cascade,
  target_count int not null default 0 check (target_count >= 0),
  set_by     uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

/**
 * A member's own list of people they are approaching.
 *
 * Private by default — these are personal relationships, and a list of
 * "people I might ask for money" being readable by the whole
 * organisation would stop anyone writing an honest one. Shura see all;
 * everyone with finance permissions sees the COUNTS through
 * donor_progress, not the names.
 */
create table if not exists donors (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id) on delete cascade,
  name        text not null,
  contact     text,
  approached_on date,
  pledged_amount numeric(10, 2) check (pledged_amount >= 0),
  received_amount numeric(10, 2) check (received_amount >= 0),
  next_follow_up date,
  notes       text,
  created_at  timestamptz not null default now(),
  constraint no_account_numbers_in_donor_notes
    check (not looks_like_an_account_number(notes))
);

create index if not exists donors_owner_idx on donors (owner_id);
create index if not exists donors_followup_idx on donors (next_follow_up)
  where next_follow_up is not null;

create table if not exists business_donors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  kind       text not null default 'one_off' check (kind in ('regular', 'one_off')),
  last_contacted_on date,
  owner_id   uuid references profiles (id) on delete set null,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  platform  text,
  fund_id   uuid not null references funds (id) on delete restrict,
  target    numeric(10, 2) check (target >= 0),
  -- Entered by hand. Nothing here talks to LaunchGood, and pretending
  -- otherwise would mean a number that silently goes stale.
  raised    numeric(10, 2) not null default 0 check (raised >= 0),
  raised_updated_at timestamptz,
  starts_on date,
  ends_on   date,
  status    text not null default 'planning'
    check (status in ('planning', 'live', 'finished')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 6. Expense claims
-- ---------------------------------------------------------------

create table if not exists expense_claims (
  id          uuid primary key default gen_random_uuid(),
  claimant_id uuid not null references profiles (id) on delete cascade,
  amount      numeric(10, 2) not null check (amount > 0),
  spent_on    date not null,
  description text not null,
  fund_id     uuid references funds (id) on delete set null,
  initiative_id uuid references initiatives (id) on delete set null,
  -- A path in Supabase Storage, not the image. Never a bank detail.
  receipt_path text,

  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'paid', 'rejected')),

  decided_by   uuid references profiles (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),

  -- THE RULE: nobody approves their own claim.
  --
  -- A CHECK rather than a trigger, because both columns are on the
  -- same row — which makes it the strongest form available. There is
  -- no ordering, no recursion and no way round it from a script, the
  -- dashboard, or a server action that forgot.
  constraint nobody_decides_their_own_claim
    check (decided_by is null or decided_by <> claimant_id),

  -- A decision has to have been made by somebody.
  constraint decided_claims_name_a_decider
    check (status in ('submitted') or decided_by is not null),

  -- Rejecting without a reason is how people stop submitting claims.
  constraint rejection_needs_a_reason
    check (status <> 'rejected' or (decision_note is not null and decision_note <> '')),

  constraint no_account_numbers_in_claims
    check (not looks_like_an_account_number(description))
);

create index if not exists expense_claims_status_idx on expense_claims (status, created_at desc);
create index if not exists expense_claims_claimant_idx on expense_claims (claimant_id);

-- ---------------------------------------------------------------
-- 7. Reports
-- ---------------------------------------------------------------

-- Balances, with transfers counted on both sides. security_invoker so
-- the underlying policies still decide who sees what.
create or replace view fund_balances
with (security_invoker = true) as
select
  f.id as fund_id, f.key, f.name, f.kind,
  coalesce(t.money_in, 0)  as money_in,
  coalesce(t.money_out, 0) as money_out,
  coalesce(x.moved_in, 0)  as moved_in,
  coalesce(x.moved_out, 0) as moved_out,
  coalesce(t.money_in, 0) - coalesce(t.money_out, 0)
    + coalesce(x.moved_in, 0) - coalesce(x.moved_out, 0) as balance
from funds f
left join (
  select fund_id,
         sum(amount) filter (where direction = 'in')  as money_in,
         sum(amount) filter (where direction = 'out') as money_out
    from finance_transactions group by fund_id
) t on t.fund_id = f.id
left join (
  select f2.id as fund_id,
         (select coalesce(sum(amount), 0) from fund_transfers where to_fund_id = f2.id)   as moved_in,
         (select coalesce(sum(amount), 0) from fund_transfers where from_fund_id = f2.id) as moved_out
    from funds f2
) x on x.fund_id = f.id;

create or replace view finance_monthly_by_fund
with (security_invoker = true) as
select
  date_trunc('month', t.occurred_on)::date as month,
  f.key as fund_key,
  f.name as fund_name,
  sum(t.amount) filter (where t.direction = 'in')  as money_in,
  sum(t.amount) filter (where t.direction = 'out') as money_out,
  coalesce(sum(t.amount) filter (where t.direction = 'in'), 0)
    - coalesce(sum(t.amount) filter (where t.direction = 'out'), 0) as net,
  count(*) as entries
from finance_transactions t
join funds f on f.id = t.fund_id
group by 1, 2, 3;

-- Pledges collected against pledges expected.
create or replace view pledge_progress
with (security_invoker = true) as
select
  p.id as pledge_id,
  p.profile_id,
  p.amount as monthly_amount,
  count(pp.id) filter (where pp.status = 'paid')    as months_paid,
  count(pp.id) filter (where pp.status = 'missed')  as months_missed,
  count(pp.id) filter (where pp.status = 'partial') as months_partial,
  coalesce(sum(
    case when pp.status = 'paid' then p.amount else coalesce(pp.amount_paid, 0) end
  ), 0) as collected,
  max(pp.month) as last_month_recorded
from pledges p
left join pledge_payments pp on pp.pledge_id = p.id
group by p.id, p.profile_id, p.amount;

/**
 * Outreach progress WITHOUT the names.
 *
 * Spec 4.10: finance-permitted members see everyone's progress, shura
 * see all. A donor list is a list of personal relationships; publishing
 * the names to everyone with a finance permission is how you guarantee
 * nobody writes an honest one. So the counts are shared and the list
 * is not.
 */
create or replace view donor_progress
with (security_invoker = false) as
select
  p.id as profile_id,
  p.full_name,
  coalesce(dt.target_count, 0) as target_count,
  count(d.id)                                        as approached,
  count(d.id) filter (where d.pledged_amount > 0)    as pledged,
  coalesce(sum(d.received_amount), 0)                as received,
  count(d.id) filter (where d.next_follow_up < current_date) as overdue_follow_ups
from profiles p
left join donor_targets dt on dt.profile_id = p.id
left join donors d on d.owner_id = p.id
where has_permission('finance.view_totals') or p.id = auth.uid()
group by p.id, p.full_name, dt.target_count;

-- ---------------------------------------------------------------
-- 8. Row level security
-- ---------------------------------------------------------------

alter table funds                enable row level security;
alter table finance_transactions enable row level security;
alter table fund_transfers       enable row level security;
alter table pledges              enable row level security;
alter table pledge_payments      enable row level security;
alter table donor_targets        enable row level security;
alter table donors               enable row level security;
alter table business_donors      enable row level security;
alter table campaigns            enable row level security;
alter table expense_claims       enable row level security;

drop policy if exists "funds: read" on funds;
create policy "funds: read" on funds
  for select using (is_active_member());

drop policy if exists "funds: write" on funds;
create policy "funds: write" on funds
  for all using (has_permission('finance.approve'))
  with check (has_permission('finance.approve'));

drop policy if exists "finance_transactions: read" on finance_transactions;
create policy "finance_transactions: read" on finance_transactions
  for select using (
    has_permission('finance.view_totals')
    -- Your own contributions are yours to see, with no finance
    -- permission at all.
    or member_id = auth.uid()
  );

drop policy if exists "finance_transactions: write" on finance_transactions;
create policy "finance_transactions: write" on finance_transactions
  for all using (has_permission('finance.log'))
  with check (has_permission('finance.log'));

drop policy if exists "fund_transfers: read" on fund_transfers;
create policy "fund_transfers: read" on fund_transfers
  for select using (has_permission('finance.view_totals'));

drop policy if exists "fund_transfers: write" on fund_transfers;
create policy "fund_transfers: write" on fund_transfers
  for all using (has_permission('finance.approve'))
  with check (has_permission('finance.approve'));

-- A member sees their own pledge and nobody else's. finance.view_totals
-- is NOT enough — seeing the totals is a different thing from seeing
-- what each person individually gives.
drop policy if exists "pledges: read" on pledges;
create policy "pledges: read" on pledges
  for select using (
    profile_id = auth.uid() or has_permission('finance.view_individual')
  );

drop policy if exists "pledges: write" on pledges;
create policy "pledges: write" on pledges
  for all using (has_permission('finance.log'))
  with check (has_permission('finance.log'));

create or replace function public.can_see_pledge(p_pledge_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from pledges p
     where p.id = p_pledge_id
       and (p.profile_id = auth.uid() or has_permission('finance.view_individual'))
  );
$$;

drop policy if exists "pledge_payments: read" on pledge_payments;
create policy "pledge_payments: read" on pledge_payments
  for select using (can_see_pledge(pledge_id));

drop policy if exists "pledge_payments: write" on pledge_payments;
create policy "pledge_payments: write" on pledge_payments
  for all using (has_permission('finance.log'))
  with check (has_permission('finance.log'));

drop policy if exists "donor_targets: read" on donor_targets;
create policy "donor_targets: read" on donor_targets
  for select using (
    profile_id = auth.uid() or has_permission('finance.view_totals')
  );

drop policy if exists "donor_targets: write" on donor_targets;
create policy "donor_targets: write" on donor_targets
  for all using (has_permission('finance.approve'))
  with check (has_permission('finance.approve'));

-- Your donor list is yours. Shura can see it because somebody has to
-- be able to answer for it; nobody else can, including people who can
-- see every total in the organisation.
drop policy if exists "donors: read" on donors;
create policy "donors: read" on donors
  for select using (
    owner_id = auth.uid() or has_permission('finance.view_individual')
  );

drop policy if exists "donors: write own" on donors;
create policy "donors: write own" on donors
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "business_donors: read" on business_donors;
create policy "business_donors: read" on business_donors
  for select using (has_permission('finance.view_totals'));

drop policy if exists "business_donors: write" on business_donors;
create policy "business_donors: write" on business_donors
  for all using (has_permission('finance.log'))
  with check (has_permission('finance.log'));

drop policy if exists "campaigns: read" on campaigns;
create policy "campaigns: read" on campaigns
  for select using (is_active_member());

drop policy if exists "campaigns: write" on campaigns;
create policy "campaigns: write" on campaigns
  for all using (has_permission('finance.log'))
  with check (has_permission('finance.log'));

-- ---------------------------------------------------------------
-- 9. Expense claims: the policies that mirror the CHECK
-- ---------------------------------------------------------------

drop policy if exists "expense_claims: read" on expense_claims;
create policy "expense_claims: read" on expense_claims
  for select using (
    claimant_id = auth.uid()
    or has_permission('finance.approve')
    or has_permission('finance.view_totals')
  );

drop policy if exists "expense_claims: submit own" on expense_claims;
create policy "expense_claims: submit own" on expense_claims
  for insert with check (
    claimant_id = auth.uid() and status = 'submitted' and decided_by is null
  );

/**
 * A claimant may fix their own claim, but only while it is still
 * waiting.
 *
 * The WITH CHECK is the important half. Without it, this policy would
 * let someone set their own claim to 'approved' and name a shura
 * member as the decider — the CHECK constraint only stops you naming
 * YOURSELF, so forging somebody else's approval would still pass. So a
 * claimant's own edit cannot change the status or set a decider at all.
 */
drop policy if exists "expense_claims: claimant edits while submitted" on expense_claims;
create policy "expense_claims: claimant edits while submitted" on expense_claims
  for update using (claimant_id = auth.uid() and status = 'submitted')
  with check (
    claimant_id = auth.uid() and status = 'submitted' and decided_by is null
  );

/**
 * And an approver must be recording their OWN decision.
 *
 * `decided_by = auth.uid()` in the WITH CHECK is what makes the audit
 * trail true: you cannot approve a claim in somebody else's name. The
 * table's CHECK constraint then refuses it if that somebody is the
 * claimant. Two rules, each covering what the other cannot.
 */
drop policy if exists "expense_claims: decide" on expense_claims;
create policy "expense_claims: decide" on expense_claims
  for update using (
    has_permission('finance.approve') and claimant_id <> auth.uid()
  )
  with check (
    has_permission('finance.approve')
    and claimant_id <> auth.uid()
    and decided_by = auth.uid()
  );

-- ---------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------

grant select, insert, update, delete on
  funds, finance_transactions, fund_transfers, pledges, pledge_payments,
  donor_targets, donors, business_donors, campaigns, expense_claims
to authenticated;

grant select on fund_balances, finance_monthly_by_fund, pledge_progress, donor_progress
to authenticated;

grant execute on function public.can_see_pledge(uuid) to authenticated;
grant execute on function public.looks_like_an_account_number(text) to authenticated;

notify pgrst, 'reload schema';
