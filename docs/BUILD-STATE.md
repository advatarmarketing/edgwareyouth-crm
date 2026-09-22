# Build state — read this first

Last updated at the end of **Prompt 4b**.

## What this is

The Edgware Youth CRM, built from the Advatar CRM as a template, following
`docs/SPEC.md`. That spec is the source of truth. Work through its Part C
prompts one at a time, in order.

**Next action: run migrations 0008 through 0013 in the Supabase SQL editor**,
then `npm run verify:rls`. After that, Prompt 8 (Messaging).

Prompts 0 through 7 are built. Migrations 0001-0007 are applied and verified;
0008-0013 are written and parse-checked but NOT yet applied. `npm run verify:rls`
is the thing to run after any migration — it tests the whole access matrix and
says plainly if a policy is wrong.

## Where things are

| Thing | Where |
|---|---|
| This project | `~/Documents/EdgwareYouth/crm` |
| GitHub | `advatarmarketing/edgwareyouth-crm` |
| The spec | `docs/SPEC.md` (v2.1, corrected) |
| Brand source files | `~/Documents/EdgwareYouth/website/assets/` and that folder's root |
| The template it came from | `github.com/advatarmarketing/crm`, the `advatar-crm/` subfolder |

## Done in Prompt 0

- Copied from the template's `advatar-crm/` subfolder (**not** the repo root —
  that repo contains the app twice and the root copy is stale).
- Removed: clients, client portal, videographers, the 90-day planner, invoices,
  client finance, prospects, leads, the video review/uploads workflow, client
  avatars, the Fathom webhook, and every route and component belonging to them.
- Fresh `supabase/migrations/`, starting at `0001_profiles.sql`. None of the
  Advatar schema was carried over.
- Kept and rewritten: the Supabase client/server/admin helpers, the auth
  middleware, the theme system, the nav shell, `lib/names.ts`, `lib/email.ts`,
  `lib/format.ts`, and the seed / verify-rls script pattern.
- **Extracted `lib/checklist/parse.ts`** — the two pieces of real checklist
  logic that existed in the template, now pure functions with no database
  coupling. See `docs/SPEC.md` section 4.1 for what was and wasn't there.
- Branded: Edgware Youth logos and icons, `#2f5283` accent tokens, manifest,
  metadata. Bebas Neue / DM Sans were already in the template.
- `tsc --noEmit` clean, `next build` passing.

## Done in Prompt 1

Sections 2, 3, 4.3 and 4.17 of the spec. All of it in
`supabase/migrations/0002_roles_teams_permissions.sql`.

- **Four axes, not a role enum**: nullable `tier`, an `is_ansar` badge on top,
  an optional `position`, and many-to-many `teams`. A null tier means "Ansar
  only" and is handled as a real state everywhere, including in the seed and
  the tests.
- **Permissions are named keys** in a `permissions` catalogue, with tier
  defaults in `tier_permissions` and per-person overrides in
  `profile_permissions`. The override carries a `granted` boolean rather than
  meaning "allow" by its presence — the shura need to take a permission *away*
  from someone whose tier grants it, and a presence-means-yes table cannot say
  that.
- **`has_permission(key)`** is the only question the rest of the schema asks.
  Security definer, so policies can consult profiles without recursing.
  Override wins; otherwise tier defaults unioned with the `ansar` row. An
  inactive member has no permissions at all, whatever their tier says.
- **`my_permissions()`** returns the caller's whole set in one round trip, so
  the nav doesn't make thirty calls per page load. Same rules, one definition.
- **`member_directory` view** masks contact and safeguarding columns per
  viewer. Section 3 gives sabiqun "names, teams, contact" and lower tiers
  "names only" — a column-level rule that RLS cannot express and that Postgres
  column grants cannot vary by tier. The app reads the directory through this
  view, never from `profiles` directly.
- **Private notes are their own table**, not a column on profiles — one
  careless `select *` away from being shown to the person they are about.
- Screens: members directory with filters, member detail with edit, the
  permissions screen, and invite-by-email with tier set at invite.
- Nav is now permission-driven, so an override changes what one person sees.
- `verify-rls` tests the matrix: tier defaults, both awkward shapes
  ("Ansar only", "Sabiqun + Ansar"), column masking, notes isolation, grant
  *and* revoke overrides, and that deactivating somebody actually stops them.

### Teams

Media, Finance and Events ship active. Dawah/Outreach and Tarbiyah exist with
`is_active = false` and are hidden everywhere until the shura switch them on —
a single update, not a migration (Part B decision 5).

## Done in Prompt 2

Sections 4.1, 4.4, 4.7 and 4.16, in
`supabase/migrations/0003_checklists_tasks_notifications.sql`.

- **The checklist engine is real now.** `lib/checklist/parse.ts` (pure, no
  database) plus `lib/checklist/index.ts` for storing and cloning. SOPs,
  meetings and events all call these rather than growing their own splitter.
  `cloneChecklist` exists ready for "Run this SOP" in Prompt 3.
- **Tasks**: owner, due date, priority, status, checklist, comments, source.
  "Blocked needs a reason" is a database CHECK constraint, not a form rule, so
  a task cannot be parked silently from a script either.
- **Calendar**: month grid, Monday-first. Only the task-deadlines layer has
  data; the other five are listed and disabled with a note saying which prompt
  fills them. Islamic dates and school holidays are deliberately not faked with
  a hardcoded table — a wrong date on a calendar people plan around is worse
  than no date.
- **Notifications**: bell with a live unread count over Supabase realtime,
  per-person email on/off per type, and `/api/cron/reminders` for the
  two-days-before and overdue sweep. That route is guarded by `CRON_SECRET`
  and returns 401 without it — it writes notification rows, so unguarded it
  would be spammable by anyone who guessed the path.
- `vercel.json` schedules the sweep at 07:00 daily.

Email is **not** sent yet. `notify()` writes the row; a sender still needs
wiring (Resend is the obvious pick with Vercel). The bell works regardless.

## Verified, not just built

`npm run verify:rls` — 62 checks, all passing. `npm test` — 36 tests. Tier defaults; both awkward
shapes ("Ansar only", "Sabiqun + Ansar"); the directory's column masking;
notes isolation; overrides that grant *and* revoke; deactivation; task
visibility; the blocked-needs-a-reason constraint; notification privacy; and
SOP visibility by tier, by team and by named person, including that drafts
stay invisible and that cash-handling does not reach anyone outside finance.

Smoke-tested in a browser: signed in as `shura@test.local` and
`muhsin@test.local`. The nav, the invite button and the inactive filter all
change with the permission set, and the directory renders every tier shape
correctly.

**Two lessons from that first run, both now baked into the suite:**

1. One failure was the *test*, not the policy — it asserted an inactive member
   sees zero rows, when they correctly still see their own. Check the
   behaviour before changing the schema.
2. Three "cannot do X" checks passed while proving nothing: PostgREST's schema
   cache was stale, every insert failed with "could not find the table", and
   the negative assertions went green on the wrong error. Negative checks now
   require a policy refusal (42501) or the CHECK constraint (23514);
   `PGRST205` can never read as a pass. A security test that passes for the
   wrong reason is worse than no test.

## Done in Prompt 3

Section 4.5, in `supabase/migrations/0005_sops.sql`.

- The SOP's own checklist is the **master** and is not tickable in the UI.
  "Run this SOP" clones it onto a task — which is what `cloneChecklist` was
  built for in Prompt 2.
- Visibility is three tables (tiers, teams, named people) resolved by
  `can_see_sop()`. `visible_to_all` is an explicit column, **not** "no rows
  means everyone" — an absent rule must not default to broadcasting a
  safeguarding or cash-handling SOP to the whole organisation.
- Read receipts store the version read, so an edit bumps the version and
  every tick becomes "updated — re-read" with nothing to clear by hand. The
  old text goes to `sop_versions` before being overwritten.
- All 20 starter SOPs seeded as drafts with real first-draft content
  (`npm run seed:sops`). Re-running never overwrites a published one.

**The safeguarding, missing-person and photo-consent SOPs need a real review
by whoever holds that responsibility, and a check against the insurer's and
the local authority's requirements.** They are a sensible starting point
written from the spec, not policy. That is why they are drafts.

## Done in Prompt 4a

`lib/meetings/parse-notes.ts` and `lib/meetings/dates.ts`. Pure functions, no
Supabase import, no AI, no external API. `npm test` — 36 tests.

- `ACTION @Name: what by <date>`, indented lines as steps, `DECISION:` lines,
  and `[ ]` / `[x]` Notion to-dos that name somebody.
- Names match nickname, first name, surname or full name.
- Dates: `12/10` (day-first, always), `12/10/26`, `12 Oct`, `12th October`,
  `October 12th`, `tomorrow`, `today`, `Friday`, `next Friday`.
- **Relative dates resolve against the MEETING date**, which is a required
  argument and is never defaulted to `new Date()` — a default is precisely
  how that bug gets reintroduced. Notes pasted three days late still produce
  the dates the room agreed. There is a test that passes a meeting date in
  2001 to prove it.
- Nothing is guessed and nothing is silently dropped. Two people called Yusuf
  produce an unmatched line listing both, never a coin flip. Steps under a
  failed action travel with it to the review screen.
- Prose is ignored without complaint — flagging every sentence would bury the
  lines that need attention.

**Known ambiguity, handled deliberately:** "next Friday" and bare "Friday"
both resolve to the next occurrence after the meeting. British usage is split
on whether "next Friday" means the following week. Rather than guess, 4b's
review screen must show the resolved **calendar date** rather than echoing
the phrase, so a minute-taker who meant the other one can see it and change
it before publishing.

## Done in Prompt 4b

Section 4.6, in `supabase/migrations/0006_meetings.sql`. Driven end to end in
a browser: created a shura meeting, pasted deliberately messy notes, worked
the review screen, published, and confirmed the tasks landed.

- Draft actions live in `meeting_actions` and only become `tasks` at publish.
  `task_id` is set then, which also stops a second press duplicating lists.
- Unresolved lines are **rows, not React state** — the review screen is not
  always finished in one sitting.
- Publish refuses while any action lacks an owner or due date, or any
  unresolved line remains. Checked in the server action, not just the form.
- Matters arising goes at the **top** of the agenda, not the end where it
  gets skipped for time.
- The review screen shows resolved calendar dates in a date input, never the
  phrase — the mitigation for 4a's "next Friday" ambiguity.
- Meeting packs are one notification per person, not one per action.
- `can_see_meeting()` gives the chair and minute-taker access regardless of
  visibility, so a non-shura minute-taker can write up a shura meeting.
- Plus the in-app notes guide, the searchable decision log, and the
  accountability view (counted from tasks, not minutes).

## The bug the end-to-end run caught

`insert ... returning` evaluates the SELECT policy too. The policies on
`meetings` and `sops` called `can_see_meeting(id)` / `can_see_sop(id)`, which
answer by **re-querying the same table** — and a row inserted by the current
command is invisible to a separate query inside that command. So creating a
meeting failed with an error naming the *insert*, sending the debugging the
wrong way. Fixed in 0007 by testing the row's own columns.

**Never write a policy on table X that calls a function which selects from X.**

The RLS suite had thorough coverage of who may READ what and still missed
this, because it only ever inserted with the service role — testing reads as
users and writes as god. The regression test now inserts as a real signed-in
user and reads the id back, for both tables.

## Three fixes made that were not in the spec

1. **`next` 14.2.15 → 14.2.35.** The pinned version has a published security
   vulnerability.
2. **`@supabase/ssr` 0.5.2 → 0.12.7.** 0.5.x imports a type path that
   `supabase-js` 2.116 no longer ships, which silently collapses every table
   type to `never`. **This affects the Advatar CRM too** — a fresh
   `npm install` there today hits the same wall.
3. **`lib/supabase/types.ts` uses `type`, not `interface`.** supabase-js
   requires every Row to satisfy `Record<string, unknown>`; an interface has no
   implicit index signature, fails that, and every table resolves to `never`.
   The error surfaces at the call site as "property does not exist on type
   never" and points nowhere near the cause. There is a comment on the type
   saying so. Don't convert it back.

## Deliberately deferred, with where it belongs

These were in the template and were removed rather than carried as broken code.
Pull them back from `github.com/advatarmarketing/crm` when you reach the phase
that needs them — the pattern is worth reusing, the schema underneath is not.

| Removed | Restore during |
|---|---|
| `ChatShell`, `components/messaging/*`, `TeamChannel`, `TeamDirectMessages` | Prompt 8 (messaging) |
| `NavBadge`, `MessagesNavBadge` | Prompt 8 (messaging) — the bell was rebuilt in Prompt 2 |
| ~~`TaskList`, `TodoPanel`~~ | done — rebuilt in Prompt 2 |
| ~~`MonthCalendar`, `UpcomingStrip`~~ | done — calendar rebuilt in Prompt 2 |
| `ResourceChecklistEditor` (parsing already saved in `lib/checklist/`) | Prompt 3 (SOPs) |
| `ResourcesPanel`, `DocumentsList`, `DocumentUpload` | Prompt 9 (resources) |
| `AvatarUpload`, `ProfilePanel`, `lib/profile-fields.ts` | not yet restored — member photos still to do |
| `settings/templates` + `task_templates` tables (parser saved in `lib/checklist/`) | Prompt 5 (event templates) |
| `AvailabilityPanel`, `lib/availability.ts` | not yet restored — availability is a plain text field for now |
| `ActivityTimeline`, `lib/activity.ts` | Prompt 10 (audit log) |

## Known gaps

- **No Supabase project is connected yet.** Nothing has been run against a real
  database. `docs/SETUP.md` is the walkthrough.
- `lib/supabase/types.ts` is hand-written. Replace it with generated types as
  soon as the project exists — see the comment at the top of that file.
- The nav icons are the template's and several are stand-ins; `NavIcon`'s set
  was drawn for a marketing agency. Cosmetic, worth redoing later.
- Member photos are not built. `profiles.avatar_url` exists and the directory
  reads it, but there is no upload — `AvatarUpload` from the template needs
  restoring and pointing at a new storage bucket.
- Availability is a free-text field. Spec 4.3 wants something filterable
  ("has a camera and is free Saturday"); the skills array supports the first
  half of that, availability does not yet support the second.
- No email sender. `notify()` writes the bell row; nothing sends mail yet.
- `CRON_SECRET` is not set anywhere yet — the reminders route returns 500
  until it is, in both `.env.local` and Vercel.
- The dashboard is still a placeholder (spec 4.2, due in Prompt 9).
- The repo is **public**. For a system holding under-18s' medical, allergy and
  safeguarding data plus DBS status, private is the better default.


## Done in Prompt 5 — events, programmes and ihsan

Two departures from the spec, both agreed with the user on 2026-09-22 and both
recorded in `docs/SPEC.md` sections 4.8 and 4.9. Read those before changing
anything here, because both are easy to undo by accident.

### 1. One planning object, not three

`initiatives` with `kind` in ('event', 'programme', 'campaign'). A weekly dars,
a camp and a fundraising campaign share roles, milestones, a run sheet, risks, a
budget and a retrospective; only recurrence differs. A separate `programmes`
table later would have duplicated all of it and drifted. The route stays
`/app/events` because that is what people call it.

### 2. Ihsan is not a section

The spec made it section 15 of the event file. We did not build that. A section
filled in last is filled in after every real decision is already made.

Instead:
- the emotional journey is in the Overview (`feels_arriving`, `feels_peak`,
  `feels_leaving`, `one_thing`) because it is an aim;
- the peak moment is a row in the run sheet with a time and an owner
  (`initiative_runsheet.is_peak_moment`);
- every other sense is a prompt on the section where the decision happens
  (`initiative_ihsan_prompts.section`), answered in writing, editable per event;
- the 1-5 ratings are at retrospective, per rater, as columns
  (`initiative_ihsan_ratings`) — that is what makes six events comparable;
- `initiative_readiness()` is the safety net that replaces the missing section.

**If an `ihsan_items` table ever appears, this decision has been reversed by
accident.**

### Files

| File | What it holds |
| --- | --- |
| `supabase/migrations/0008_initiatives.sql` | 24 tables, the readiness function, the close guard, the purge function, all RLS |
| `supabase/migrations/0009_pg_cron_safeguarding.sql` | Schedules the purge. Separate on purpose so it can fail alone |
| `supabase/migrations/0010_seed_templates.sql` | The seven templates with their roles, milestones, run sheets, ihsan prompts, risks and kit |
| `app/app/events/` | List, propose, the file, live run sheet, retrospective |
| `app/app/events/[id]/IhsanPrompts.tsx` | The prompts, rendered inside each section rather than collected |

### Things worth knowing

- **Milestones are dated backwards** from `starts_on` using negative
  `offset_days`, the same convention as `parseTemplateLines()` in
  `lib/checklist/parse.ts`.
- **`apply_template_to_initiative()` runs in SQL, not in the server action**, so
  an approval cannot half-happen. An approval that creates nine of fifteen tasks
  is worse than one that fails.
- **Safeguarding is its own table with its own row policy**, not columns on
  `initiatives`. Medical and allergy data about under-18s is special-category
  under UK GDPR, and a row boundary is what RLS is actually good at.
- **`initiative_basics` is a security DEFINER view**, unlike `member_directory`.
  The sensitive columns are simply not in it, so there is nothing to bypass by
  querying the base table directly.
- **The 100-word retrospective rule is a CHECK constraint** that only bites when
  `is_final` is true, so a draft in progress is never blocked by it.
- **Closing requires a signed-off retrospective**, enforced by a trigger rather
  than by the form, so nothing closes quietly from a script or the dashboard.
- Policies on `initiatives` test **that row's own columns only** — the 0007
  lesson. `can_see_initiative()` is for child tables, where it asks about a
  different table.

### Still to do on this module

- The file is read-and-edit for the fields that matter, but there is no UI yet to
  **add** rows to equipment, speakers, volunteers, risks, budget or the media
  plan — they arrive from the template. Adding a row is a form per table.
- Assigning a person to a role is not wired to a picker yet.
- `initiative_participants` has no UI at all. It is the most sensitive table in
  the system and deserves its own screen with a DPIA behind it.
- The event message channel (Prompt 8) is not created on approval; nothing exists
  to create it into yet.


## Done in Prompt 6 — finance

The CRM records money. It does not take payments, and there is no column
anywhere for a bank or card number.

### Two rules that live in the database, not in the app

**Zakat cannot be moved into another fund.** A trigger on `fund_transfers`
(`enforce_zakat_separation`), because the rule spans two rows in `funds`.
Zakat -> zakat is allowed; anything else out of a zakat fund raises. It is in
the database because it is a rule about money held in trust: a migration
script, a fix applied in the Supabase dashboard at midnight, or next year's
rewritten app would all walk past app-layer logic without anybody noticing.

The obvious way round it is closed too — `enforce_fund_kind_is_permanent`
refuses to relabel a fund that already has money against it, so you cannot
transfer zakat -> zakat and then call the destination 'general'.

**Nobody approves their own expense claim.** A CHECK constraint
(`nobody_decides_their_own_claim`), not a trigger, because both columns are on
the same row — which makes it the strongest form available.

The constraint alone is not enough, though: it stops you naming *yourself* as
the decider, not naming somebody else. The RLS policy's WITH CHECK requires
`decided_by = auth.uid()`, so an approval cannot be recorded in another
person's name either. Two rules, each covering what the other cannot. Both are
tested.

### Verified how

`npm run verify:rls` gained three sections. The zakat and self-approval checks
run as the **service role**, which bypasses every RLS policy — if the rule
still holds there, it is genuinely in the database. That is deliberate: the
0007 lesson was that testing reads as users and writes as god hides things,
and this is the inverse of that mistake, used on purpose.

### Design notes

- **Totals and individuals are different permissions.** `finance.view_totals`
  gets you the fund balances; `finance.view_individual` is what it takes to see
  what each person pledges. A sabiqun granted the first still sees only their
  own pledge, and there is a check for exactly that.
- **A donor list is private to its owner and the shura.** Everyone with finance
  permissions sees `donor_progress` — counts, not names. A list of people you
  might ask for money is not one anybody writes honestly if the whole
  organisation can read it.
- **A missed month is a row**, not an absent one. "We never wrote it down" and
  "they did not pay" are different facts.
- **A collection needs two different named counters**, enforced by a CHECK.
- **`looks_like_an_account_number()`** refuses any description or note with 13+
  consecutive digits. The realistic failure is somebody pasting their sort code
  and account number in so a treasurer can pay them back.
- **Receipts go in a PRIVATE storage bucket**, path `receipts/<user id>/<uuid>`.
  The first path segment being the owner's id is what the policies key off, so
  uploads must keep that layout. Deletes are not permitted — a claim's evidence
  should not be able to vanish after approval.
- **The CSV export defuses formula injection** (a cell starting `=` `+` `-` `@`
  gets a leading apostrophe) and is sent `no-store`.
- **The Finance nav item lost its `needs`.** Hiding the section behind
  `finance.view_totals` meant a muhsin could not reach the page to submit a
  receipt. The page shows totals only to those permitted.

### Still to do on this module

- Campaign `raised` is typed in by hand and nothing warns when it goes stale.
- No UI yet for creating pledges, setting donor targets, business donors or
  campaigns — the tables and policies exist, the forms do not.
- Event funds (`funds.initiative_id`) are modelled but nothing creates one when
  an event is approved.
- Receipts are uploaded but not yet displayed; that needs a signed-URL route.


## Done in Prompt 7 — strategy

Vision, mission and values; the year plan; OKRs; KPIs. Migration `0013`.

### The chain

Priority -> objective -> key result -> the event or task that moves it.
`tasks.key_result_id` and `initiatives.key_result_id` were added by ALTER
rather than designed in, because nothing before this phase knew OKRs existed.
That chain is the point: it lets somebody ask "why are we running this?" and
get an answer out of the system rather than out of a meeting.

### Access, straight off the matrix in spec section 3

| | Shura | Sabiqun | Ansar / Muhsinun |
| --- | --- | --- | --- |
| VMV | Edit | View | View |
| Year plan | Edit | View | Only if invited |
| OKRs | Full | Update the key results they own | Nothing |
| KPIs | Full | View | Nothing |

"Only if invited" is a per-person `yearplan.view` grant, which the existing
`profile_permissions.granted` boolean already expresses. There is a check that
proves a muhsin sees nothing until they are granted it, and then does.

### Two design notes worth keeping

**`key_results.direction`.** Not every target goes up. "Fewer than 3 volunteers
dropping out" is a real key result, and progress on it counted the usual way
round would read as failure the whole time.

**A number a human typed is never overwritten by a calculation.**
`refresh_auto_kpis()` only touches rows where `kpi_values.is_auto` is true. If
somebody counted the room and the system disagrees, the person who was in the
room wins, and the disagreement stays visible instead of being resolved
silently at three in the morning. There is a check that proves it.

Six of the eight KPIs calculate themselves from data the CRM already holds:
dars attendance, first-timers, active volunteers, donations, pledges collected,
and meeting actions done on time. Promotions and social followers are typed in —
the first until the development pathway exists (Prompt 9), the second forever,
because nothing here talks to the platforms.

### Also changed

The dashboard is no longer a bare placeholder. It now shows the key results you
personally own first, then objectives and headline KPIs for whoever is
permitted. The full per-person dashboard is still spec 4.2 in Prompt 9.

### Still to do on this module

- No UI for editing the values or the five priorities; they are seeded and
  editable only in SQL.
- A year plan goal can name an event, but nothing creates that link from the
  event side.
- `refresh_auto_kpis()` is run by hand from the KPIs page. It belongs on the
  same pg_cron schedule as the safeguarding purge.
- Weekly-cadence KPIs are modelled but every seeded KPI is monthly.
