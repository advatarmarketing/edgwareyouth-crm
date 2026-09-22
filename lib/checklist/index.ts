import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ChecklistSource } from "@/lib/supabase/types";
import { parseChecklistLines } from "./parse";

export * from "./parse";

/**
 * Turns a block of text into a stored checklist and hands back its id.
 *
 * This is the half of section 4.1 that touches the database. The
 * parsing itself stays in ./parse.ts with no Supabase import, so the
 * rules can be tested without one.
 *
 * Every caller records where the checklist came from. `manual` is
 * someone typing one in; the rest link back to the SOP, meeting, event
 * or key result that produced it, which is what makes "where did this
 * task come from?" answerable later.
 */
export async function createChecklistFromText(
  supabase: SupabaseClient<Database>,
  options: {
    text: string;
    source?: ChecklistSource;
    sourceId?: string | null;
    title?: string | null;
    createdBy?: string | null;
  }
): Promise<{ id: string | null; error: string | null }> {
  const steps = parseChecklistLines(options.text);
  if (steps.length === 0) return { id: null, error: null };

  const { data: checklist, error } = await supabase
    .from("checklists")
    .insert({
      title: options.title ?? null,
      source: options.source ?? "manual",
      source_id: options.sourceId ?? null,
      created_by: options.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !checklist) return { id: null, error: error?.message ?? "Could not create the checklist." };

  const { error: itemsError } = await supabase.from("checklist_items").insert(
    steps.map((step) => ({
      checklist_id: checklist.id,
      text: step.text,
      depth: step.depth,
      position: step.position,
    }))
  );

  if (itemsError) return { id: null, error: itemsError.message };

  return { id: checklist.id, error: null };
}

/**
 * Copies a checklist's steps into a fresh, unticked one.
 *
 * "Run this SOP" in section 4.5 needs this: the library's checklist is
 * the master and must not collect one person's ticks. Prompt 3 calls
 * it; it lives here because the copying is generic.
 */
export async function cloneChecklist(
  supabase: SupabaseClient<Database>,
  sourceChecklistId: string,
  options: { source: ChecklistSource; sourceId?: string | null; createdBy?: string | null }
): Promise<{ id: string | null; error: string | null }> {
  const { data: items, error } = await supabase
    .from("checklist_items")
    .select("text, depth, position")
    .eq("checklist_id", sourceChecklistId)
    .order("position");

  if (error) return { id: null, error: error.message };
  if (!items || items.length === 0) return { id: null, error: null };

  const { data: created, error: createError } = await supabase
    .from("checklists")
    .insert({
      source: options.source,
      source_id: options.sourceId ?? null,
      created_by: options.createdBy ?? null,
    })
    .select("id")
    .single();

  if (createError || !created) return { id: null, error: createError?.message ?? "Could not copy the checklist." };

  const { error: itemsError } = await supabase
    .from("checklist_items")
    .insert(items.map((i) => ({ ...i, checklist_id: created.id })));

  if (itemsError) return { id: null, error: itemsError.message };

  return { id: created.id, error: null };
}
