/**
 * Seeds one test login per tier, plus the two combinations that are
 * easy to get wrong: "Ansar only" (no tier) and "Sabiqun + Ansar".
 *
 * Prompt 1 extends this with positions, teams, nicknames and the
 * per-person permission overrides, and extends verify-rls.ts to prove
 * each account sees exactly what section 3 of docs/SPEC.md allows.
 *
 * Needs the service-role key — it creates auth users. Never ship this
 * key to the browser and never run this against production once real
 * people exist.
 *
 *   npm run seed:test-accounts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database, Tier } from "../lib/supabase/types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TestAccount {
  email: string;
  password: string;
  full_name: string;
  tier: Tier | null;
  is_ansar: boolean;
}

const ACCOUNTS: TestAccount[] = [
  { email: "shura@test.local", password: "TestPass123!", full_name: "Test Shura", tier: "shura", is_ansar: false },
  { email: "sabiqun@test.local", password: "TestPass123!", full_name: "Test Sabiqun", tier: "sabiqun", is_ansar: false },
  { email: "muhsin@test.local", password: "TestPass123!", full_name: "Test Muhsin", tier: "muhsinun", is_ansar: false },
  // The two shapes section 2 warns about.
  { email: "ansar-only@test.local", password: "TestPass123!", full_name: "Test Ansar Only", tier: null, is_ansar: true },
  { email: "sabiqun-ansar@test.local", password: "TestPass123!", full_name: "Test Sabiqun Ansar", tier: "sabiqun", is_ansar: true },
];

async function seed() {
  for (const account of ACCOUNTS) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.full_name },
    });

    let userId = created?.user?.id;

    // Already there from a previous run — find them rather than fail.
    if (createError) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list?.users.find((u) => u.email === account.email)?.id;

      if (!userId) {
        console.error(`✗ ${account.email}: ${createError.message}`);
        continue;
      }
    }

    // The on_auth_user_created trigger has already made the profile
    // row; this sets the fields the trigger cannot know.
    const { error: updateError } = await admin
      .from("profiles")
      .update({ full_name: account.full_name, tier: account.tier, is_ansar: account.is_ansar })
      .eq("id", userId!);

    if (updateError) {
      console.error(`✗ ${account.email}: ${updateError.message}`);
      continue;
    }

    const label = account.tier ?? "ansar only";
    console.log(`✓ ${account.email} — ${label}${account.is_ansar && account.tier ? " + ansar" : ""}`);
  }

  console.log("\nAll test accounts use the password: TestPass123!");
  console.log("Delete them before go-live — Prompt 10 reminds you again.");
}

seed();
