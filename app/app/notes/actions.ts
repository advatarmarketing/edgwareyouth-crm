"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { splitForTodo } from "@/lib/notes/selection";

/**
 * Notes are private to their owner, and that is enforced by RLS in
 * 0022 rather than by anything here. Every action below runs as the
 * signed-in person, so an id belonging to somebody else simply matches
 * no rows — there is no ownership check to forget.
 */

type Result = { error?: string };

function explain(message: string): string {
  if (/row-level security/i.test(message)) return "That note is not yours to change.";
  return message;
}

function refresh(noteId?: string) {
  revalidatePath("/app/notes");
  if (noteId) revalidatePath(`/app/notes/${noteId}`);
  // A to-do list lives in the Tasks tab too.
  revalidatePath("/app/tasks");
}

// ---------------------------------------------------------------
// Folders
// ---------------------------------------------------------------

export async function createFolder(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = createClient();
  const { data } = await supabase.from("note_folders").insert({ name }).select("id").single();
  revalidatePath("/app/notes");
  if (data) redirect(`/app/notes?folder=${data.id}`);
}

export async function renameFolder(id: string, name: string): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "A folder needs a name." };
  const supabase = createClient();
  const { error } = await supabase.from("note_folders").update({ name: trimmed }).eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/notes");
  return {};
}

/** Its notes are unfiled, not deleted — see the foreign key in 0022. */
export async function deleteFolder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const supabase = createClient();
  await supabase.from("note_folders").delete().eq("id", id);
  revalidatePath("/app/notes");
  redirect("/app/notes");
}

// ---------------------------------------------------------------
// Notes
// ---------------------------------------------------------------

export async function createNote(formData: FormData): Promise<void> {
  const folderId = String(formData.get("folder_id") ?? "").trim() || null;
  const supabase = createClient();

  const { data: note, error } = await supabase
    .from("notes")
    .insert({ folder_id: folderId, title: "" })
    .select("id")
    .single();
  if (error || !note) throw new Error(explain(error?.message ?? "Could not create the note."));

  // Every note starts with one empty text block, so there is somewhere
  // to type the moment it opens.
  await supabase.from("note_blocks").insert({ note_id: note.id, kind: "text", position: 0, body: "" });

  redirect(`/app/notes/${note.id}`);
}

export async function saveNoteTitle(noteId: string, title: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from("notes").update({ title: title.trim() }).eq("id", noteId);
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function moveNote(noteId: string, folderId: string | null): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from("notes").update({ folder_id: folderId }).eq("id", noteId);
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

/**
 * Its to-do lists stay in the Tasks tab. A task somebody is halfway
 * through should not vanish because they tidied up the note it started
 * in — that is how things get dropped without anybody noticing.
 */
export async function deleteNote(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const folderId = String(formData.get("folder_id") ?? "");
  const supabase = createClient();
  await supabase.from("notes").delete().eq("id", id);
  revalidatePath("/app/notes");
  redirect(folderId ? `/app/notes?folder=${folderId}` : "/app/notes");
}

// ---------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------

export async function saveTextBlock(blockId: string, noteId: string, body: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase
    .from("note_blocks")
    .update({ body })
    .eq("id", blockId)
    .eq("kind", "text");
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function addTextBlock(noteId: string): Promise<Result> {
  const supabase = createClient();
  const { data: last } = await supabase
    .from("note_blocks")
    .select("position")
    .eq("note_id", noteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("note_blocks")
    .insert({ note_id: noteId, kind: "text", position: (last?.position ?? -1) + 1, body: "" });
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function deleteTextBlock(blockId: string, noteId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from("note_blocks").delete().eq("id", blockId).eq("kind", "text");
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

/**
 * The "to-do list enterer".
 *
 * The client sends the block's CURRENT text as well as the selection,
 * because the person may have typed since the last save and the
 * selection offsets refer to what is on their screen, not what is in
 * the database. Splitting the saved copy with fresh offsets would cut
 * the wrong lines out.
 *
 * The split is decided in TypeScript (lib/notes/selection.ts, tested);
 * the writes happen in one SQL function so they cannot half-happen.
 */
export async function makeTodoFromSelection(
  blockId: string,
  noteId: string,
  body: string,
  selectionStart: number,
  selectionEnd: number,
  title: string,
): Promise<Result> {
  const split = splitForTodo(body, selectionStart, selectionEnd);
  if (split.items.length === 0) {
    return { error: "Highlight the lines you want as a to-do list first." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("make_note_todo", {
    p_block_id: blockId,
    p_before: split.before,
    p_items: split.items,
    p_after: split.after,
    p_title: title,
  });
  if (error) return { error: explain(error.message) };

  refresh(noteId);
  return {};
}

/** An empty to-do list at the end of the note, for starting from scratch. */
export async function addTodoBlock(noteId: string, title: string): Promise<Result> {
  const supabase = createClient();

  const { data: last } = await supabase
    .from("note_blocks")
    .select("id, position")
    .eq("note_id", noteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Reuse make_note_todo so there is exactly one code path that creates
  // the checklist, the task and the block together. It needs a text
  // block to split, so make an empty one to split.
  const { data: seed, error: seedError } = await supabase
    .from("note_blocks")
    .insert({ note_id: noteId, kind: "text", position: (last?.position ?? -1) + 1, body: "" })
    .select("id")
    .single();
  if (seedError || !seed) return { error: explain(seedError?.message ?? "Could not add the list.") };

  const { error } = await supabase.rpc("make_note_todo", {
    p_block_id: seed.id,
    p_before: "",
    p_items: [{ text: "First thing to do", depth: 0, done: false }],
    p_after: "",
    p_title: title,
  });
  if (error) return { error: explain(error.message) };

  refresh(noteId);
  return {};
}

/** Back to prose. Ticked items come back as "[x]"; the task is removed. */
export async function todoToText(blockId: string, noteId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc("note_todo_to_text", { p_block_id: blockId });
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

// ---------------------------------------------------------------
// To-do items — the same rows the Tasks tab ticks
// ---------------------------------------------------------------

export async function toggleTodoItem(itemId: string, noteId: string, done: boolean): Promise<Result> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("checklist_items")
    .update({
      done,
      done_by: done ? user?.id ?? null : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function addTodoItem(checklistId: string, noteId: string, text: string): Promise<Result> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const supabase = createClient();
  const { data: last } = await supabase
    .from("checklist_items")
    .select("position")
    .eq("checklist_id", checklistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("checklist_items")
    .insert({ checklist_id: checklistId, text: trimmed, position: (last?.position ?? -1) + 1 });
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function editTodoItem(itemId: string, noteId: string, text: string): Promise<Result> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "An item needs some words. Delete it instead." };
  const supabase = createClient();
  const { error } = await supabase.from("checklist_items").update({ text: trimmed }).eq("id", itemId);
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}

export async function deleteTodoItem(itemId: string, noteId: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.from("checklist_items").delete().eq("id", itemId);
  if (error) return { error: explain(error.message) };
  refresh(noteId);
  return {};
}
