"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChecklistFromText } from "@/lib/checklist";
import { notify } from "@/lib/notify";
import { parseMeetingNotes } from "@/lib/meetings/parse-notes";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Creates a meeting from a template and builds its agenda.
 *
 * "Matters arising" is filled with every action from the last meeting
 * of the SAME TYPE whose task is not yet done — spec 4.6. That is why
 * meeting_type is on the meeting rather than only on the template: a
 * shura meeting picks up the last shura meeting's loose ends, not
 * whatever happened to be scheduled before it.
 */
export async function createMeeting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const templateId = String(formData.get("template_id") ?? "");
  const meetingDate = String(formData.get("meeting_date") ?? "");
  if (!meetingDate) return { error: "Pick a date.", ok: null };

  const { data: template } = await supabase
    .from("meeting_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "Pick a meeting type.", ok: null };

  const title = String(formData.get("title") ?? "").trim() || template.name;

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      template_id: template.id,
      title,
      meeting_type: template.meeting_type,
      meeting_date: meetingDate,
      starts_at: String(formData.get("starts_at") ?? "") || null,
      chair_id: String(formData.get("chair_id") ?? "") || user.id,
      minute_taker_id: String(formData.get("minute_taker_id") ?? "") || user.id,
      minutes_visibility: template.minutes_visibility,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !meeting) return { error: error?.message ?? "Could not create the meeting.", ok: null };

  const items: { meeting_id: string; title: string; position: number; origin: "template" | "matters_arising" }[] = [];

  // Matters arising first — the loose ends set the agenda, they do not
  // get tacked on at the end where they are skipped for time.
  const { data: previous } = await supabase
    .from("meetings")
    .select("id")
    .eq("meeting_type", template.meeting_type)
    .eq("status", "published")
    .lt("meeting_date", meetingDate)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let carried = 0;

  if (previous) {
    const { data: lastActions } = await supabase
      .from("meeting_actions")
      .select("text, task_id")
      .eq("meeting_id", previous.id);

    const taskIds = (lastActions ?? []).map((a) => a.task_id).filter(Boolean) as string[];

    const { data: doneTasks } = taskIds.length
      ? await supabase.from("tasks").select("id").in("id", taskIds).eq("status", "done")
      : { data: [] };

    const done = new Set((doneTasks ?? []).map((t) => t.id));

    for (const action of lastActions ?? []) {
      if (action.task_id && done.has(action.task_id)) continue;
      items.push({
        meeting_id: meeting.id,
        title: `Matters arising — ${action.text}`,
        position: items.length,
        origin: "matters_arising",
      });
      carried += 1;
    }
  }

  for (const section of template.agenda_sections) {
    // The template's own "Matters arising" heading is skipped when real
    // ones were carried over, so the agenda does not show an empty
    // section next to the filled-in items.
    if (carried > 0 && /matters arising/i.test(section)) continue;
    items.push({ meeting_id: meeting.id, title: section, position: items.length, origin: "template" });
  }

  if (items.length > 0) await supabase.from("meeting_agenda_items").insert(items);

  redirect(`/app/meetings/${meeting.id}`);
}

/** Parses pasted notes into draft actions, decisions and review lines. */
export async function pasteNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  const text = String(formData.get("notes") ?? "");

  if (!text.trim()) return { error: "Paste the notes first.", ok: null };

  const { data: meeting } = await supabase
    .from("meetings")
    .select("meeting_date")
    .eq("id", meetingId)
    .maybeSingle();

  if (!meeting) return { error: "That meeting has gone.", ok: null };

  const { data: members } = await supabase
    .from("member_directory")
    .select("id, full_name, nickname")
    .eq("is_active", true);

  // The MEETING date, not today. Notes pasted days later must still
  // produce the dates the room agreed — see lib/meetings/dates.ts.
  const [y, m, d] = meeting.meeting_date.split("-").map(Number);

  const result = parseMeetingNotes(text, {
    meetingDate: new Date(y, m - 1, d),
    members: (members ?? []).map((p) => ({ id: p.id, fullName: p.full_name, nickname: p.nickname })),
  });

  // Replace anything from a previous paste rather than appending, so
  // pasting corrected notes does not double everything up.
  await Promise.all([
    supabase.from("meeting_unresolved").delete().eq("meeting_id", meetingId),
    supabase.from("meeting_actions").delete().eq("meeting_id", meetingId).is("task_id", null),
  ]);

  if (result.actions.length > 0) {
    await supabase.from("meeting_actions").insert(
      result.actions.map((a) => ({
        meeting_id: meetingId,
        owner_id: a.ownerId,
        text: a.text,
        due_date: a.dueDate,
        steps: a.steps,
        source_line: a.sourceLine,
      }))
    );
  }

  if (result.decisions.length > 0) {
    await supabase.from("meeting_decisions").insert(
      result.decisions.map((d) => ({ meeting_id: meetingId, text: d.text }))
    );
  }

  if (result.unmatched.length > 0) {
    await supabase.from("meeting_unresolved").insert(
      result.unmatched.map((u) => ({
        meeting_id: meetingId,
        line: u.line,
        reason: u.reason,
        candidates: u.candidates ?? null,
        steps: u.steps ?? [],
      }))
    );
  }

  await supabase.from("meetings").update({ status: "review", notes: text }).eq("id", meetingId);

  revalidatePath(`/app/meetings/${meetingId}`);

  return {
    error: null,
    ok: `${result.actions.length} action(s), ${result.decisions.length} decision(s), ${result.unmatched.length} line(s) needing a look.`,
  };
}

export async function saveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const ownerId = String(formData.get("owner_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const steps = String(formData.get("steps") ?? "")
    .split("\n")
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  if (!text) return { error: "The action needs some words.", ok: null };

  const row = { meeting_id: meetingId, text, owner_id: ownerId, due_date: dueDate, steps };

  const { error } = id
    ? await supabase.from("meeting_actions").update(row).eq("id", id)
    : await supabase.from("meeting_actions").insert(row);

  if (error) return { error: error.message, ok: null };

  // An unresolved line that has now been turned into a proper action
  // is cleared, so the review screen empties as it is worked through.
  const resolvedId = String(formData.get("resolves") ?? "");
  if (resolvedId) await supabase.from("meeting_unresolved").delete().eq("id", resolvedId);

  revalidatePath(`/app/meetings/${meetingId}`);
  return { error: null, ok: "Saved." };
}

export async function deleteAction(formData: FormData): Promise<void> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  await supabase.from("meeting_actions").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath(`/app/meetings/${meetingId}`);
}

export async function dismissUnresolved(formData: FormData): Promise<void> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  await supabase.from("meeting_unresolved").delete().eq("id", String(formData.get("id") ?? ""));
  revalidatePath(`/app/meetings/${meetingId}`);
}

export async function addDecision(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!text) return { error: "Write the decision first.", ok: null };

  const { error } = await supabase.from("meeting_decisions").insert({ meeting_id: meetingId, text });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/meetings/${meetingId}`);
  return { error: null, ok: null };
}

export async function setAttendance(formData: FormData): Promise<void> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  const attendance = String(formData.get("attendance") ?? "expected");

  await supabase
    .from("meeting_attendees")
    .upsert({ meeting_id: meetingId, profile_id: profileId, attendance: attendance as never });

  revalidatePath(`/app/meetings/${meetingId}`);
}

export async function suggestAgendaItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const meetingId = String(formData.get("meeting_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "What is the item?", ok: null };

  const { count } = await supabase
    .from("meeting_agenda_items")
    .select("*", { count: "exact", head: true })
    .eq("meeting_id", meetingId);

  const { error } = await supabase.from("meeting_agenda_items").insert({
    meeting_id: meetingId,
    title,
    position: count ?? 99,
    origin: "suggested",
    suggested_by: user.id,
  });

  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/meetings/${meetingId}`);
  return { error: null, ok: "Added to the agenda." };
}

/**
 * Publish: the moment the meeting becomes everybody's tasks.
 *
 * Refuses if any action is missing an owner or a due date — spec 4.6.
 * That check is here rather than only in the form because publishing
 * is the irreversible bit: an action with no owner published into the
 * void is exactly the failure this module exists to prevent.
 *
 * Nothing is done about unresolved lines automatically. They are
 * either turned into actions or dismissed by a person first; silently
 * publishing around them would drop what the room actually said.
 */
export async function publishMeeting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const meetingId = String(formData.get("meeting_id") ?? "");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const [{ data: meeting }, { data: actions }, { data: unresolved }, { data: decisions }] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
    supabase.from("meeting_actions").select("*").eq("meeting_id", meetingId),
    supabase.from("meeting_unresolved").select("id").eq("meeting_id", meetingId),
    supabase.from("meeting_decisions").select("text").eq("meeting_id", meetingId),
  ]);

  if (!meeting) return { error: "That meeting has gone.", ok: null };

  const incomplete = (actions ?? []).filter((a) => !a.owner_id || !a.due_date);
  if (incomplete.length > 0) {
    return {
      error: `${incomplete.length} action(s) still need an owner and a due date. Fix them below, then publish.`,
      ok: null,
    };
  }

  if ((unresolved ?? []).length > 0) {
    return {
      error: `${unresolved!.length} line(s) still need a look. Turn each into an action or dismiss it.`,
      ok: null,
    };
  }

  const admin = createAdminClient();
  let created = 0;

  for (const action of actions ?? []) {
    // Already published — a second press must not duplicate anybody's
    // task list.
    if (action.task_id) continue;

    const { id: checklistId } = action.steps.length
      ? await createChecklistFromText(supabase, {
          text: action.steps.join("\n"),
          source: "meeting",
          sourceId: meetingId,
          title: action.text,
          createdBy: user.id,
        })
      : { id: null };

    const { data: task } = await supabase
      .from("tasks")
      .insert({
        title: action.text,
        owner_id: action.owner_id,
        created_by: user.id,
        due_date: action.due_date,
        checklist_id: checklistId,
        source: "meeting",
        source_id: meetingId,
      })
      .select("id")
      .single();

    if (task) {
      await supabase.from("meeting_actions").update({ task_id: task.id }).eq("id", action.id);
      created += 1;
    }
  }

  // One meeting pack per person, not one notification per action —
  // three actions from one meeting is one message, not three.
  const byOwner = new Map<string, number>();
  for (const action of actions ?? []) {
    if (action.owner_id) byOwner.set(action.owner_id, (byOwner.get(action.owner_id) ?? 0) + 1);
  }

  for (const [ownerId, count] of byOwner) {
    await notify(admin, {
      userId: ownerId,
      kind: "meeting_pack",
      title: `Your actions from ${meeting.title}`,
      body: `${count} action${count === 1 ? "" : "s"}${(decisions ?? []).length ? `, and ${decisions!.length} decision${decisions!.length === 1 ? "" : "s"} recorded` : ""}.`,
      href: `/app/meetings/${meetingId}`,
    });
  }

  await supabase
    .from("meetings")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", meetingId);

  revalidatePath(`/app/meetings/${meetingId}`);
  revalidatePath("/app/tasks");

  return { error: null, ok: `Published. ${created} task(s) created, ${byOwner.size} person(s) told.` };
}
