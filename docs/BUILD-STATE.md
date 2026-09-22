# Build state — read this first

Last updated at the end of **Prompt 0**.

## What this is

The Edgware Youth CRM, built from the Advatar CRM as a template, following
`docs/SPEC.md`. That spec is the source of truth. Work through its Part C
prompts one at a time, in order.

**Next action: Prompt 1** (members, tiers, Ansar badge, teams, permissions).
It is the load-bearing one — everything else depends on the permission model
it builds. Do not rush it.

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
| `NotificationBell`, `NavBadge`, `MessagesNavBadge`, `api/notifications/flush` | Prompt 2 (notifications) |
| `TaskList`, `TodoPanel` | Prompt 2 (tasks) |
| `MonthCalendar`, `UpcomingStrip`, `SchedulePanel` | Prompt 2 (calendar) |
| `ResourceChecklistEditor` (parsing already saved in `lib/checklist/`) | Prompt 3 (SOPs) |
| `ResourcesPanel`, `DocumentsList`, `DocumentUpload` | Prompt 9 (resources) |
| `AvatarUpload`, `ProfilePanel`, `lib/profile-fields.ts` | Prompt 1 (member profiles) |
| `settings/templates` + `task_templates` tables (parser saved in `lib/checklist/`) | Prompt 5 (event templates) |
| `AvailabilityPanel`, `lib/availability.ts` | Prompt 1 (member availability) |
| `ActivityTimeline`, `lib/activity.ts` | Prompt 10 (audit log) |

## Known gaps

- **No Supabase project is connected yet.** Nothing has been run against a real
  database. `docs/SETUP.md` is the walkthrough.
- `lib/supabase/types.ts` is hand-written. Replace it with generated types as
  soon as the project exists — see the comment at the top of that file.
- The nav icons are the template's and several are stand-ins; `NavIcon`'s set
  was drawn for a marketing agency. Cosmetic, worth redoing later.
- `AppNav` gates by tier, which is the section 3 *default* only. Prompt 1
  replaces that with real permission keys so shura overrides take effect.
- The repo is **public**. For a system holding under-18s' medical, allergy and
  safeguarding data plus DBS status, private is the better default.
