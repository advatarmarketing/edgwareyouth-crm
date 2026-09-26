# Going live

Written for somebody who does not write code. Follow it top to bottom.
Nothing here is dangerous, and nothing here can be done by accident.

---

## Step 1 — run the last migrations

In Supabase: **SQL Editor → New query**, paste the file, press Run.
One file at a time, in this order. Each one should say "Success".

| File | What it does | If it fails |
| --- | --- | --- |
| `0016_fix_message_policy_recursion.sql` | **Run this first.** Without it, Messages is completely broken | Nothing else will work properly. Send me the error |
| `0017_media_and_development.sql` | Media planning, development pathway, resources | Send me the error |
| `0018_storage_resources.sql` | The resources file store | Send me the error |
| `0019_tighten_media_visibility.sql` | Closes a gap `0017` opened | Send me the error |
| `0020_audit_helper.sql` | Lets the audit script read the database's own settings | Optional — only the audit needs it |
| `0021_fix_audit_helper_trim.sql` | Fixes `0020`, which refused every query | Send me the error |
| `0022_notes.sql` | Notes, folders and to-do lists — and makes to-dos from notes private | Send me the error |

Then check the scheduled deletion is actually scheduled:

```sql
select jobname, schedule from cron.job;
```

You should see one row, `purge-expired-safeguarding`, running `15 3 * * *`.
**If that table is empty, the safeguarding auto-delete is not running** — go
back to `0009_pg_cron_safeguarding.sql` and follow the instructions at the top.

---

## Step 2 — check it holds together

In Terminal, from the project folder:

```bash
npm run audit:rls && npm run verify:rls && npm test && npx next build
```

What each one is for:

- **`audit:rls`** — is there any table with its protection switched off? This
  catches the failure where somebody adds a table and nobody notices.
- **`verify:rls`** — signs in as six different people and checks what each one
  can actually see. This is the one that matters most.
- **`npm test`** — the meeting-notes and mentions parsers.
- **`next build`** — does the site compile.

**All four must pass before you deploy.** If `verify:rls` reports failures,
send me the output — do not go live around them.

---

## Step 3 — put it on the internet

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New → Project**. Pick `advatarmarketing/edgwareyouth-crm`.
3. Leave every build setting alone. Vercel recognises Next.js.
4. Before you press Deploy, open **Environment Variables** and add four.
   Get the first three from Supabase → **Settings → API**:

   | Name | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The `anon` `public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` `secret` key |
   | `NEXT_PUBLIC_SITE_URL` | Your Vercel address, e.g. `https://edgwareyouth-crm.vercel.app` |

   > **The service_role key bypasses every security rule in the system.** It
   > belongs in Vercel's environment variables and in your local `.env.local`
   > file, and nowhere else — never in the repository, never in a message,
   > never in a screenshot.

5. Press **Deploy** and wait. Two or three minutes.
6. Add a fifth variable, `CRON_SECRET`, set to a long random string you make up.
   Then redeploy. The reminder job refuses to run without it.

### Tell Supabase where the site lives

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your Vercel address, e.g. `https://edgwareyouth-crm.vercel.app`
- **Redirect URLs**: add your Vercel address with `/**` on the end

**This is not optional.** When an invite asks Supabase to send somebody to an
address that is not on that list, Supabase does not refuse — it quietly sends
them to the Site URL instead. If the Site URL is still `http://localhost:3000`,
every invite lands on a page that only exists on your laptop. That is exactly
what happened to the first real invite.

Invites now go to `/welcome`, where the person creates their password. The app
also refuses to send an invite at all from a copy running on your own computer,
because the link would point back at it.

### Optional, but better: the invite email template

Supabase → **Authentication → Email Templates → Invite user**. Replace the link
with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/welcome">Accept the invite</a>
```

and in **Reset password**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/welcome">Choose a new password</a>
```

The default links work — `/welcome` handles them — but these verify the link on
the server, so the sign-in never passes through the address bar. Supabase
recommends this for sites built the way this one is.

---

## Step 4 — smoke test

Sign in as each account below and check the row next to it. Password for all
six is `TestPass123!`.

| Sign in as | Should see | Should NOT see |
| --- | --- | --- |
| `shura@test.local` | Everything. Admin, Finance totals, Permissions, the audit log | — |
| `finance-head@test.local` | Finance in full, expense claims to approve | Their own claim in the approve list |
| `sabiqun@test.local` | Events they can propose, the year plan, KPIs, their own key results | Shura minutes, individual pledges, OKR editing |
| `muhsin@test.local` | Their tasks, event basics, their own rota line, their own pledge | The year plan, OKRs, KPIs, anybody else's anything |
| `ansar-only@test.local` | The members list, their own tasks, all-staff meetings | The year plan, finance, shura meetings |
| `sabiqun-ansar@test.local` | Everything a sabiqun sees, plus anything shared with Ansar | Shura-only material |

Then, as `shura@test.local`, walk one thing end to end:

1. **Propose an event** → approve it → check the milestones appeared, dated
   backwards from the event date, on somebody's task list.
2. **Write a meeting** with an `ACTION @Name ... by 12/10` line → publish →
   check the task landed on that person with its checklist.
3. **Post an announcement** → sign in as somebody else → read it → sign back in
   and check it now says who has and has not read it.
4. **Submit an expense claim**, then try to approve your own. It must refuse.
5. **Try to move money out of the Zakat fund into General.** It must refuse.

If any of those five behaves differently, stop and tell me which one.

---

## Step 5 — before real people use it

- [ ] **Delete the six test accounts.** Supabase → Authentication → Users →
      delete every `@test.local` address. Their password is in a public
      repository, and `shura@test.local` can see everything including
      safeguarding records.
- [ ] Invite the real shura, and make sure at least two people can approve
      expense claims — otherwise nobody can approve the treasurer's.
- [ ] Read the 20 seeded SOPs. They are **drafts on purpose**. The
      safeguarding, missing-person and photo-consent ones need signing off by
      whoever holds that responsibility, and checking against what your insurer
      and the local authority require.
- [ ] Read `/app/privacy` and get it reviewed. It is accurate about what the
      system stores; it has not been checked by anyone qualified.
- [ ] **Do a DPIA.** The system holds medical details, allergies and
      safeguarding information about under-18s. That is special-category data
      under UK GDPR, and a Data Protection Impact Assessment belongs before the
      first real record goes in, not after.
- [ ] Decide who is named as the safeguarding lead, and check they can see the
      safeguarding section on a test event.
- [ ] Set the `CRON_SECRET` and confirm the reminder route returns 401 without
      it.

---

## What is not finished

Said plainly, so nothing is a surprise:

- **No email is sent.** `notify()` writes the in-app bell only. Every
  notification in the system appears in the app and nowhere else. Wiring email
  is a Resend or Supabase SMTP key plus one function.
- **Resources cannot be uploaded through the app.** The store and the
  permissions exist; the upload form does not. Add files through Supabase
  Storage for now.
- **Attachments and receipts upload but do not display.** They need a
  signed-URL route before the image shows on the page.
- **Messages do not update live.** You see new ones when the page reloads.
- **Two recalculations are manual** — the KPI refresh and the development
  recount. Both belong on the same schedule as the safeguarding purge.
- **Member photos** are not built. `avatar_url` exists and nothing sets it.
