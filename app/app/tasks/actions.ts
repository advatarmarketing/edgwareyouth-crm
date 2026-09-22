"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChecklistFromText } from "@/lib/checklist";
import { notify } from "@/lib/notify";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the task a title.", ok: null };

  const ownerId = String(formData.get("owner_id") ?? "") || user.id;
  const steps = String(formData.get("steps") ?? "");

  // The checklist is created first: a task with a dangling
  // checklist_id is worse than a checklist with no task, since the
  // task is the thing people look at.
  const { id: checklistId, error: checklistError } = await createChecklistFromText(supabase, {
    text: steps,
    source: "manual",
    title,
    createdBy: user.id,
  });

  if (checklistError) return { error: checklistError, ok: null };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: str(formData.get("description")),
      owner_id: ownerId,
      created_by: user.id,
      due_date: str(formData.get("due_date")),
      priority: (String(formData.get("priority") ?? "normal") as TaskPriority),
      checklist_id: checklistId,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !task) return { error: error?.message ?? "Could not create the task.", ok: null };

  // Only tell somebody when it is not their own. Being notified about
  // a task you just wrote for yourself is noise.
  if (ownerId !== user.id) {
    await notify(createAdminClient(), {
      userId: ownerId,
      kind: "task_new",
      title,
      body: "A new task has been given to you.",
      href: `/app/tasks/${task.id}`,
    });
  }

  revalidatePath("/app/tasks");
  redirect(`/app/tasks/${task.id}`);
}

export async function setTaskStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as TaskStatus;
  const blockedReason = str(formData.get("blocked_reason"));

  if (status === "blocked" && !blockedReason) {
    return { error: "Say what is blocking it — whoever assigned it gets told.", ok: null };
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .update({
      status,
      // Cleared on the way out of blocked, so a stale reason cannot
      // sit on a task that is moving again.
      blocked_reason: status === "blocked" ? blockedReason : null,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("title, created_by, owner_id")
    .single();

  if (error) return { error: error.message, ok: null };

  if (status === "blocked" && task?.created_by && task.created_by !== task.owner_id) {
    await notify(createAdminClient(), {
      userId: task.created_by,
      kind: "task_blocked",
      title: `Blocked: ${task.title}`,
      body: blockedReason,
      href: `/app/tasks/${id}`,
    });
  }

  revalidatePath(`/app/tasks/${id}`);
  revalidatePath("/app/tasks");
  return { error: null, ok: "Updated." };
}

export async function toggleChecklistItem(formData: FormData): Promise<void> {
  const supabase = createClient();
  const itemId = String(formData.get("item_id") ?? "");
  const done = String(formData.get("done") ?? "") === "true";
  const taskId = String(formData.get("task_id") ?? "");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("checklist_items")
    .update({
      done,
      done_by: done ? user?.id ?? null : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  revalidatePath(`/app/tasks/${taskId}`);
}

export async function addTaskComment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const taskId = String(formData.get("task_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "Write something first.", ok: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, body, author_id: user?.id ?? null });

  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/tasks/${taskId}`);
  return { error: null, ok: null };
}

function str(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}
