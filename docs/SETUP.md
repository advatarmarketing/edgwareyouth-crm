# Connecting Supabase and Vercel — exact steps

Written to be followed without knowing what any of it means. Do part 1 before
part 2. Nothing here costs money on the free tiers.

---

## Part 1 — Supabase (the database and the logins)

**1. Make the project**

1. Go to `supabase.com` and sign in.
2. Click **New project**.
3. Organisation: whichever one you have. Name: `edgware-youth-crm`.
4. **Database Password**: click Generate, then copy it into your password
   manager. You will not be shown it again. You don't need it day to day, but
   you cannot recover it.
5. Region: **London (eu-west-2)**. Closest to you, and it keeps the data in the
   UK, which matters given what this system will hold.
6. Click **Create new project** and wait about two minutes.

**2. Copy the three keys**

1. Left sidebar, bottom: **Project Settings** (the cog).
2. Click **Data API**. Copy the **Project URL**.
3. Click **API Keys**. Copy the **anon / public** key, then reveal and copy the
   **service_role** key.

The service_role key ignores every security rule in the database. Treat it like
the master key to the building: never paste it into a chat, a browser, or any
file that isn't `.env.local`.

**3. Put them in the project**

In the project folder, copy `.env.example` to a new file called `.env.local`,
then fill in the three values you just copied. `.env.local` is already ignored
by git, so it cannot be committed by accident.

**4. Create the tables**

1. In Supabase, left sidebar: **SQL Editor**.
2. Click **New query**.
3. Open `supabase/migrations/0001_profiles.sql` in the project, copy all of it,
   paste it in, click **Run**.
4. You should see "Success. No rows returned." That is correct — it built
   tables, it didn't fetch anything.

**5. Turn off public sign-ups**

This is a staff-only CRM, so nobody should be able to create their own account.

1. **Authentication** → **Sign In / Providers**.
2. Find **Allow new users to sign up** and switch it **off**.

Accounts are created by the shura inviting people, which Prompt 1 builds.

**6. Make the test logins**

Back in the project folder, run:

```bash
npm run seed:test-accounts
```

Then check the security rules actually hold:

```bash
npm run verify:rls
```

Every line should start with a tick. A cross means a rule is wrong — stop and
fix it before building anything on top.

**7. Run it**

```bash
npm run dev
```

Open `http://localhost:3000`, sign in as `shura@test.local` with the password
`TestPass123!`. You should land on the dashboard with the Edgware Youth logo in
the bar and the tier shown under your name.

---

## Part 2 — Vercel (putting it on the internet)

Do this once the app does something worth looking at. It is not needed to keep
building.

1. Go to `vercel.com`, sign in **with GitHub**.
2. **Add New** → **Project**.
3. Find `advatarmarketing/edgwareyouth-crm` and click **Import**.
4. Framework Preset should already say **Next.js**. Leave everything alone.
5. Expand **Environment Variables** and add all four from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` — set this to the address Vercel gives you, e.g.
     `https://edgwareyouth-crm.vercel.app`
6. Click **Deploy** and wait a couple of minutes.

**7. Tell Supabase about the new address**

Otherwise sign-in links bounce people back to localhost.

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: your Vercel address.
3. **Redirect URLs**: add your Vercel address with `/**` on the end.

**8. Check it**

Open the Vercel address, sign in as `shura@test.local`, confirm you land on the
dashboard.

---

## Before real people use this

- Delete every `@test.local` account.
- Replace `lib/supabase/types.ts` with generated types (the file says how).
- Make the GitHub repo private.
- Do the data protection work in section 5 of the spec — this system will hold
  medical, allergy and safeguarding information about under-18s, which is
  special-category data under UK GDPR. A DPIA is the normal step for that, and
  it belongs before go-live, not after.
