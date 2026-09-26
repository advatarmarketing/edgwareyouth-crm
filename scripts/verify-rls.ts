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

  console.log("\n— Minutes visibility (0006) —");

  if (shuraRow && sabiqunRow && muhsinRow) {
    await admin.from("meetings").delete().like("title", "rls probe%");

    async function makeMeeting(title: string, visibility: string, minuteTaker?: string) {
      const { data } = await admin
        .from("meetings")
        .insert({
          title,
          meeting_type: "probe",
          meeting_date: "2026-10-07",
          minutes_visibility: visibility as never,
          chair_id: shuraRow!.id,
          minute_taker_id: minuteTaker ?? shuraRow!.id,
        })
        .select("id")
        .single();
      return data!.id;
    }

    async function seesMeeting(client: SupabaseClient<Database>, id: string) {
      const { data } = await client.from("meetings").select("id").eq("id", id);
      return (data?.length ?? 0) === 1;
    }

    // Regression test for 0007.
    //
    // `insert ... returning` makes Postgres evaluate the SELECT policy
    // too. When that policy called a function which re-queried the same
    // table, the just-inserted row was invisible to it and the whole
    // statement was rejected — with an error naming the INSERT, which
    // sent the debugging in entirely the wrong direction. Creating a
    // meeting and reading the id back is exactly what the app does, so
    // this is the shape that has to be tested.
    const { data: returned, error: returningError } = await shura
      .from("meetings")
      .insert({
        title: "rls probe returning",
        meeting_type: "probe",
        meeting_date: "2026-10-07",
        chair_id: shuraRow.id,
        minute_taker_id: shuraRow.id,
        minutes_visibility: "shura",
      })
      .select("id")
      .single();

    check(
      "creating a meeting and reading its id back works",
      returningError === null && !!returned?.id,
      returningError?.message ?? "no id came back"
    );

    // The same shape on sops, which had the identical bug.
    const { data: sopReturned, error: sopReturningError } = await shura
      .from("sops")
      .insert({ title: "rls probe sop", category: "probe" })
      .select("id")
      .single();

    check(
      "creating an SOP and reading its id back works",
      sopReturningError === null && !!sopReturned?.id,
      sopReturningError?.message ?? "no id came back"
    );

    await admin.from("sops").delete().eq("category", "probe");

    const shuraOnly = await makeMeeting("rls probe shura", "shura");
    check("a shura-only meeting is visible to the shura", await seesMeeting(shura, shuraOnly));
    check("a shura-only meeting is NOT visible to a sabiqun", !(await seesMeeting(sabiqun, shuraOnly)));
    check("a shura-only meeting is NOT visible to a muhsin", !(await seesMeeting(muhsin, shuraOnly)));

    const attendeesOnly = await makeMeeting("rls probe attendees", "attendees");
    check("an attendees-only meeting is NOT visible to a non-attendee", !(await seesMeeting(sabiqun, attendeesOnly)));

    await admin.from("meeting_attendees").insert({ meeting_id: attendeesOnly, profile_id: sabiqunRow.id });
    check("adding them as an attendee makes it visible", await seesMeeting(sabiqun, attendeesOnly));
    check("it is still NOT visible to a muhsin who was not there", !(await seesMeeting(muhsin, attendeesOnly)));

    const allStaff = await makeMeeting("rls probe all staff", "all_staff");
    check("an all-staff meeting is visible to a muhsin", await seesMeeting(muhsin, allStaff));
    check("an all-staff meeting is visible to an ansar-only member", await seesMeeting(ansarOnly, allStaff));

    // A minute-taker who is not shura must still be able to write up a
    // shura meeting they were asked to take notes for.
    const delegated = await makeMeeting("rls probe delegated", "shura", muhsinRow.id);
    check("a non-shura minute-taker can see the shura meeting they are writing up", await seesMeeting(muhsin, delegated));

    const { data: canRun } = await muhsin.rpc("can_run_meeting", { p_meeting_id: delegated });
    check("and can run it", canRun === true);

    const { data: cannotRun } = await sabiqun.rpc("can_run_meeting", { p_meeting_id: allStaff });
    check("but somebody merely attending cannot run it", cannotRun !== true);

    // Unresolved lines are working material and may hold half-written
    // notes about people. Only the people running the meeting see them.
    await admin
      .from("meeting_unresolved")
      .insert({ meeting_id: allStaff, line: "ACTION @Nobody: x", reason: "probe" });

    const { data: seenByAttendee } = await sabiqun.from("meeting_unresolved").select("id").eq("meeting_id", allStaff);
    check("unresolved lines are hidden from someone who only attended", (seenByAttendee?.length ?? 0) === 0);

    const { data: seenByRunner } = await shura.from("meeting_unresolved").select("id").eq("meeting_id", allStaff);
    check("but visible to whoever is running it", (seenByRunner?.length ?? 0) === 1);

    await admin.from("meetings").delete().like("title", "rls probe%");
  }

  console.log("\n— Finance: the zakat rule (0011) —");

  {
    // Run as the SERVICE ROLE on purpose. It bypasses every RLS policy,
    // so if the rule still holds here it is genuinely in the database
    // rather than in a policy somebody could be given an exemption from.
    // This is the check the spec asks for by name.
    const { data: zakat } = await admin.from("funds").select("id").eq("key", "zakat").single();
    const { data: general } = await admin.from("funds").select("id").eq("key", "general").single();

    await admin.from("funds").delete().eq("key", "zakat-probe");
    const { data: zakat2 } = await admin
      .from("funds")
      .insert({ key: "zakat-probe", name: "Zakat probe", kind: "zakat", position: 99 })
      .select("id")
      .single();

    if (zakat && general && zakat2) {
      const { error: blocked } = await admin.from("fund_transfers").insert({
        from_fund_id: zakat.id, to_fund_id: general.id, amount: 10,
      });
      check(
        "zakat CANNOT be moved into general, even by the service role",
        /zakat cannot be moved/i.test(blocked?.message ?? ""),
        blocked ? blocked.message : "the write was accepted",
      );

      const { error: allowed } = await admin.from("fund_transfers").insert({
        from_fund_id: zakat.id, to_fund_id: zakat2.id, amount: 10,
      });
      check("but zakat CAN be moved into another zakat fund", !allowed, allowed?.message);

      // The way round the rule, closed: transfer zakat -> zakat, then
      // relabel the destination as general.
      const { error: relabel } = await admin
        .from("funds")
        .update({ kind: "general" })
        .eq("id", zakat2.id);
      check(
        "a fund that has money against it cannot change what kind it is",
        /cannot be changed/i.test(relabel?.message ?? ""),
        relabel ? relabel.message : "the relabel was accepted",
      );

      await admin.from("fund_transfers").delete().eq("to_fund_id", zakat2.id);
      await admin.from("funds").delete().eq("id", zakat2.id);
    }

    // No account numbers, anywhere.
    if (general) {
      const { error: cardNumber } = await admin.from("finance_transactions").insert({
        fund_id: general.id, direction: "in", amount: 5,
        description: "paid into 12345678901234567",
      });
      check(
        "a description containing a long account number is refused",
        (cardNumber?.code ?? "") === "23514",
        cardNumber ? `${cardNumber.code}: ${cardNumber.message}` : "it was stored",
      );

      const { error: oneCounter } = await admin.from("finance_transactions").insert({
        fund_id: general.id, direction: "in", amount: 5, source: "collection",
        description: "rls probe collection",
      });
      check(
        "a collection with fewer than two named counters is refused",
        (oneCounter?.code ?? "") === "23514",
        oneCounter ? `${oneCounter.code}: ${oneCounter.message}` : "it was stored",
      );
    }
  }

  console.log("\n— Finance: nobody approves their own claim (0011) —");

  {
    const { data: shuraProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.shura).single();
    const { data: financeProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.financeHead).single();

    if (shuraProfile && financeProfile) {
      await admin.from("expense_claims").delete().like("description", "rls probe%");

      const { data: own } = await admin
        .from("expense_claims")
        .insert({
          claimant_id: shuraProfile.id, amount: 20, spent_on: "2026-09-01",
          description: "rls probe own claim",
        })
        .select("id")
        .single();

      if (own) {
        // As the claimant, through RLS.
        const { error: selfApprove } = await shura
          .from("expense_claims")
          .update({ status: "approved", decided_by: shuraProfile.id, decided_at: new Date().toISOString() })
          .eq("id", own.id);
        check(
          "a shura member cannot approve their own claim",
          selfApprove != null,
          selfApprove ? "" : "the approval went through",
        );

        // And as the service role, which proves the CHECK constraint is
        // doing it rather than the policy.
        const { error: godApprove } = await admin
          .from("expense_claims")
          .update({ status: "approved", decided_by: shuraProfile.id })
          .eq("id", own.id);
        check(
          "not even the service role can — it is a CHECK constraint",
          (godApprove?.code ?? "") === "23514",
          godApprove ? `${godApprove.code}: ${godApprove.message}` : "the approval went through",
        );

        // Forging somebody else's approval, which the constraint alone
        // would allow. The RLS policy's WITH CHECK is what stops it.
        const { error: forged } = await shura
          .from("expense_claims")
          .update({ status: "approved", decided_by: financeProfile.id })
          .eq("id", own.id);
        check(
          "nor can they record the approval in somebody else's name",
          forged != null,
          forged ? "" : "the forged approval went through",
        );

        // Somebody else approving it is fine.
        const financeHead = await signIn(ACCOUNTS.financeHead);
        const { error: proper } = await financeHead
          .from("expense_claims")
          .update({ status: "approved", decided_by: financeProfile.id, decided_at: new Date().toISOString() })
          .eq("id", own.id);
        check("but another shura member can approve it", !proper, proper?.message);

        await admin.from("expense_claims").delete().like("description", "rls probe%");
      }
    }
  }

  console.log("\n— Finance: totals are not the same as individuals (0011) —");

  {
    const { data: muhsinProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.muhsin).single();
    const { data: sabiqunProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.sabiqun).single();
    const { data: general } = await admin.from("funds").select("id").eq("key", "general").single();

    if (muhsinProfile && sabiqunProfile && general) {
      await admin.from("pledges").delete().like("note", "rls probe%");
      await admin.from("donors").delete().like("name", "rls probe%");

      await admin.from("pledges").insert([
        { profile_id: muhsinProfile.id, fund_id: general.id, amount: 10, note: "rls probe muhsin" },
        { profile_id: sabiqunProfile.id, fund_id: general.id, amount: 20, note: "rls probe sabiqun" },
      ]);
      await admin.from("donors").insert([
        { owner_id: muhsinProfile.id, name: "rls probe donor of muhsin" },
        { owner_id: sabiqunProfile.id, name: "rls probe donor of sabiqun" },
      ]);

      // Give the sabiqun finance.view_totals for the length of this
      // check. This is THE distinction the spec asks about: seeing the
      // totals is not the same as seeing what each person gives.
      await admin.from("profile_permissions").upsert(
        { profile_id: sabiqunProfile.id, permission_key: "finance.view_totals", granted: true },
        { onConflict: "profile_id,permission_key" },
      );

      const withTotals = await signIn(ACCOUNTS.sabiqun);
      check("the sabiqun now has finance.view_totals", await can(withTotals, "finance.view_totals"));
      check(
        "and does NOT have finance.view_individual",
        !(await can(withTotals, "finance.view_individual")),
      );

      const { data: theirPledges } = await withTotals.from("pledges").select("id, profile_id");
      check(
        "a sabiqun with finance.view_totals sees only their OWN pledge",
        (theirPledges ?? []).every((p) => p.profile_id === sabiqunProfile.id),
        `saw ${theirPledges?.length ?? 0} rows`,
      );

      const { data: theirDonors } = await withTotals.from("donors").select("id, owner_id");
      check(
        "and only their own donor list",
        (theirDonors ?? []).every((d) => d.owner_id === sabiqunProfile.id),
        `saw ${theirDonors?.length ?? 0} rows`,
      );

      const { data: balances } = await withTotals.from("fund_balances").select("fund_id");
      check("but can see the fund balances", (balances?.length ?? 0) > 0);

      await admin
        .from("profile_permissions")
        .delete()
        .eq("profile_id", sabiqunProfile.id)
        .eq("permission_key", "finance.view_totals");

      const { data: muhsinPledges } = await muhsin.from("pledges").select("id, profile_id");
      check(
        "a muhsin sees only their own pledge",
        (muhsinPledges ?? []).length === 1 && muhsinPledges![0].profile_id === muhsinProfile.id,
        `saw ${muhsinPledges?.length ?? 0} rows`,
      );

      const { data: muhsinDonors } = await muhsin.from("donors").select("id, owner_id");
      check(
        "and only their own donor list",
        (muhsinDonors ?? []).every((d) => d.owner_id === muhsinProfile.id),
        `saw ${muhsinDonors?.length ?? 0} rows`,
      );

      const { data: shuraPledges } = await shura.from("pledges").select("id");
      check("a shura member sees everyone's", (shuraPledges?.length ?? 0) >= 2);

      await admin.from("pledges").delete().like("note", "rls probe%");
      await admin.from("donors").delete().like("name", "rls probe%");
    }
  }

  console.log("\n— Strategy: VMV, year plan, OKRs, KPIs (0013) —");

  {
    const { data: sabiqunProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.sabiqun).single();
    const { data: muhsinProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.muhsin).single();

    // VMV is the one part of the strategy everybody reads.
    const { data: vmvMuhsin } = await muhsin.from("org_statements").select("key");
    check("a muhsin can read the vision and mission", (vmvMuhsin?.length ?? 0) >= 3);
    const { data: vmvAnsar } = await ansarOnly.from("org_statements").select("key");
    check("so can an ansar-only member", (vmvAnsar?.length ?? 0) >= 3);

    // An UPDATE that RLS filters out matches no rows and returns NO
    // error, so "did it error" proves nothing here. The only honest
    // check is whether the text actually changed.
    await sabiqun.from("org_statements").update({ body: "rls probe" }).eq("key", "vision");
    const { data: stillThere } = await admin
      .from("org_statements").select("body").eq("key", "vision").single();
    check(
      "a sabiqun cannot rewrite the vision",
      stillThere?.body === "Young Muslims revive Islam & reform Edgware (Muslim) Society",
      `it now reads: ${stillThere?.body}`,
    );

    // The year plan: sabiqun by tier, others "only if invited".
    await admin.from("year_plan_goals").delete().like("title", "rls probe%");
    await admin.from("year_plan_goals").insert({
      year: new Date().getFullYear(), quarter: 1, title: "rls probe goal",
    });

    const { data: planSabiqun } = await sabiqun.from("year_plan_goals").select("id");
    check("a sabiqun sees the year plan", (planSabiqun?.length ?? 0) >= 1);

    const { data: planMuhsin } = await muhsin.from("year_plan_goals").select("id");
    check("a muhsin does NOT", (planMuhsin?.length ?? 0) === 0);

    if (muhsinProfile) {
      // "Only if invited" — the shura grant it per person.
      await admin.from("profile_permissions").upsert(
        { profile_id: muhsinProfile.id, permission_key: "yearplan.view", granted: true },
        { onConflict: "profile_id,permission_key" },
      );
      const invited = await signIn(ACCOUNTS.muhsin);
      const { data: planInvited } = await invited.from("year_plan_goals").select("id");
      check("unless the shura invite them, and then they do", (planInvited?.length ?? 0) >= 1);

      await admin.from("profile_permissions")
        .delete().eq("profile_id", muhsinProfile.id).eq("permission_key", "yearplan.view");
    }

    // OKRs.
    await admin.from("objectives").delete().like("title", "rls probe%");
    const { data: objective } = await admin
      .from("objectives")
      .insert({ title: "rls probe objective", year: new Date().getFullYear() })
      .select("id")
      .single();

    if (objective && sabiqunProfile && muhsinProfile) {
      const { data: ownKr } = await admin
        .from("key_results")
        .insert({
          objective_id: objective.id, title: "rls probe own kr",
          target_value: 100, start_value: 0, current_value: 10,
          owner_id: sabiqunProfile.id,
        })
        .select("id")
        .single();

      const { data: otherKr } = await admin
        .from("key_results")
        .insert({
          objective_id: objective.id, title: "rls probe other kr",
          target_value: 100, start_value: 0, current_value: 10,
          owner_id: muhsinProfile.id,
        })
        .select("id")
        .single();

      const { data: okrMuhsin } = await muhsin.from("objectives").select("id");
      check("a muhsin cannot see OKRs at all", (okrMuhsin?.length ?? 0) === 0);

      const { data: okrSabiqun } = await sabiqun.from("objectives").select("id");
      check("a sabiqun can", (okrSabiqun?.length ?? 0) >= 1);

      if (ownKr) {
        const { error: ownUpdate } = await sabiqun
          .from("key_results").update({ current_value: 42 }).eq("id", ownKr.id);
        check("a sabiqun can move the key result they own", !ownUpdate, ownUpdate?.message);

        const { data: moved } = await admin
          .from("key_results").select("current_value").eq("id", ownKr.id).single();
        check("and the value actually changed", Number(moved?.current_value) === 42);

        // The WITH CHECK: updating it must not also hand it away.
        const { error: reassign } = await sabiqun
          .from("key_results").update({ owner_id: muhsinProfile.id }).eq("id", ownKr.id);
        const { data: stillOwned } = await admin
          .from("key_results").select("owner_id").eq("id", ownKr.id).single();
        check(
          "but cannot hand their own missed target to somebody else",
          stillOwned?.owner_id === sabiqunProfile.id,
          reassign ? "" : "the reassignment went through",
        );
      }

      if (otherKr) {
        const { error: otherUpdate } = await sabiqun
          .from("key_results").update({ current_value: 99 }).eq("id", otherKr.id);
        const { data: untouched } = await admin
          .from("key_results").select("current_value").eq("id", otherKr.id).single();
        check(
          "and cannot move somebody else's",
          Number(untouched?.current_value) === 10,
          otherUpdate ? "" : "the update went through",
        );
      }

      await admin.from("objectives").delete().eq("id", objective.id);
    }

    // KPIs: sabiqun view, muhsinun none.
    const { data: kpiSabiqun } = await sabiqun.from("kpis").select("id");
    check("a sabiqun can see the KPIs", (kpiSabiqun?.length ?? 0) >= 1);

    const { data: kpiMuhsin } = await muhsin.from("kpis").select("id");
    check("a muhsin cannot", (kpiMuhsin?.length ?? 0) === 0);

    // A human's number survives a recalculation. This is the rule the
    // whole KPI design rests on, so it is worth proving rather than
    // trusting the `where kpi_values.is_auto` clause by eye.
    const { data: donationsKpi } = await admin
      .from("kpis").select("id").eq("key", "monthly_donations").single();
    if (donationsKpi) {
      const period = "2020-01-01";
      await admin.from("kpi_values").delete().eq("kpi_id", donationsKpi.id).eq("period", period);
      await admin.from("kpi_values").insert({
        kpi_id: donationsKpi.id, period, value: 777, is_auto: false, note: "rls probe manual",
      });

      await admin.rpc("refresh_auto_kpis", { p_period: period });

      const { data: afterRefresh } = await admin
        .from("kpi_values").select("value, is_auto")
        .eq("kpi_id", donationsKpi.id).eq("period", period).maybeSingle();
      check(
        "a number typed in by hand survives a recalculation",
        Number(afterRefresh?.value) === 777 && afterRefresh?.is_auto === false,
        `it now reads ${afterRefresh?.value}`,
      );

      await admin.from("kpi_values").delete().eq("kpi_id", donationsKpi.id).eq("period", period);
    }

    await admin.from("year_plan_goals").delete().like("title", "rls probe%");
  }

  console.log("\n— Messaging: per-person read receipts (0014) —");

  {
    const { data: shuraProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.shura).single();
    const { data: sabiqunProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.sabiqun).single();
    const { data: muhsinProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.muhsin).single();

    const { data: announcements } = await admin
      .from("channels").select("id").eq("kind", "announcement").single();

    if (announcements && shuraProfile && sabiqunProfile && muhsinProfile) {
      await admin.from("messages").delete().like("body", "rls probe%");

      const { data: toEveryone } = await admin
        .from("messages")
        .insert({ channel_id: announcements.id, author_id: shuraProfile.id, body: "rls probe everyone" })
        .select("id")
        .single();

      // Targeted at the shura only.
      const { data: toShura } = await admin
        .from("messages")
        .insert({
          channel_id: announcements.id, author_id: shuraProfile.id,
          body: "rls probe shura only", audience_all: false,
        })
        .select("id")
        .single();

      if (toShura) {
        await admin.from("message_audience_tiers").insert({ message_id: toShura.id, tier_key: "shura" });
      }

      const { data: muhsinSees } = await muhsin
        .from("messages").select("id, body").eq("channel_id", announcements.id);
      check(
        "an announcement to everyone reaches a muhsin",
        (muhsinSees ?? []).some((m) => m.body === "rls probe everyone"),
      );
      check(
        "one targeted at the shura does NOT",
        !(muhsinSees ?? []).some((m) => m.body === "rls probe shura only"),
        `they saw: ${(muhsinSees ?? []).map((m) => m.body).join(" | ")}`,
      );

      const { data: sabiqunSees } = await sabiqun
        .from("messages").select("id, body").eq("channel_id", announcements.id);
      check(
        "nor a sabiqun",
        !(sabiqunSees ?? []).some((m) => m.body === "rls probe shura only"),
      );

      if (toEveryone) {
        // THE FIX. One person reading must not mark it read for anyone
        // else — that shared flag is what this whole migration replaces.
        await muhsin.from("message_reads").insert({
          message_id: toEveryone.id, profile_id: muhsinProfile.id,
        });

        const { data: muhsinUnread } = await muhsin
          .from("channel_unread").select("unread").eq("channel_id", announcements.id).maybeSingle();
        const { data: sabiqunUnread } = await sabiqun
          .from("channel_unread").select("unread").eq("channel_id", announcements.id).maybeSingle();

        check(
          "after a muhsin reads it, it is read for THEM",
          (muhsinUnread?.unread ?? 0) === 0,
          `they still have ${muhsinUnread?.unread ?? 0} unread`,
        );
        check(
          "and still unread for the sabiqun — no shared flag",
          (sabiqunUnread?.unread ?? 0) >= 1,
          `the sabiqun has ${sabiqunUnread?.unread ?? 0} unread`,
        );

        // Nobody marks a message read on somebody else's behalf.
        //
        // Aimed at the SHURA's id, not the muhsin's: the muhsin already
        // has a read row, so that insert would fail on the primary key
        // and the check would pass without RLS having been involved at
        // all. Only a policy can refuse this one.
        const { error: forgedRead } = await sabiqun.from("message_reads").insert({
          message_id: toEveryone.id, profile_id: shuraProfile.id,
        });
        check(
          "nobody can mark a message read for another person",
          deniedByPolicy(forgedRead),
          forgedRead ? `${forgedRead.code}: ${forgedRead.message}` : "the forged read was accepted",
        );
        const { data: shuraRead } = await admin
          .from("message_reads").select("profile_id")
          .eq("message_id", toEveryone.id).eq("profile_id", shuraProfile.id).maybeSingle();
        check("and no read row was written for them", shuraRead == null);

        // The author sees who has and has not read it.
        const { data: status } = await shura
          .from("announcement_read_status").select("profile_id, read_at").eq("message_id", toEveryone.id);
        const readers = (status ?? []).filter((r) => r.read_at != null);
        const nonReaders = (status ?? []).filter((r) => r.read_at == null);
        check(
          "the sender can see who has read it",
          readers.some((r) => r.profile_id === muhsinProfile.id),
        );
        check(
          "and who has not",
          nonReaders.some((r) => r.profile_id === sabiqunProfile.id),
          `${nonReaders.length} have not read it`,
        );
      }

      // Posting to announcements is a permission, not a membership.
      const { error: muhsinPost } = await muhsin.from("messages").insert({
        channel_id: announcements.id, author_id: muhsinProfile.id, body: "rls probe muhsin post",
      });
      check(
        "a muhsin cannot post an announcement",
        deniedByPolicy(muhsinPost),
        muhsinPost ? `${muhsinPost.code}: ${muhsinPost.message}` : "the post went through",
      );

      await admin.from("messages").delete().like("body", "rls probe%");
    }

    // Team channels follow the team.
    const { data: financeChannel } = await admin
      .from("channels").select("id").eq("kind", "team").eq("team_key", "finance").maybeSingle();
    if (financeChannel && muhsinProfile) {
      await admin.from("messages").delete().like("body", "rls probe team%");
      await admin.from("messages").insert({
        channel_id: financeChannel.id, body: "rls probe team message",
      });
      const { data: seen } = await muhsin.from("messages").select("id").eq("channel_id", financeChannel.id);
      check(
        "somebody not on the finance team cannot read its channel",
        (seen?.length ?? 0) === 0,
        `they saw ${seen?.length ?? 0}`,
      );
      await admin.from("messages").delete().like("body", "rls probe team%");
    }
  }

  console.log("\n— Messaging: event channels follow the event (0014) —");

  {
    await admin.from("initiatives").delete().like("title", "rls probe event%");

    const { data: initiative } = await admin
      .from("initiatives")
      .insert({ title: "rls probe event channel", initiative_type: "seerah_night", stage: "idea" })
      .select("id")
      .single();

    if (initiative) {
      const { data: before } = await admin
        .from("channels").select("id").eq("initiative_id", initiative.id).maybeSingle();
      check("an unapproved event has no channel", before == null);

      await admin.from("initiatives").update({ stage: "planning" }).eq("id", initiative.id);
      const { data: after } = await admin
        .from("channels").select("id, is_archived").eq("initiative_id", initiative.id).maybeSingle();
      check("approving it creates one", after != null);
      check("which is not archived", after?.is_archived === false);

      // Closing needs a signed-off retrospective (0008), so give it one.
      await admin.from("initiative_retrospectives").insert({
        initiative_id: initiative.id,
        summary: Array(120).fill("word").join(" "),
        is_final: true,
      });
      await admin.from("initiatives").update({ stage: "closed" }).eq("id", initiative.id);

      const { data: closed } = await admin
        .from("channels").select("is_archived").eq("initiative_id", initiative.id).maybeSingle();
      check(
        "and closing the event archives it rather than deleting it",
        closed?.is_archived === true,
        closed == null ? "the channel is gone entirely" : "it is still open",
      );

      await admin.from("initiatives").delete().eq("id", initiative.id);
    }
  }

  console.log("\n— Media, development and resources (0017, 0019) —");

  {
    const { data: muhsinProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.muhsin).single();

    // The org-wide media plan is for people with a media permission.
    await admin.from("media_goals").delete().like("title", "rls probe%");
    await admin.from("media_goals").insert({ title: "rls probe media goal" });

    const { data: muhsinGoals } = await muhsin.from("media_goals").select("id");
    check("a muhsin cannot see the org media goals", (muhsinGoals?.length ?? 0) === 0,
      `they saw ${muhsinGoals?.length ?? 0}`);

    const { data: sabiqunGoals } = await sabiqun.from("media_goals").select("id");
    check("a sabiqun with media.edit can", (sabiqunGoals?.length ?? 0) >= 1);

    // Brand guidance stays open to everybody — the deviation stated in
    // 0019. Checked so that changing it later fails loudly here.
    const { data: muhsinGuides } = await muhsin.from("media_guidelines").select("id");
    check("but the brand guidelines are open to all staff, by design",
      (muhsinGuides?.length ?? 0) >= 1);

    await admin.from("media_goals").delete().like("title", "rls probe%");

    // Resources: per-folder visibility.
    const { data: policies } = await admin
      .from("resource_folders").select("id").eq("name", "Policies").maybeSingle();
    const { data: briefs } = await admin
      .from("resource_folders").select("id").eq("name", "Speaker briefs").maybeSingle();

    if (policies && briefs) {
      const { data: muhsinFolders } = await muhsin.from("resource_folders").select("id, name");
      check("a muhsin sees the folders shared with everyone",
        (muhsinFolders ?? []).some((f) => f.id === policies.id));
      check("and not the ones that are not",
        !(muhsinFolders ?? []).some((f) => f.id === briefs.id),
        `they saw: ${(muhsinFolders ?? []).map((f) => f.name).join(", ")}`);

      const { data: sabiqunFolders } = await sabiqun.from("resource_folders").select("id");
      check("a sabiqun sees the speaker briefs",
        (sabiqunFolders ?? []).some((f) => f.id === briefs.id));
    }

    // The dawah list is switched off with the team, in RLS rather than
    // in the UI. Its own owner cannot read it either.
    if (muhsinProfile) {
      await admin.from("dawah_targets").delete().like("name", "rls probe%");
      await admin.from("dawah_targets").insert({
        owner_id: muhsinProfile.id, name: "rls probe dawah contact",
      });

      const { data: live } = await admin.from("teams").select("is_active").eq("key", "dawah").single();
      check("the dawah team is still switched off", live?.is_active === false);

      const { data: ownerSees } = await muhsin.from("dawah_targets").select("id");
      check("so even the list's own owner cannot read it",
        (ownerSees?.length ?? 0) === 0, `they saw ${ownerSees?.length ?? 0}`);

      const { data: shuraSees } = await shura.from("dawah_targets").select("id");
      check("and neither can the shura", (shuraSees?.length ?? 0) === 0);

      // Switch it on, prove it appears, switch it back.
      await admin.from("teams").update({ is_active: true }).eq("key", "dawah");
      const nowLive = await signIn(ACCOUNTS.muhsin);
      const { data: afterSwitch } = await nowLive.from("dawah_targets").select("id");
      check("switching the team on makes it readable by its owner",
        (afterSwitch?.length ?? 0) === 1, `they saw ${afterSwitch?.length ?? 0}`);

      await admin.from("teams").update({ is_active: false }).eq("key", "dawah");
      await admin.from("dawah_targets").delete().like("name", "rls probe%");
    }

    // Development progress: your own, and the shura's overview.
    const { data: firstMilestone } = await admin
      .from("development_milestones").select("id").eq("key", "course").single();

    if (firstMilestone && muhsinProfile) {
      await admin.from("development_progress").upsert(
        { profile_id: muhsinProfile.id, milestone_id: firstMilestone.id, count_so_far: 1 },
        { onConflict: "profile_id,milestone_id" },
      );

      const { data: theirs } = await muhsin.from("development_progress").select("profile_id");
      check("a muhsin sees their own development progress",
        (theirs ?? []).length >= 1 && (theirs ?? []).every((d) => d.profile_id === muhsinProfile.id));

      // A sabiqun has no development.view_all, so the muhsin's row must
      // not be in what they get back — regardless of their own rows.
      const { data: sabiqunSees } = await sabiqun
        .from("development_progress").select("profile_id");
      check(
        "a sabiqun does not see anybody else's",
        !(sabiqunSees ?? []).some((d) => d.profile_id === muhsinProfile.id),
        `they saw ${sabiqunSees?.length ?? 0} rows`,
      );

      const { data: shuraSeesAll } = await shura
        .from("development_progress").select("profile_id");
      check(
        "but the shura do — that is what makes the step-up list possible",
        (shuraSeesAll ?? []).some((d) => d.profile_id === muhsinProfile.id),
      );

      // A shura tick must survive the recounter — the same rule as the
      // KPIs, and worth proving rather than trusting by eye.
      await admin.from("development_progress").upsert(
        { profile_id: muhsinProfile.id, milestone_id: firstMilestone.id, marked_done: true },
        { onConflict: "profile_id,milestone_id" },
      );
      await admin.rpc("refresh_development_progress");
      const { data: afterRecount } = await admin
        .from("development_progress").select("marked_done")
        .eq("profile_id", muhsinProfile.id).eq("milestone_id", firstMilestone.id).single();
      check("a shura tick survives a recount", afterRecount?.marked_done === true);

      await admin.from("development_progress")
        .delete().eq("profile_id", muhsinProfile.id).eq("milestone_id", firstMilestone.id);
    }
  }

  console.log("\n— Notes are private, and so are their to-do lists (0022) —");

  {
    const { data: muhsinProfile } = await admin
      .from("profiles").select("id").eq("email", ACCOUNTS.muhsin).single();

    if (muhsinProfile) {
      await admin.from("notes").delete().eq("owner_id", muhsinProfile.id).like("title", "rls probe%");
      await admin.from("note_folders").delete().eq("owner_id", muhsinProfile.id).like("name", "rls probe%");
      await admin.from("tasks").delete().eq("owner_id", muhsinProfile.id).like("title", "rls probe%");

      // Everything below is done AS THE MUHSIN, not the service role —
      // the lesson from 0007 was that writes tested as god hide bugs.
      const { data: folder, error: folderError } = await muhsin
        .from("note_folders").insert({ name: "rls probe folder" }).select("id").single();
      check("a member can make a folder and read its id back", !!folder, folderError?.message);

      const { data: note, error: noteError } = await muhsin
        .from("notes").insert({ title: "rls probe note", folder_id: folder?.id ?? null })
        .select("id").single();
      check("and a note in it", !!note, noteError?.message);

      if (note) {
        const { data: block } = await muhsin
          .from("note_blocks")
          .insert({ note_id: note.id, kind: "text", position: 0, body: "private thoughts\n- ring the venue\n- buy dates" })
          .select("id").single();

        // The to-do list enterer, end to end through the real function.
        const { error: todoError } = await muhsin.rpc("make_note_todo", {
          p_block_id: block!.id,
          p_before: "private thoughts",
          p_items: [
            { text: "rls probe ring the venue", depth: 0, done: false },
            { text: "rls probe buy dates", depth: 0, done: true },
          ],
          p_after: "",
          p_title: "rls probe to-do",
        });
        check("turning lines into a to-do list works as the member", !todoError, todoError?.message);

        const { data: myTask } = await muhsin
          .from("tasks").select("id, checklist_id, source").eq("title", "rls probe to-do").maybeSingle();
        check("it appears in their own tasks", myTask?.source === "note");

        const { data: myItems } = await muhsin
          .from("checklist_items").select("text, done").eq("checklist_id", myTask?.checklist_id ?? "");
        check(
          "with its items, and a pre-ticked line arrives ticked",
          (myItems ?? []).length === 2 && (myItems ?? []).some((i) => i.text === "rls probe buy dates" && i.done),
        );

        // THE point of the privacy change. The shura hold tasks.view_all
        // and could previously read every task and checklist.
        const { data: shuraNotes } = await shura.from("notes").select("id").eq("id", note.id);
        check("the shura cannot open somebody else's note", (shuraNotes?.length ?? 0) === 0);

        const { data: shuraBlocks } = await shura.from("note_blocks").select("id").eq("note_id", note.id);
        check("nor read what is written in it", (shuraBlocks?.length ?? 0) === 0);

        const { data: shuraFolders } = await shura.from("note_folders").select("id").eq("id", folder!.id);
        check("nor see their folders", (shuraFolders?.length ?? 0) === 0);

        if (myTask) {
          const { data: shuraTask } = await shura.from("tasks").select("id").eq("id", myTask.id);
          check(
            "a to-do list made from a note is hidden from the shura's task views",
            (shuraTask?.length ?? 0) === 0,
            "tasks.view_all can still see it — the note's lines are leaking",
          );

          const { data: shuraItems } = await shura
            .from("checklist_items").select("id").eq("checklist_id", myTask.checklist_id ?? "");
          check(
            "and so are its items, through the checklist side door too",
            (shuraItems?.length ?? 0) === 0,
          );

          // tasks.assign could previously edit anybody's task.
          await sabiqun.from("tasks").update({ title: "rls probe hijacked" }).eq("id", myTask.id);
          const { data: afterHijack } = await admin.from("tasks").select("title").eq("id", myTask.id).single();
          check("nobody else can edit it", afterHijack?.title === "rls probe to-do",
            `it now reads: ${afterHijack?.title}`);

          // Ticking in the note is ticking the task: one row, not a copy.
          const venue = (myItems ?? []).find((i) => i.text === "rls probe ring the venue");
          if (venue) {
            const { data: before } = await admin.from("notes").select("updated_at").eq("id", note.id).single();
            await muhsin.from("checklist_items").update({ done: true })
              .eq("checklist_id", myTask.checklist_id ?? "").eq("text", "rls probe ring the venue");
            const { data: after } = await admin.from("notes").select("updated_at").eq("id", note.id).single();
            check(
              "ticking an item moves the note to the top of the list",
              !!before && !!after && after.updated_at > before.updated_at,
            );
          }
        }

        // Nobody writes a task into another person's notebook.
        const { error: planted } = await sabiqun.from("tasks").insert({
          title: "rls probe planted", owner_id: muhsinProfile.id, source: "note",
        });
        check(
          "nobody can create a note task owned by somebody else",
          deniedByPolicy(planted),
          planted ? `${planted.code}: ${planted.message}` : "it was created",
        );

        // Regression: ordinary tasks are exactly as visible as before.
        await admin.from("tasks").delete().eq("title", "rls probe ordinary");
        const { data: ordinary } = await muhsin
          .from("tasks").insert({ title: "rls probe ordinary", owner_id: muhsinProfile.id })
          .select("id").single();
        const { data: shuraOrdinary } = await shura.from("tasks").select("id").eq("id", ordinary?.id ?? "");
        check(
          "but an ordinary task is still visible to the shura, as it always was",
          (shuraOrdinary?.length ?? 0) === 1,
        );
        await admin.from("tasks").delete().eq("title", "rls probe ordinary");

        // Deleting a note must work (the cascade guard in 0022) and must
        // leave its to-do list in the Tasks tab.
        const { error: deleteError } = await muhsin.from("notes").delete().eq("id", note.id);
        check("a note can be deleted", !deleteError, deleteError?.message);
        if (myTask) {
          const { data: survivor } = await muhsin.from("tasks").select("id").eq("id", myTask.id);
          check("and its to-do list stays in their tasks", (survivor?.length ?? 0) === 1);
        }
      }

      // A deleted folder unfiles its notes rather than deleting them.
      const { data: keeper } = await muhsin
        .from("notes").insert({ title: "rls probe keeper", folder_id: folder?.id ?? null }).select("id").single();
      await muhsin.from("note_folders").delete().eq("id", folder?.id ?? "");
      const { data: kept } = await muhsin.from("notes").select("folder_id").eq("id", keeper?.id ?? "").maybeSingle();
      check("deleting a folder unfiles its notes instead of deleting them",
        kept != null && kept.folder_id == null);

      await admin.from("notes").delete().eq("owner_id", muhsinProfile.id).like("title", "rls probe%");
      await admin.from("tasks").delete().eq("owner_id", muhsinProfile.id).like("title", "rls probe%");
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

verify().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
