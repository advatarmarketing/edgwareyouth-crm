# Edgware Youth CRM — Full Spec + Build Prompts (v2.1)

> **v2.1 — corrections applied after reading the Advatar template.**
> Everything you decided in Part B is unchanged. Four factual fixes were made
> where v2 described the template inaccurately, plus the repo name:
>
> 1. **Section 4.1 rewritten.** v2 said the template already turns an SOP into a
>    checklist and video feedback into a checklist for the editor, and told the
>    build to "find and keep that logic". Only part of that exists. What exists is
>    named precisely in 4.1 now, so nobody goes hunting for code that isn't there.
> 2. **Prompt 0 step 3 rewritten** to name the two real files instead of
>    describing a feature that doesn't exist.
> 3. **Prompt 4 split into 4a (parser + tests) and 4b (meetings UI).** It is the
>    largest genuinely new build in this spec and does not fit one pass.
> 4. **Two infrastructure needs called out** that the template has no answer for:
>    the safeguarding auto-delete needs a scheduled job (Prompt 5), and zakat
>    separation belongs in a database constraint, not app code (Prompt 6).
>
> Repo is `edgwareyouth-crm`, not `edgware-crm`.

- **Part A** — What the CRM will have
- **Part B** — Decisions (answered)
- **Part C** — Prompts for Claude Code (copy-paste, one at a time)

Template: `github.com/advatarmarketing/crm` (Next.js 14 + Supabase). The new CRM reuses its foundation (login, roles, database security, real-time messaging, calendar, and the way it turns text into checklists) and removes the Advatar-specific parts.

The CRM is **staff only**. No parents, participants or public log in.

**No AI is used anywhere in this CRM.** Checklists are made automatically from text the same way the Advatar CRM does it for SOPs and video feedback.

---

# PART A — WHAT THE CRM WILL HAVE

## 1. Brand

- Primary blue: **#2F5283** (taken from your icon files)
- Black **#000000** and white **#FFFFFF**
- Suggested supporting shades (derived from the blue): dark blue **#243F66** for hover/pressed, light tint **#E6ECF4** for backgrounds and highlights
- Headings: Bebas Neue (already in the template, and a close match to the "YOUTH." lettering). Body: DM Sans (already in the template)
- Keep the look plain and functional

**Logo files — which is which** (names checked, they're correct):

| File | What it is | Use it on |
|---|---|---|
| `logo-dark.png` | Black logo, transparent background, wide | Light backgrounds (light mode) |
| `logo-light.png` | White logo, transparent background, wide | Dark or blue backgrounds (dark mode, blue header) |
| `logo-square-dark.png` | Black logo, transparent, square 1080×1080 | Light backgrounds, square spaces |
| `logo-square-light.png` | White logo, transparent, square 1080×1080 | Dark/blue backgrounds, square spaces |
| `favicon.ico`, `favicon-16/32/48.png` | Blue square with white logo | Browser tab icon |
| `apple-touch-icon.png` (180) | Same | iPhone home screen |
| `icon-192.png`, `icon-512.png` | Same | Android / installable app |
| `icon-maskable-512.png` | Same with safe padding | Android adaptive icon |

Note: "dark" means the logo itself is dark (black), not that it's for dark mode. Easy to mix up, so the prompts spell it out.

## 2. How roles work

Each person is described by four things:

| Thing | What it is | Examples |
|---|---|---|
| **Tier** (one per person, or none if Ansar only) | Their main level | Shura, Sabiqun, Muhsinun |
| **Ansar badge** (yes/no) | Sits on top of any tier, or is someone's only status | "Sabiqun + Ansar", "Ansar only" |
| **Position** (optional) | Named post | Lead, Vice Lead, Head of Finance, Head of Media, Event Lead |
| **Teams** (any number) | Units they work in | Media, Finance, Events (active now). Dawah/Outreach, Tarbiyah (built but switched off until next year) |

Tier sets default permissions. **The shura can switch individual permissions on or off per person.** Also tracked: Active / Inactive, and "last engaged" date.

**Shura (council — 4 brothers).** Full access. Position-specific home areas:
- Lead — whole-org overview, approvals, accountability
- Vice Lead — same as Lead, usually oversees operations and events
- Head of Finance — runs the finance module
- Head of Media — runs the media planning module and media team

**Sabiqun (front runners).** Lead their own events with shura support. Plan events, manage their event team's tasks, update OKRs they own. Finance access only if the shura gives it.

**Ansar (original helpers — badge).** Fixed list. See announcements, events they're helping at, their own tasks and SOPs they're given. Inactive ones stay listed as "call on when needed".

**Muhsinun (base volunteers).** See events they're volunteering at, their rota and role on the day, their own tasks, SOPs they're given, announcements, and their progress towards becoming Sabiqun.

## 3. Access matrix (defaults — shura can change per person)

Key: **Full** = see + edit all · **Edit own** = only things assigned to them or created by them · **View** = read only · **—** = hidden

| Area | Shura | Sabiqun | Ansar | Muhsinun |
|---|---|---|---|---|
| Dashboard | Full org view | Their events, team, tasks | Own tasks + events | Own tasks + events |
| Members directory | Full | View (names, teams, contact) | Names only | Names only |
| Member private notes | Full | — | — | — |
| Permissions screen | Full | — | — | — |
| Tasks & checklists | Full | Edit own + assign within their events/team | Edit own | Edit own |
| SOPs | Full (write, edit, choose who sees) | View the ones shared with them | View the ones shared with them | View the ones shared with them |
| Calendar | All layers | Org + their events + their meetings | Org events + their events | Org events + their events |
| Shura meetings & minutes | Full | — | — | — |
| Other meetings | Full | Full for ones they run, view if attendee | View if attendee | View if attendee |
| Events — propose | Full | Yes | — | — |
| Events — approve | Full | — | — | — |
| Event file | Full | Full on events they lead, view others | Basics + their own role | Basics + their own role |
| Risk register & safeguarding | Full | Full on their events | Emergency briefing only | Emergency briefing only |
| Finance — totals & campaigns | Full | View if given permission | — | — |
| Finance — individual members' contributions | **All shura** | — | — | — |
| Finance — log donations | Full | If given permission | — | — |
| Own pledge + own donor outreach list | Yes | Yes | Yes | Yes |
| Expense claims | Approve | Submit | Submit | Submit |
| VMV | Edit | View | View | View |
| Year plan | Edit | View | **Only if invited** | **Only if invited** |
| OKRs | Full | Update the key results they own | — | — |
| KPIs | Full | View | — | — |
| Announcements | Post to anyone | Read (+ post in their event channels) | Read | Read |
| Team / event channels | All | Ones they're in | Ones they're in | Ones they're in |
| Direct messages | Yes | Yes | Yes | Yes |
| Media planning | Head of Media full, other shura view | Media team: edit; others: view event media plans they're on | View event media plans they're on | View event media plans they're on |
| Development tracker | Full | Own | Own | Own |
| Resources library | Full | View + upload | View | View |
| Audit log | Full | — | — | — |

## 4. Modules

### 4.1 The checklist engine (used everywhere)

One shared feature. **Two pieces of it already exist in the Advatar CRM and are
being lifted; the rest is new code.** Stated plainly so nobody wastes time
looking for something that isn't there:

**Exists — line-to-step parsing.** `components/ResourceChecklistEditor.tsx`.
Paste a block of text, get one tick-box per line, with bullets (`-`, `*`, `•`)
and numbering (`1.`, `1)`) stripped. That is six lines of code inside a client
component. It is the seed of the engine, not the engine.

**Exists — templates that generate dated tasks.** `task_templates` and
`task_template_items` with an `offset_days` column, written as `task text | days`
one per line (`app/app/settings/templates/actions.ts`). This is what Prompt 5
needs for milestones dated backwards from an event date. Keep it.

**Does not exist — anything that reads an owner, a due date or nested sub-steps
out of prose.** The meeting parser in 4.6 is new work, built from scratch. The
Advatar CRM's nearest equivalent is the Fathom call mapping, which splits a
transcript on sentence boundaries and is being deleted with the rest of Fathom.

**What gets built:** the two surviving pieces move into one shared library
(`lib/checklist/`) that the SOPs, meetings, events and tasks modules all call.
Text in — steps, bullets, numbered lines, indented lines — tick-box checklist
out. Every checklist records where it came from (sop, meeting, event, okr,
manual) and links back to it.

### 4.2 Dashboard (different per person)

Everyone: **My tasks** (today / this week / overdue), next 3 events, next meetings, latest announcements, unread messages, SOPs they haven't read yet.

Shura extra: overdue tasks across the org, events waiting for approval, expense claims waiting, month's income vs target, OKR progress, meeting action completion rate.

Sabiqun extra: events they lead with progress bar, their team's task status.

Muhsinun extra: "My next shift" (event, time, role, who to report to) and development progress.

### 4.3 Members

- Profile: name, photo, phone, email, tier, Ansar badge, position, teams, skills (camera, design, cooking, driving, first aid, speaking…), availability, active/inactive, date joined
- DBS status + expiry, first aid trained + expiry
- Engagement history (auto): events volunteered, meetings attended, tasks completed, halaqat/retreats attended, SOPs read
- Shura-only private notes
- Filters, e.g. "has a camera and is free Saturday", "inactive Ansar"
- Invite by email; shura sets tier at invite

### 4.4 Tasks

- Title, owner, due date, priority, status (to do / doing / done / blocked), checklist, comments, source link
- Blocked needs a reason and notifies whoever assigned it
- Reminders 2 days before and on the day; overdue flagged to assigner and shura

### 4.5 SOPs (Standard Operating Procedures)

Works like the Advatar CRM: **read the full SOP, and a tick-off checklist is automatically made from its steps.**

- Each SOP: title, category, full written guide, and the auto-generated checklist from its steps
- **Who can see it**: shura choose by tier, team, and/or individual people (e.g. "Handling cash" → shura + finance team only)
- **"Run this SOP"**: gives a person (or an event role) a fresh copy of the checklist as a task, with a due date. Event templates can attach SOPs to tasks automatically (e.g. the "Set-up lead" gets the venue set-up SOP checklist)
- **Read tracking**: members press "I've read this"; shura see who hasn't. When an SOP is updated, people are asked to re-read it
- Version history (who changed what, when)

**Starter SOPs to write** (with suggested visibility):

| SOP | Who sees it |
|---|---|
| Running a weekly dars / talk | Everyone |
| Venue set-up and pack-down | Everyone |
| Welcome, registration and door team | Everyone |
| Ihsan & the senses checklist (making every event unforgettable) | Everyone |
| Safeguarding: reporting a concern | Everyone |
| Lost or missing young person | Everyone |
| Medical emergency / first aid | Everyone |
| Photography and consent | Everyone |
| Volunteer (muhsin) onboarding | Shura + Sabiqun |
| Planning an event from proposal to close | Shura + Sabiqun |
| Booking and briefing a speaker | Shura + Sabiqun |
| Running a meeting and taking minutes | Shura + Sabiqun |
| Event retrospective and follow-up | Shura + Sabiqun |
| Social media posting and approval | Shura + Media team |
| Event media coverage (filming/photos) | Shura + Media team |
| Handling cash and mosque collections | Shura + Finance team |
| Face-to-face fundraising at mosques | Shura + Finance team |
| Submitting an expense claim | Everyone |
| Monthly finance close | Shura + Finance team |
| Year planning session | Shura |

### 4.6 Meetings (most important module)

Goal: **right after every meeting, everyone given an action has it on their CRM as a checklist with a due date, without anyone retyping it.**

No AI is used, so the CRM picks out actions from **how the notes are written**. It can't guess actions from a free-flowing conversation — the minute-taker marks them. This is the one habit the team needs, and it fits your priority of being "skilled in minutes and CTAs".

**Meeting types (templates):** Shura weekly, Sabiqun meeting, Team meeting (media/finance/events), Event planning, Event debrief, Year planning, General staff meeting. Each sets default attendees, agenda sections, who can see the minutes (shura only / attendees / all staff), chair and minute-taker.

**Before**
- Create from a template, or set as recurring
- Agenda auto-fills "Matters arising" with every unfinished action from the last meeting of the same type
- Shura meetings also auto-add: events waiting for approval, expense claims waiting, finance and KPI snapshot
- Members can press "Add to agenda" to suggest items
- On calendars, with a reminder the day before

**During** (typed live in the CRM — the best option)
- Notes laid out by agenda item
- "+ Action" button: **who, what, by when**, plus optional checklist steps
- "+ Decision" button for the decision log
- Attendance: present / apologies / absent

**After — if notes were taken outside the CRM (Notion, phone notes, voice recording)**

Paste the notes in. The CRM picks out lines written in this simple format:

```
ACTION @Yusuf: Book the venue for the Seerah night by 12/10
  - Call the masjid office
  - Confirm the price
  - Send the booking to Head of Finance
DECISION: Seerah night moves to the first Friday of November
```

- `ACTION @Name: what by date` → a task for that person with that due date
- Indented lines under it → the checklist steps
- `DECISION:` → goes into the decision log
- Ticked or unticked Notion to-do items (`[ ]` lines) with an @name are also picked up
- Anything it can't match (unknown name, no date) shows on the review screen for the minute-taker to fix by hand
- Names match first name or a nickname set on each member's profile

**Voice recordings:** the CRM can't turn audio into text by itself (that would need AI). The recording can be attached to the meeting for the record. For the actions, use the Notion transcript/notes, or the minute-taker writes the ACTION lines while listening back.

**Review → Publish**
1. Review screen: every action listed with owner, due date and steps. Fix, reassign, delete or add. Can't publish without owner + due date
2. Press **Publish**. Automatically:
   - each action becomes a task on the owner's "My tasks" with its checklist
   - each owner gets a notification and a "Meeting pack": key points, decisions, and *their* actions
   - due dates go on their calendar
   - minutes saved and searchable with the right visibility

**Follow-up**
- Meeting page shows action progress (e.g. "7 of 9 done")
- Reminders, overdue flagged to the chair
- Unfinished actions roll into the next meeting's "Matters arising"
- **Decision log** — every decision, searchable
- **Accountability view (shura)** — per person: actions given, done on time, overdue

### 4.7 Calendar

- Layers on/off: org events, meetings, task deadlines, event milestones, Islamic dates, school holidays
- Everyone only sees what their access allows
- Month / week / list; click through to the item

### 4.8 Events (same system every time)

**Changed from the original spec, with the user, on 2026-09-22: ONE planning object.**
A weekly dars, a residential camp and a fundraising campaign share nearly the whole file
— roles, milestones, a run sheet, risks, a budget, a retrospective, follow-up. Only
recurrence really differs. Building `events` now and a parallel `programmes` table later
would mean writing all of that twice and watching the two copies drift. So the table is
`initiatives`, with `kind` in ('event', 'programme', 'campaign'). The route is still
`/app/events`, because that is what people call it.


**Types (each a template):** Weekly dars/talk (light), Seerah night, Halaqah, Internal retreat, Residential/camp (heavy), Fundraiser, Sports/activity day, Outreach stall, Collaboration with another org.

Templates are editable by shura, and lessons from each retrospective can be pushed into the template.

**Stages:** Idea → Proposal (to shura) → Approved → Planning → Live → Wrap-up → Closed

On approval, the template creates milestones and tasks **dated backwards from the event date** and assigned to the event roles, with SOP checklists attached where relevant.

**The event file (based on the MYN plan + what it was missing):**

1. Overview — title, type, dates, venue, lead, background/problem, aims, target audience and ages, outputs and outcomes, which priority/OKR it serves
2. Roles & responsibilities — role, duties, person. Defaults: Project Lead, Programme & Speakers, Logistics, Finance & Admin, Media, Activities, Volunteer Lead, Safeguarding Lead, First Aider, Welcome/Hospitality Lead
3. Milestones — date, milestone, owner, done
4. Programme / run sheet — timed schedule incl. salah times, who runs each slot; phone-friendly "live mode" showing now/next
5. Content — theme, why, talk and workshop outlines, recurring themes
6. Speakers — contact, topic, brief sent, confirmed, travel, backup
7. Venue & logistics — contact, booking, access times, transport, layout, parking
8. Equipment — item, quantity, who brings, packed/returned
9. Volunteers & rota — who, role, time, where to report, briefing done. Muhsinun see only their own line + briefing
10. Safeguarding — lead named, adult-to-youth ratio, DBS, parental consent, medical/allergy info (restricted), photo consent, missing person procedure, emergency contacts, nearest A&E
11. Risk register — likelihood (1–5) × severity (1–5) = score (auto), owner, mitigation, strategy. Common risks pre-loaded
12. Budget — planned vs actual, linked to finance
13. Media plan — see 4.11
14. Registration & attendance — expected vs actual, first-timers vs returning
15. Ihsan & the senses — see 4.9
16. Stakeholders — mosque committee, parents, partners, local leaders; what we'll do with each
17. Approval — submitted by, approved by, date
18. Retrospective (required to close) — went well, challenges, improve, change, 100+ word summary, people engaged, media uploaded, feedback, "push lessons into template"
19. Follow-up — new attendees invited to next dars/halaqah, thank-yous to volunteers and speakers within 48 hours

### 4.9 Ihsan & the senses — NOT a section

**Changed from the original spec, with the user, on 2026-09-22.**

The original spec made this section 15 of the event file. That was the wrong shape and
we did not build it. A section you fill in last is a section you fill in *after every
real decision has already been made* — the layout is fixed, the run sheet is full, the
money is spent. It can only ever be a post-rationalisation, and a checklist is the
fastest way to hollow out the very thing it is meant to protect.

So ihsan is integrated into the planning rather than appended to it:

- **The emotional journey sits in the Overview** (section 1), beside the aims, because it
  *is* an aim. `feels_arriving`, `feels_peak`, `feels_leaving`, `one_thing`.
- **The peak moment is a row in the run sheet** — a real time, with a real owner
  (`initiative_runsheet.is_peak_moment`). Not a tick. A moment that is not scheduled
  does not happen.
- **Every other sense is a prompt attached to the section where that decision is taken.**
  Smell hangs off Venue and Equipment, sound off the run sheet, touch off the rota.
  `initiative_ihsan_prompts.section` is what carries this.
- Prompts take a **written answer**, not a checkbox. "Bukhoor" can be ticked without a
  thought; "who is lighting it, and when?" has to be answered with a name.
- Prompts are **editable per event**. If the venue has no power for a diffuser you
  rewrite the prompt — you do not tick it and lie.
- **The 1–5 ratings survive**, at retrospective, as columns rather than prose. That is
  the part that compounds: six events in, you can see smell scores 2 every time and the
  cause is that nobody owns the toilets. Free text can never tell you that. Scored per
  rater, not per event — one person's 5 and another's 2 means they were at different
  events, which is the finding.
- **The cost of integrating** is that scattered prompts are easier to skip than an
  obviously-empty section. `initiative_readiness()` is the answer: computed before the
  thing goes Live, never stored, and it names the section rather than a checklist.

There is no ihsan table holding a list of items. If one ever appears, this decision has
been reversed by accident.

### 4.10 Finance

The CRM **records** money; it does not take payments.

- **Funds:** General, Zakat (kept strictly separate — no moving zakat into general; confirm rules with a scholar), Sadaqah, Waqf/Baitul Maal, event funds
- **Monthly member pledges (zakat al-mal / contributions):** pledge amount, paid/missed each month. Member sees only their own; **all shura** see everyone's
- **Donor outreach:** each member has a target number of people, and a private list (name, contact, date approached, pledged, received, next follow-up). Finance-permitted members see everyone's progress; shura see all
- **Other income:** musallee standing orders, local business donors (regular/one-off, last contacted), campaigns (e.g. LaunchGood — target, raised entered manually), mosque collections (two counters named), card machine, event profit
- **Expense claims:** anyone submits with receipt photo; **every claim needs approval** (Head of Finance or another shura member; nobody approves their own). Status: submitted / approved / paid / rejected
- **Reports:** by month and fund, pledges collected vs expected, campaign progress, spreadsheet export
- Never stores bank or card numbers

### 4.11 Media planning (planning only — no editing workflow)

- **Media goals** — linked to OKRs (e.g. followers, reach, event sign-ups from socials)
- **Platform plan** — for each of Instagram, TikTok, YouTube, WhatsApp: purpose, audience, posting frequency, what works
- **Content pillars** — the themes you post about
- **Content calendar** — planned posts: date, platform, pillar, owner, status (idea / planned / posted)
- **Event media plans** — made automatically when an event is approved, dated backwards from the event: poster, teaser, countdown, on-the-day coverage, recap post
- **Coverage plan** — shot list, who's filming/photographing, where files go
- **Key notes & brand guidelines** — tone of voice, do's and don'ts, logo use, colours
- **Monthly media review** — numbers + notes, feeding the KPIs
- Media team meetings go through the Meetings module, so actions become checklists the same way

### 4.12 Strategy: VMV, Year Plan, OKRs, KPIs

**VMV** — editable by shura, visible to all. Pre-filled:
- Purpose: Developing brothers who are committed to working for Islam to its peak
- Vision: Young Muslims revive Islam & reform Edgware (Muslim) Society
- Mission: We cultivate believers, shape key conversations, and contribute to Edgware Society
- Values: Sincerity (working for Allah's pleasure alone), Discipline (honour all commitments diligently), Accountability (ownership over excuses), Sacrifice (mission before comfort, trust in Allah's promise), Brotherhood (collaboration and genuine care)
- Priorities: (1) Nurturing a special brotherhood — halaqat & internal retreats; (2) Bolster recruitment — interpersonal dawah; (3) Promote our presence locally — digital & offline; (4) Fortify the organisation — systems, structure & culture; (5) Build finances — fundraisers & waqf

**Year plan** — goals by quarter, key events on the calendar, owners. Shura and Sabiqun see it; Ansar/Muhsinun only if invited.

**OKRs** — Objective (linked to a priority) → 2–5 key results with target, current value, owner, quarter. Events and tasks can link to a key result.

**KPIs** — tracked over time with a chart: weekly dars attendance, new vs returning attendees, active volunteers, Muhsinun promoted, social followers, monthly donations, pledges collected %, meeting actions done on time %. Auto-filled where the CRM has the data; manual monthly entry for the rest.

### 4.13 Messaging

- **Announcements** — to everyone or specific tiers/teams, with per-person read tracking
- **Team channels**, **event channels** (created on approval, archived on close), **direct messages**
- Unread badges, @mentions, attachments
- Per-person read receipts (fixes the shared "read" flag the template's README flags)
- WhatsApp can't be connected. Suggested rule: tasks, decisions and approvals go in the CRM; quick chat stays on WhatsApp

### 4.14 Development pathway (Muhsinun → Sabiqun)

- Milestones set by shura (events volunteered, took a responsibility, halaqat/retreat attended, course done, led a task, shadowed an event lead, key SOPs read)
- Auto-filled where possible; each Muhsin sees their own progress; shura see a "ready to step up" list
- **Dawah target list** — built but switched off until the Dawah/Outreach team goes live. Private to each member; shura see totals

### 4.15 Resources library

Folders with per-folder visibility: policies, forms (photo consent etc.), volunteer packs, speaker brief template, brand files.

### 4.16 Notifications

In-app bell + email for: new task, due soon, overdue, meeting pack, @mention, event approved/returned, expense decided, announcement, new or updated SOP to read. Each person chooses email on/off per type.

### 4.17 Admin (shura)

Invite/deactivate members; set tier, Ansar badge, position, teams, nicknames; permissions screen; switch teams on/off (Dawah, Tarbiyah); edit templates (events, meetings), SOP visibility, KPIs, funds; audit log.

## 5. Data protection (UK)

- Young people's medical and safeguarding info lives only in the event file, visible to event lead + safeguarding lead + shura, and **auto-deleted a set number of weeks after the event**
- Collect only what's needed; a simple privacy notice for members
- Not legal advice — worth a quick check against ICO guidance

---

# PART B — DECISIONS (ANSWERED)

1. Second tier name: **Sabiqun**
2. Individual contributions visible to: **all shura**
3. Meetings recorded via: **Notion, voice recording, notes taken** → use the ACTION/DECISION format (section 4.6); typing live in the CRM is best
4. AI: **not used**. Checklists come from text, like the Advatar CRM's SOPs and video feedback
5. Teams: **Media, Finance, Events active now**; Dawah/Outreach and Tarbiyah built but switched off until next year
6. Expenses: **every claim needs approval**, no threshold
7. Year plan for Ansar/Muhsinun: **only if invited**
8. Brand: **blue #2F5283**, black, white; logo files as listed in section 1

---

# PART C — PROMPTS FOR CLAUDE CODE

## Before you start (simple steps)

1. On GitHub, create a new **empty** repository called `edgwareyouth-crm`
2. Make a new **Supabase project** just for Edgware (don't reuse Advatar's)
3. Open Claude Code. Give it **this file** and **all 12 logo/icon files** along with Prompt 0
4. Paste the prompts **one at a time**. After each one, Claude Code will tell you what to check. Only move on when you're happy
5. If Claude Code asks for something you don't understand, paste its question back to me here

---

### Prompt 0 — New project from the template + brand

```
I'm building a staff-only CRM for my youth organisation, Edgware Youth, using my existing Advatar CRM as the template: https://github.com/advatarmarketing/crm

I've given you a spec file and 12 brand files.
1. Save the spec as docs/SPEC.md. It is the source of truth for every phase. Read all of it before doing anything.
2. Copy the Advatar CRM into a new repo called edgwareyouth-crm. **Copy from the `advatar-crm/` subfolder, not the repo root** — the repo contains the app twice and the root copy is stale. Read its README fully and keep its patterns: Supabase auth, role middleware, RLS with security-definer helper functions, the invite flow, realtime refresh, messaging, the seed and verify-rls scripts.
3. Lift these two specific things, which are the only checklist logic that actually exists (see section 4.1):
   - `components/ResourceChecklistEditor.tsx` — the paste-a-block-get-one-step-per-line parser, including the bullet/numbering strip.
   - `app/app/settings/templates/actions.ts` plus the `task_templates` / `task_template_items` tables — templates that generate tasks dated by `offset_days`. Prompt 5 needs this.
   Move both into a shared `lib/checklist/` library. Do not go looking for an SOP-to-checklist generator or a video-feedback-to-checklist feature; they do not exist. Remove the video review/submissions feature entirely.
   Also keep `lib/names.ts` — its first-name and initials matching is the starting point for matching @names in Prompt 4a.
4. Remove everything else Advatar-specific: clients, client portal, videographer role, 90-day planner, invoices, client_finance, prospects, client avatars, the Fathom webhook. Keep reusable pieces.
5. Start a fresh migrations folder (don't carry the Advatar schema over).
6. Brand, following section 1 of the spec exactly:
   - Put the logos in public/brand/. logo-dark.png and logo-square-dark.png are BLACK logos for LIGHT backgrounds. logo-light.png and logo-square-light.png are WHITE logos for DARK/BLUE backgrounds. Show the right one automatically in light and dark mode.
   - Set up favicon.ico, favicon-16/32/48, apple-touch-icon, icon-192, icon-512 and icon-maskable-512 as the app icons, plus a web app manifest named "Edgware Youth" with theme colour #2F5283.
   - Replace the Advatar colour tokens with #2F5283 (primary), #243F66 (hover), #E6ECF4 (light tint), black and white. Keep Bebas Neue for headings and DM Sans for body. Plain and functional, no heavy styling.
7. Run npm install, npm run dev, tsc --noEmit and next build and fix anything broken.
8. Write me a plain-English checklist (exact clicks, no jargon) for connecting my new Supabase project and Vercel.

Stop and summarise in plain English: what you kept, what you removed, and anything you couldn't do. If something can't be done, tell me plainly instead of working around it.
```

### Prompt 1 — Members, tiers, Ansar badge, teams, permissions

```
Phase 1 of docs/SPEC.md. Build sections 2 (How roles work), 3 (Access matrix), 4.3 (Members) and 4.17 (Admin).

- Tier: shura, sabiqun, muhsinun, or none (for "Ansar only"). Ansar is a separate yes/no badge.
- Positions: lead, vice_lead, head_of_finance, head_of_media, event_lead (allow more later).
- Teams many-to-many. Seed Media, Finance, Events as active; Dawah/Outreach and Tarbiyah as inactive (hidden everywhere until shura switch them on).
- Nicknames on each profile (needed later for matching @names in meeting notes).
- Permissions as named keys (e.g. finance.view_totals, finance.view_individual, finance.log, finance.approve, events.propose, events.approve, meetings.view_shura, members.manage, sops.manage, strategy.edit, yearplan.view, media.manage). Tier sets defaults; shura override per person on a Permissions screen. Enforce in the database with a has_permission() security-definer helper like the template's. Middleware and nav are convenience only.
- Active/inactive, skills, DBS + expiry, first aid + expiry, shura-only private notes in a separate table.
- Invite by email with tier set at invite.
- Nav shows only what each person can access.

Update the seed script with one test account per tier, an "ansar only" account and a "sabiqun + ansar" account. Extend verify-rls to prove each only sees what the access matrix allows. Stop and summarise in plain English.
```

### Prompt 2 — Checklist engine, tasks, calendar, notifications

```
Phase 2 of docs/SPEC.md. Build sections 4.1 (checklist engine), 4.4 (Tasks), 4.7 (Calendar) and 4.16 (Notifications).

- Turn the checklist logic kept from the Advatar CRM into one shared engine: text in (steps, bullets, numbered lines, indented lines) → tick-box checklist out. Every checklist records its source (sop, meeting, event, okr, manual) and links back to it. SOPs, meetings and events will all use this.
- Tasks: owner, due date, priority, status (to do / doing / done / blocked with reason), checklist, comments, source.
- Calendar: switchable layers, month/week/list, filtered by access.
- Notifications: in-app bell with realtime unread count, plus email (recommend an email service and tell me exactly how to set it up). Per-person email on/off per type. Reminders 2 days before and on the due date; overdue flags.

Stop and summarise in plain English.
```

### Prompt 3 — SOPs

```
Phase 3 of docs/SPEC.md. Build section 4.5 (SOPs), working the same way as the Advatar CRM's SOPs: read the full SOP, and a tick-off checklist is made automatically from its steps using the checklist engine.

- Visibility chosen by shura: by tier, team and/or individual person. Enforced in RLS, not just the UI.
- "Run this SOP": assign a fresh checklist copy to a person or event role as a task with a due date.
- "I've read this" tracking; shura see who hasn't read; updating an SOP asks people to re-read.
- Version history.
- Seed every starter SOP in the table in section 4.5 as a draft with its suggested visibility and a sensible first version of the steps (written for a UK Muslim youth organisation), clearly marked "DRAFT — shura to review".

Stop and summarise in plain English.
```

### Prompt 4a — The meeting notes parser (pure logic + tests, no UI)

```
Phase 4a of docs/SPEC.md. Build ONLY the parser for section 4.6. No UI, no database
writes, no pages. This is the largest piece of new code in the whole spec and it gets
its own pass so it can be tested properly before anything depends on it.

Do NOT use any AI or external API. Actions come from structure alone.

Write lib/meetings/parse-notes.ts exporting a pure function: raw pasted text in,
a structured result out { actions, decisions, unmatched }. It must handle:
- "ACTION @Name: what by <date>" -> one action with owner, text and due date
- indented lines directly beneath an ACTION -> that action's checklist steps
- "DECISION: ..." -> a decision log entry
- "[ ]" and "[x]" Notion to-do lines containing an @name -> treated as actions
- Names matched against first name, full name and the nicknames on each member's
  profile. Ambiguous matches (two people called Yusuf) are NOT guessed - they go
  to unmatched with both candidates listed.
- UK date formats: 12/10, 12 Oct, 12 October, "next Friday", "Friday", "tomorrow".

CRITICAL: relative dates ("next Friday", "Friday", "tomorrow") resolve against the
MEETING DATE, which is passed in as an argument - never against today's date. Notes
pasted three days after the meeting must still produce the dates the room agreed.
Make the reference date a required parameter so it cannot be forgotten.

Anything the parser cannot confidently resolve - unknown name, ambiguous name,
missing or unparseable date - goes into `unmatched` with the raw line and the reason.
Nothing is ever silently dropped, and nothing is ever guessed.

Write a thorough test suite covering every rule above, plus deliberately messy input:
missing colons, lowercase "action", an @name with no date, a date with no @name, two
people with the same first name, indented lines under a DECISION, blank lines mid-block,
and a line that is just prose. Tell me how to run the tests.

Stop and summarise in plain English, and show me the parser's output for a realistic
set of messy shura meeting notes.
```

### Prompt 4b — Meetings module (UI, publishing, follow-up)

```
Phase 4b of docs/SPEC.md. Build the rest of section 4.6 on top of the Prompt 4a parser.
The point: straight after a meeting, every person given an action has it on their CRM
as a checklist with a due date, without anyone retyping it.

- Meeting templates (type, default attendees, agenda sections, minutes visibility,
  chair, minute-taker) and recurring meetings.
- Agenda builder that auto-pulls unfinished actions from the previous meeting of the
  same type into "Matters arising", adds the shura snapshot for shura meetings, and
  accepts "Add to agenda" suggestions.
- Live minutes page by agenda item with "+ Action" (who / what / by when / optional
  steps), "+ Decision", and attendance.
- Paste-in screen that runs the 4a parser and shows the result.
- Allow attaching an audio recording to a meeting for the record (Supabase Storage).
  Do not attempt transcription.
- Review screen: edit, reassign, delete, add. Everything in `unmatched` surfaces here
  for the minute-taker to fix by hand. No publishing without owner + due date on every
  action.
- Publish: creates tasks via the checklist engine (source = meeting), notifications,
  calendar deadlines, and a "meeting pack" per owner (key points, decisions, their
  actions).
- Meeting page shows action progress; decision log (searchable); shura accountability
  view per person.
- Minutes visibility enforced in RLS.
- Add a one-page "How to write meeting notes" guide inside the app showing the
  ACTION/DECISION format with examples, and link it from the meetings page.

Test end to end: paste a realistic messy set of shura meeting notes, fix the unmatched
lines on the review screen, publish, then show me the tasks that landed on each person's
"My tasks" with their checklists and due dates. Stop and summarise in plain English.
```

### Prompt 5 — Events, templates and Ihsan

```
Phase 5 of docs/SPEC.md. Build sections 4.8 (Events) and 4.9 (Ihsan & the senses).

- Stages: idea → proposal → approved → planning → live → wrap-up → closed. Sabiqun propose; shura approve or return with comments.
- Editable templates that on approval auto-create milestones and tasks dated backwards from the event date, assigned to event roles, with SOP checklists attached where relevant (e.g. set-up lead gets the venue set-up SOP).
- Seed templates: weekly dars (light), seerah night, halaqah, internal retreat, residential camp (heavy — every section of the event file), fundraiser, sports day.
- All 19 sections of the event file. Risk score = likelihood × severity, colour-coded. Budget planned vs actual. Phone-friendly "live mode" for the run sheet.
- Ihsan & the senses scaled per template, each item a checklist task; retrospective rates each sense 1–5.
- Retrospective required to close; "push lessons into template" action.
- Muhsinun and Ansar see only event basics, their own rota line and the briefing. Medical/safeguarding info restricted to event lead + safeguarding lead + shura, auto-deleted a set number of weeks after the event (make the number a setting).
- IMPORTANT: that auto-delete needs a scheduled job, which the template has nothing of. Implement it with pg_cron inside Supabase (preferred - it keeps the rule next to the data and works even if the app is down) and tell me exactly how to enable it. A Vercel cron route is the fallback. Write the deletion as a SQL function so it can be tested directly, and log every deletion to the audit log.
- On approval, auto-create the event's message channel (note anything needed for Phase 8) and the event media plan (section 4.11 — build a basic version now if the media module doesn't exist yet, and note it).

Stop and summarise in plain English.
```

### Prompt 6 — Finance

```
Phase 6 of docs/SPEC.md. Build section 4.10 (Finance).

- Funds: general, zakat, sadaqah, waqf/baitul maal, event funds. Zakat strictly separate — block any transfer from zakat into general.
- Enforce the zakat rule as a DATABASE constraint or trigger, not app-layer logic. It is an integrity rule about money held in trust; it must be impossible to bypass from a server action, a script, or the Supabase dashboard. Add a test that proves the write is rejected.
- Monthly pledges with paid/missed per month. Members see only their own; all shura see everyone's.
- Donor outreach: per-member targets and private donor lists with follow-up reminders.
- Standing orders, business donors, campaigns, mosque collections (two counters), card machine, event profit from event budgets.
- Expense claims with receipt photo (Supabase Storage). Every claim needs approval by the Head of Finance or another shura member; nobody can approve their own claim. Statuses: submitted / approved / paid / rejected.
- Reports by month and fund, spreadsheet export.
- Enforce all access in RLS. Add verify-rls checks: a sabiqun with finance.view_totals can't see individual pledges; a muhsin sees only their own pledge and donor list; a shura member can't approve their own claim.
- Never store bank or card numbers.

Stop and summarise in plain English.
```

### Prompt 7 — Strategy: VMV, Year Plan, OKRs, KPIs

```
Phase 7 of docs/SPEC.md. Build section 4.12.

- VMV page pre-filled with the exact text in the spec, editable by shura, visible to all.
- Year plan by quarter linked to the calendar. Visible to shura and sabiqun; ansar/muhsinun only if invited (yearplan.view permission).
- OKRs: objective linked to a priority → key results with target, current, owner, quarter. Owners update their own. Events and tasks can link to a key result.
- KPIs with history and a simple chart. Auto-fill what the app can calculate (attendance, active volunteers, promotions, donations, pledge %, meeting actions on time %); monthly manual entry for the rest.
- Shura dashboard tiles for OKR progress and key KPIs.

Plain and functional. Stop and summarise in plain English.
```

### Prompt 8 — Messaging upgrade

```
Phase 8 of docs/SPEC.md. Extend the template's messaging to section 4.13.

- Replace the shared "read" flag with per-person read receipts (a message_reads table, as the template's README suggests).
- Channel types: announcements (posting controlled by has_permission, targeted to everyone or chosen tiers/teams), team channels, event channels (auto-created on approval, archived on close), direct messages.
- Unread badges, @mentions that trigger notifications, file/image attachments.
- Senders of announcements can see who has and hasn't read them.

Stop and summarise in plain English.
```

### Prompt 9 — Media planning, development pathway, resources, dashboards

```
Phase 9 of docs/SPEC.md. Build sections 4.11 (Media planning), 4.14 (Development pathway), 4.15 (Resources) and 4.2 (Dashboards).

- Media planning only — no editing or review workflow. Media goals linked to OKRs, platform plans, content pillars, content calendar, event media plans auto-dated from event dates, coverage plans, key notes and brand guidelines, monthly media review feeding KPIs. Head of Media has full control; media team can edit; others view event media plans they're on.
- Development milestones editable by shura, auto-filled from events, meetings, tasks and SOP reads; "ready to step up" list for shura. Dawah target list built but hidden until the Dawah/Outreach team is switched on.
- Resources: folders with per-folder visibility; include the brand files.
- Dashboards for each tier and shura position exactly as in section 4.2.

Stop and summarise in plain English.
```

### Prompt 10 — Security check and go live

```
Phase 10 of docs/SPEC.md. Final check and deployment.

1. Audit every table's RLS against the access matrix in section 3, table by table, and fix gaps. Make sure verify-rls has a test for every row of the matrix, including the "ansar only" and "sabiqun + ansar" accounts, SOP visibility, and minutes visibility.
2. Check section 5 (data protection) is actually implemented, including the auto-delete.
3. Run tsc --noEmit, next build, the seed script and verify-rls against my real Supabase project.
4. Deploy to Vercel and walk me through every step in plain English.
5. Give me a smoke-test checklist: log in as each tier and check what they see.
6. Remind me to delete the test accounts afterwards.

Tell me plainly about anything that doesn't work or that you couldn't check.
```
