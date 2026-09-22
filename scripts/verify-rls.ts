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

/**
 * True when the write was refused by a POLICY, rather than by anything
 * else that happens to produce an error.
 *
 * This exists because of a real false pass: while PostgREST's schema
 * cache was stale, every insert failed with "could not find the table",
 * and three "cannot do X" checks went green while proving nothing. A
 * negative check has to know WHY it failed.
 *
 * 42501 is Postgres' insufficient_privilege, which is what an RLS
 * refusal surfaces as. PGRST301/PGRST205 are PostgREST's own "no
 * permission" and "table not in schema cache" — the second is an
 * environment fault and must never read as a pass.
 */
function deniedByPolicy(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return false;
  return error.code === "42501" || /row-level security|violates row-level/i.test(error.message ?? "");
}

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
    check(
      "muhsin cannot write a member note",
      deniedByPolicy(writeError),
      writeError ? `failed, but not by policy: ${writeError.message}` : "the insert succeeded"
    );
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

    // NOT "sees nothing". The "profiles: read own" policy from 0001 is
    // OR'd with the directory policy, so somebody deactivated can still
    // read their own row — which is both harmless and necessary, since
    // routing straight after login depends on it.
    //
    // The property that actually matters is that they can no longer see
    // ANYBODY ELSE. An earlier version of this check asserted zero rows,
    // failed, and was pointing at correct behaviour.
    const { data: seen } = await sabiqun.from("member_directory").select("id");
    check(
      "an inactive member sees nobody but themselves",
      (seen ?? []).every((r) => r.id === sabiqunRow.id),
      `saw ${seen?.length ?? 0} row(s), including other people`
    );

    await admin.from("profiles").update({ is_active: true }).eq("id", sabiqunRow.id);
  }

  console.log("\n— Tasks (0003) —");

  const { data: shuraRow } = await admin
    .from("profiles")
    .select("id")
    .eq("email", ACCOUNTS.shura)
    .single();

  const { data: muhsinRow } = await admin
    .from("profiles")
    .select("id")
    .eq("email", ACCOUNTS.muhsin)
    .single();

  if (shuraRow && muhsinRow) {
    await admin.from("tasks").delete().eq("title", "rls probe task");

    // Anyone active may make themselves a task.
    const { error: ownError } = await muhsin
      .from("tasks")
      .insert({ title: "rls probe task", owner_id: muhsinRow.id, created_by: muhsinRow.id });
    check("a muhsin can create a task for themselves", ownError === null, ownError?.message ?? "");

    // Putting one on somebody else needs tasks.assign.
    const { error: assignError } = await muhsin
      .from("tasks")
      .insert({ title: "rls probe task", owner_id: shuraRow.id, created_by: muhsinRow.id });
    check(
      "a muhsin CANNOT assign a task to someone else",
      deniedByPolicy(assignError),
      assignError ? `failed, but not by policy: ${assignError.message}` : "the insert succeeded"
    );

    const { error: sabiqunAssign } = await sabiqun
      .from("tasks")
      .insert({ title: "rls probe task", owner_id: muhsinRow.id, created_by: sabiqunRow?.id });
    check("a sabiqun CAN assign a task", sabiqunAssign === null, sabiqunAssign?.message ?? "");

    // "Blocked needs a reason" is a database constraint, so it has to
    // hold against a direct write, not just against the form.
    const { error: blockedError } = await admin
      .from("tasks")
      .insert({ title: "rls probe task", status: "blocked", owner_id: muhsinRow.id });
    // Not a policy refusal — this one is the CHECK constraint, so it
    // has its own code (23514, check_violation).
    check(
      "a blocked task with no reason is rejected by the database",
      blockedError?.code === "23514",
      blockedError ? `failed, but not by the constraint: ${blockedError.message}` : "it was accepted"
    );

    // A private task of the shura's must not show up for a muhsin.
    const { data: shuraTask } = await admin
      .from("tasks")
      .insert({ title: "rls probe task", owner_id: shuraRow.id, created_by: shuraRow.id })
      .select("id")
      .single();

    if (shuraTask) {
      const { data: seenByMuhsin } = await muhsin.from("tasks").select("id").eq("id", shuraTask.id);
      check("a muhsin cannot see someone else's task", (seenByMuhsin?.length ?? 0) === 0);

      const { data: seenByShura } = await shura.from("tasks").select("id").eq("id", shuraTask.id);
      check("tasks.view_all lets the shura see it", (seenByShura?.length ?? 0) === 1);
    }

    await admin.from("tasks").delete().eq("title", "rls probe task");
  }

  console.log("\n— Notifications are private (0003) —");

  if (shuraRow) {
    await admin.from("notifications").delete().eq("title", "rls probe note");
    await admin
      .from("notifications")
      .insert({ user_id: shuraRow.id, kind: "task_new", title: "rls probe note" });

    const { data: mine } = await shura.from("notifications").select("id").eq("title", "rls probe note");
    const { data: theirs } = await muhsin.from("notifications").select("id").eq("title", "rls probe note");

    check("you read your own notifications", (mine?.length ?? 0) === 1);
    check("nobody reads anyone else's notifications", (theirs?.length ?? 0) === 0);

    // Nobody can write one for themselves either — otherwise a
    // notification proves nothing about who raised it.
    const { error: forgeError } = await muhsin
      .from("notifications")
      .insert({ user_id: shuraRow.id, kind: "task_new", title: "rls probe note" });
    check(
      "nobody can raise a notification for someone else",
      deniedByPolicy(forgeError),
      forgeError ? `failed, but not by policy: ${forgeError.message}` : "the insert succeeded"
    );

    await admin.from("notifications").delete().eq("title", "rls probe note");
  }

  console.log("\n— SOP visibility (0005) —");

  // Titles from scripts/seed-sops.ts. Each is a different visibility
  // shape, which is the point of testing these three specifically.
  const EVERYONE_SOP = "Venue set-up and pack-down";        // visible_to_all
  const MEDIA_SOP = "Social media posting and approval";    // shura + media team
  const FINANCE_SOP = "Handling cash and mosque collections"; // shura + finance team

  const titles = [EVERYONE_SOP, MEDIA_SOP, FINANCE_SOP];

  const { data: sopRows } = await admin.from("sops").select("id, title, status").in("title", titles);
  const sopId = new Map((sopRows ?? []).map((r) => [r.title, r.id]));

  async function sees(client: SupabaseClient<Database>, title: string): Promise<boolean> {
    const id = sopId.get(title);
    if (!id) return false;
    const { data } = await client.from("sops").select("id").eq("id", id);
    return (data?.length ?? 0) === 1;
  }

  // Everything seeds as a draft, and a draft is visible only to
  // sops.manage — so this is the state to check before publishing.
  check("a draft SOP is invisible to a muhsin", !(await sees(muhsin, EVERYONE_SOP)));
  check("a draft SOP is invisible to a sabiqun", !(await sees(sabiqun, EVERYONE_SOP)));
  check("someone with sops.manage sees drafts", await sees(shura, EVERYONE_SOP));

  // Publish the three and re-check. Reverted at the end so the library
  // is left exactly as the seed made it.
  await admin.from("sops").update({ status: "published" }).in("title", titles);

  check("a published everyone-SOP reaches a muhsin", await sees(muhsin, EVERYONE_SOP));
  check("a published everyone-SOP reaches an ansar-only member", await sees(ansarOnly, EVERYONE_SOP));

  // The sabiqun test account is in the media team; the muhsin is in no
  // team at all.
  check("the media-team SOP reaches the sabiqun who is in media", await sees(sabiqun, MEDIA_SOP));
  check("the media-team SOP does NOT reach a muhsin", !(await sees(muhsin, MEDIA_SOP)));

  // The one that matters most: cash handling must not be readable by
  // somebody outside finance, whatever their tier.
  check("the finance-team SOP does NOT reach a sabiqun outside finance", !(await sees(sabiqun, FINANCE_SOP)));
  check("the finance-team SOP does NOT reach a muhsin", !(await sees(muhsin, FINANCE_SOP)));
  check("the finance-team SOP does NOT reach an ansar-only member", !(await sees(ansarOnly, FINANCE_SOP)));

  // Named-person visibility, on top of tier and team.
  if (muhsinRow && sopId.get(FINANCE_SOP)) {
    await admin
      .from("sop_visible_people")
      .insert({ sop_id: sopId.get(FINANCE_SOP)!, profile_id: muhsinRow.id });

    check("naming a person individually lets them see it", await sees(muhsin, FINANCE_SOP));

    await admin
      .from("sop_visible_people")
      .delete()
      .eq("sop_id", sopId.get(FINANCE_SOP)!)
      .eq("profile_id", muhsinRow.id);

    check("removing them again takes it away", !(await sees(muhsin, FINANCE_SOP)));
  }

  // Nobody but a manager may edit one.
  //
  // Note this does NOT assert an error. An UPDATE that no row passes
  // the policy for affects zero rows and returns success — Postgres
  // does not distinguish "you may not" from "nothing matched". So the
  // only honest check is that the row is unchanged afterwards, read
  // back with the service role.
  await sabiqun.from("sops").update({ title: "hijacked" }).eq("id", sopId.get(EVERYONE_SOP)!);

  const { data: afterWrite } = await admin
    .from("sops")
    .select("title")
    .eq("id", sopId.get(EVERYONE_SOP)!)
    .single();

  check(
    "a sabiqun cannot edit an SOP",
    afterWrite?.title === EVERYONE_SOP,
    `the title is now "${afterWrite?.title}"`
  );

  await admin.from("sops").update({ status: "draft" }).in("title", titles);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

verify().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
