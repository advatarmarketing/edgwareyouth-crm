/**
 * Proves the access matrix in section 3 of docs/SPEC.md actually holds
 * — by signing in as each test account and looking at what comes back,
 * not by reading the policies and believing them.
 *
 * Run it after every migration that touches access. A failure here is
 * the difference between "the nav hides finance" and "a muhsin cannot
 * read the finance tables", which is the only one that matters.
 *
 *   npm run verify:rls
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type { Database, PermissionKey } from "../lib/supabase/types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase keys in .env.local (need URL, anon and service_role).");
  process.exit(1);
}

const PASSWORD = "TestPass123!";

const ACCOUNTS = {
  shura: "shura@test.local",
  financeHead: "finance-head@test.local",
  sabiqun: "sabiqun@test.local",
  muhsin: "muhsin@test.local",
  ansarOnly: "ansar-only@test.local",
  sabiqunAnsar: "sabiqun-ansar@test.local",
} as const;

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`${passed ? "✓" : "✗"} ${name}${passed || !detail ? "" : ` — ${detail}`}`);
  if (!passed) failures += 1;
}

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return client;
}

async function can(client: SupabaseClient<Database>, key: PermissionKey): Promise<boolean> {
  const { data } = await client.rpc("has_permission", { p_key: key });
  return data === true;
}

async function verify() {
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const shura = await signIn(ACCOUNTS.shura);
  const sabiqun = await signIn(ACCOUNTS.sabiqun);
  const muhsin = await signIn(ACCOUNTS.muhsin);
  const ansarOnly = await signIn(ACCOUNTS.ansarOnly);
  const sabiqunAnsar = await signIn(ACCOUNTS.sabiqunAnsar);

  console.log("\n— Tier defaults —");

  check("shura has members.manage", await can(shura, "members.manage"));
  check("shura has finance.view_individual", await can(shura, "finance.view_individual"));
  check("shura has permissions.manage", await can(shura, "permissions.manage"));

  check("sabiqun has events.propose", await can(sabiqun, "events.propose"));
  check("sabiqun does NOT have events.approve", !(await can(sabiqun, "events.approve")));
  check("sabiqun does NOT have finance.view_totals", !(await can(sabiqun, "finance.view_totals")));
  check("sabiqun does NOT have finance.view_individual", !(await can(sabiqun, "finance.view_individual")));
  check("sabiqun does NOT have meetings.view_shura", !(await can(sabiqun, "meetings.view_shura")));

  check("muhsin has members.view_directory", await can(muhsin, "members.view_directory"));
  check("muhsin does NOT have members.view_contact", !(await can(muhsin, "members.view_contact")));
  check("muhsin does NOT have tasks.assign", !(await can(muhsin, "tasks.assign")));

  console.log("\n— The two shapes that are easy to get wrong —");

  // A null tier must not read as "no permissions at all".
  check("ansar-only has members.view_directory", await can(ansarOnly, "members.view_directory"));
  check("ansar-only does NOT have tasks.assign", !(await can(ansarOnly, "tasks.assign")));

  // The badge unions with the tier rather than replacing it.
  check("sabiqun+ansar keeps events.propose", await can(sabiqunAnsar, "events.propose"));
  check("sabiqun+ansar keeps members.view_contact", await can(sabiqunAnsar, "members.view_contact"));

  console.log("\n— Column masking in member_directory —");

  const { data: muhsinView } = await muhsin.from("member_directory").select("full_name, phone, email, dbs_status");
  check("muhsin sees names in the directory", (muhsinView?.length ?? 0) > 0, "saw nothing");
  check(
    "muhsin sees NO phone numbers",
    (muhsinView ?? []).every((r) => r.phone === null),
    "a phone number came through"
  );
  check(
    "muhsin sees NO DBS status",
    (muhsinView ?? []).every((r) => r.dbs_status === null),
    "DBS status came through"
  );

  const { data: sabiqunView } = await sabiqun.from("member_directory").select("phone, dbs_status");
  check(
    "sabiqun sees NO DBS status",
    (sabiqunView ?? []).every((r) => r.dbs_status === null),
    "DBS status came through"
  );

  console.log("\n— Private notes are shura-only —");

  const { data: shuraTarget } = await admin
    .from("profiles")
    .select("id")
    .eq("email", ACCOUNTS.muhsin)
    .single();

  if (shuraTarget) {
    await admin.from("member_notes").delete().eq("profile_id", shuraTarget.id);
    await admin.from("member_notes").insert({ profile_id: shuraTarget.id, body: "rls probe" });

    const { data: shuraNotes } = await shura.from("member_notes").select("id");
    const { data: muhsinNotes } = await muhsin.from("member_notes").select("id");
    const { data: sabiqunNotes } = await sabiqun.from("member_notes").select("id");

    check("shura reads member notes", (shuraNotes?.length ?? 0) > 0, "saw none");
    check("muhsin reads NO member notes", (muhsinNotes?.length ?? 0) === 0, `saw ${muhsinNotes?.length}`);
    check("sabiqun reads NO member notes", (sabiqunNotes?.length ?? 0) === 0, `saw ${sabiqunNotes?.length}`);

    // A muhsin must not be able to write one either.
    const { error: writeError } = await muhsin
      .from("member_notes")
      .insert({ profile_id: shuraTarget.id, body: "should be blocked" });
    check("muhsin cannot write a member note", writeError !== null, "the insert succeeded");
  }

  console.log("\n— Per-person overrides —");

  const { data: sabiqunRow } = await admin
    .from("profiles")
    .select("id")
    .eq("email", ACCOUNTS.sabiqun)
    .single();

  if (sabiqunRow) {
    // Grant something the tier does not give.
    await admin.from("profile_permissions").upsert({
      profile_id: sabiqunRow.id,
      permission_key: "finance.view_totals",
      granted: true,
    });
    check("override GRANTS finance.view_totals to a sabiqun", await can(sabiqun, "finance.view_totals"));

    // And revoke something the tier does give — the case a
    // row-means-allow design cannot express.
    await admin.from("profile_permissions").upsert({
      profile_id: sabiqunRow.id,
      permission_key: "events.propose",
      granted: false,
    });
    check("override REVOKES events.propose from a sabiqun", !(await can(sabiqun, "events.propose")));

    // An override must never widen someone beyond it.
    check(
      "the granted sabiqun still cannot see individual contributions",
      !(await can(sabiqun, "finance.view_individual"))
    );

    await admin.from("profile_permissions").delete().eq("profile_id", sabiqunRow.id);
    check("clearing the override restores the tier default", await can(sabiqun, "events.propose"));
  }

  console.log("\n— Deactivating somebody actually stops them —");

  if (sabiqunRow) {
    await admin.from("profiles").update({ is_active: false }).eq("id", sabiqunRow.id);
    check("an inactive member has no permissions", !(await can(sabiqun, "events.propose")));
    check("an inactive member reads no directory", ((await sabiqun.from("member_directory").select("id")).data?.length ?? 0) === 0);
    await admin.from("profiles").update({ is_active: true }).eq("id", sabiqunRow.id);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

verify().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
