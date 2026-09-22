# Build state — read this first

Last updated at the end of **Prompt 3**.

## What this is

The Edgware Youth CRM, built from the Advatar CRM as a template, following
`docs/SPEC.md`. That spec is the source of truth. Work through its Part C
prompts one at a time, in order.

**Next action: Prompt 2** (the checklist engine, tasks, calendar, notifications).

Prompts 0 and 1 are done. Nothing has been run against a real database yet —
`docs/SETUP.md` is the walkthrough, and `npm run verify:rls` is the thing to
run first once Supabase exists. It tests the whole access matrix and will tell
you plainly if a policy is wrong.

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

`npm run verify:rls` — 47 checks, all passing. Tier defaults; both awkward
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
