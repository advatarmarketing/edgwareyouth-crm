/**
 * Proves the row-level security policies actually hold, by signing in
 * as each test account and checking what comes back — not by reading
 * the policy SQL and believing it.
 *
 * Phase 0 checks the only rule that exists yet: you can read your own
 * profile and nobody else's. Prompt 1 extends this to every row of the
 * access matrix in section 3 of docs/SPEC.md.
 *
 *   npm run verify:rls
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database } from "../lib/supabase/types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const EMAILS = [
  "shura@test.local",
  "sabiqun@test.local",
  "muhsin@test.local",
  "ansar-only@test.local",
  "sabiqun-ansar@test.local",
];

const PASSWORD = "TestPass123!";

let failures = 0;

function check(name: string, passed: boolean, detail: string) {
  console.log(`${passed ? "✓" : "✗"} ${name}${passed ? "" : ` — ${detail}`}`);
  if (!passed) failures += 1;
}

async function verify() {
  for (const email of EMAILS) {
    const supabase = createClient<Database>(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });

    if (signInError || !signIn.user) {
      check(`${email} signs in`, false, signInError?.message ?? "no user");
      continue;
    }

    const { data: rows, error } = await supabase.from("profiles").select("id, tier, is_ansar");

    if (error) {
      check(`${email} reads profiles`, false, error.message);
      continue;
    }

    // The only Phase 0 policy: "profiles: read own". Exactly one row,
    // and it must be this user's. More than one means the policy is
    // wider than intended — which is the failure worth catching.
    check(
      `${email} sees only their own profile`,
      rows?.length === 1 && rows[0].id === signIn.user.id,
      `saw ${rows?.length ?? 0} row(s)`
    );

    await supabase.auth.signOut();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

verify();
