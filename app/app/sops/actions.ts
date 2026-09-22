"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChecklistFromText, cloneChecklist, parseChecklistLines } from "@/lib/checklist";
import { notify } from "@/lib/notify";
import type { TeamKey, TierKey } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Creates or updates an SOP, its checklist and its visibility.
 *
 * Editing bumps the version and writes the old text into sop_versions
 * before overwriting — so the history is a record of what people
 * actually read, not a diff reconstructed afterwards. Everyone's read
 * receipt is left alone and simply goes stale against the new version,
 * which is what turns their tick into "needs re-reading".
 */
export async function saveSop(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const steps = String(formData.get("steps") ?? "");
  const category = String(formData.get("category") ?? "General").trim() || "General";
  const status = formData.get("publish") === "on" ? "published" : "draft";
  const visibleToAll = formData.get("visible_to_all") === "on";

  if (!title) return { error: "Give the SOP a title.", ok: null };

  let sopId = id;

  if (id) {
    const { data: existing } = await supabase
      .from("sops")
      .select("title, body, version")
      .eq("id", id)
      .single();

    if (!existing) return { error: "That SOP has gone.", ok: null };

    const changed = existing.title !== title || existing.body !== body;

    if (changed) {
      await supabase.from("sop_versions").insert({
        sop_id: id,
        version: existing.version,
        title: existing.title,
        body: existing.body,
        changed_by: user.id,
      });
    }

    const { error } = await supabase
      .from("sops")
      .update({
        title,
        body,
        category,
        status,
        visible_to_all: visibleToAll,
        version: changed ? existing.version + 1 : existing.version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { error: error.message, ok: null };
  } else {
    const { data: created, error } = await supabase
      .from("sops")
      .insert({ title, body, category, status, visible_to_all: visibleToAll, created_by: user.id })
      .select("id")
      .single();

    if (error || !created) return { error: error?.message ?? "Could not create the SOP.", ok: null };
    sopId = created.id;
  }

  // The master checklist is rebuilt from the steps box rather than
  // patched. Nobody ticks it — it is the standard, and "Run this SOP"
  // copies it — so there is no progress to preserve.
  const { data: sop } = await supabase.from("sops").select("checklist_id").eq("id", sopId).single();

  if (sop?.checklist_id) await supabase.from("checklists").delete().eq("id", sop.checklist_id);

  if (parseChecklistLines(steps).length > 0) {
    const { id: checklistId } = await createChecklistFromText(supabase, {
      text: steps,
      source: "sop",
      sourceId: sopId,
      title,
      createdBy: user.id,
    });
    await supabase.from("sops").update({ checklist_id: checklistId }).eq("id", sopId);
  } else {
    await supabase.from("sops").update({ checklist_id: null }).eq("id", sopId);
  }

  // Visibility: replace the sets rather than diff them. At most a
  // handful of rows each, and a delete-then-insert cannot drift.
  await Promise.all([
    supabase.from("sop_visible_tiers").delete().eq("sop_id", sopId),
    supabase.from("sop_visible_teams").delete().eq("sop_id", sopId),
  ]);

  const tiers = formData.getAll("tiers").map(String) as TierKey[];
  const teams = formData.getAll("teams").map(String) as TeamKey[];

  if (tiers.length > 0) {
    await supabase.from("sop_visible_tiers").insert(tiers.map((tier_key) => ({ sop_id: sopId, tier_key })));
  }
  if (teams.length > 0) {
    await supabase.from("sop_visible_teams").insert(teams.map((team_key) => ({ sop_id: sopId, team_key })));
  }

  revalidatePath("/app/sops");
  revalidatePath(`/app/sops/${sopId}`);
  redirect(`/app/sops/${sopId}`);
}

/** "I've read this", recorded against the version that was read. */
export async function markSopRead(formData: FormData): Promise<void> {
  const supabase = createClient();
  const sopId = String(formData.get("sop_id") ?? "");
  const version = Number(formData.get("version") ?? 1);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("sop_reads")
    .upsert({ sop_id: sopId, profile_id: user.id, version_read: version, read_at: new Date().toISOString() });

  revalidatePath(`/app/sops/${sopId}`);
}

/**
 * "Run this SOP" — hands somebody a fresh copy of the checklist as a
 * task with a due date (spec 4.5).
 *
 * A copy, never the master. Two people running the same SOP next week
 * must not tick each other's boxes, and the library has to keep
 * showing the standard rather than somebody's part-finished run.
 */
export async function runSop(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const sopId = String(formData.get("sop_id") ?? "");
  const ownerId = String(formData.get("owner_id") ?? "") || user.id;
  const dueDate = String(formData.get("due_date") ?? "") || null;

  const { data: sop } = await supabase
    .from("sops")
    .select("title, checklist_id")
    .eq("id", sopId)
    .single();

  if (!sop) return { error: "That SOP has gone.", ok: null };

  let checklistId: string | null = null;

  if (sop.checklist_id) {
    const { id, error } = await cloneChecklist(supabase, sop.checklist_id, {
      source: "sop",
      sourceId: sopId,
      createdBy: user.id,
    });
    if (error) return { error, ok: null };
    checklistId = id;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: sop.title,
      owner_id: ownerId,
      created_by: user.id,
      due_date: dueDate,
      checklist_id: checklistId,
      source: "sop",
      source_id: sopId,
    })
    .select("id")
    .single();

  if (error || !task) return { error: error?.message ?? "Could not create the task.", ok: null };

  if (ownerId !== user.id) {
    await notify(createAdminClient(), {
      userId: ownerId,
      kind: "task_new",
      title: sop.title,
      body: "An SOP has been assigned to you to work through.",
      href: `/app/tasks/${task.id}`,
    });
  }

  revalidatePath("/app/tasks");
  return { error: null, ok: "Assigned. It is on their tasks now." };
}
