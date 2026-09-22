# Edgware Youth CRM

A staff-only CRM for Edgware Youth: members, tasks, SOPs, meetings, events,
finance, strategy and messaging. No parents, participants or public log in.

Next.js 14 (App Router) + Supabase (auth, Postgres, row-level security,
realtime, storage). No AI anywhere in the product.

## Start here

| If you want to... | Read |
|---|---|
| Know what's built and what's next | `docs/BUILD-STATE.md` |
| Connect Supabase and deploy | `docs/SETUP.md` |
| Know what this is meant to become | `docs/SPEC.md` |

`docs/SPEC.md` is the source of truth. Its Part C is a series of prompts to
work through **one at a time, in order**. Prompt 0 is done; Prompt 1 is next.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in — see docs/SETUP.md
npm run dev
```

| Command | Does |
|---|---|
| `npm run dev` | Local dev server on :3000 |
| `npm run build` | Production build |
| `npm run seed:test-accounts` | One test login per tier |
| `npm test` | Unit tests (the meeting notes parser) |
| `npm run verify:rls` | Proves the security rules hold |
| `npm run seed:sops` | Seeds the 20 starter SOPs as drafts |

## How access works

Read section 3 of the spec before changing anything here.

Four things describe a person: a **tier** (shura / sabiqun / muhsinun, or none),
an **Ansar badge** on top, an optional **position**, and any number of **teams**.
Tier sets the defaults; the shura override individual permissions per person.

A null tier is a real state — "Ansar only" — not missing data.

Enforcement lives in **row-level security in Postgres**, via `has_permission()`.
The nav and the middleware only hide things and route people; neither is a
control. Do not add a route allowlist and treat it as security.
