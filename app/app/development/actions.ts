"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DevelopmentProgress } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

export async function refreshDevelopment(_prev: ActionState): Promise<ActionState> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("refresh_development_progress");
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/development");
  return { error: null, ok: `Recounted ${data ?? 0} rows. Shura ticks were left alone.` };
}

/**
 * A shura tick against a milestone the CRM cannot count.
 *
 * `marked_done` is separate from `count_so_far` on purpose: the
 * counter overwrites the count on every refresh and never touches the
 * tick, so a judgement somebody made does not evaporate the next time
 * the numbers are recalculated.
 */
export async function markMilestone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const profileId = String(formData.get("profile_id") ?? "");
  const milestoneId = String(formData.get("milestone_id") ?? "");
  const done = String(formData.get("done") ?? "") === "true";

  const { error } = await supabase.from("development_progress").upsert(
    {
      profile_id: profileId,
      milestone_id: milestoneId,
      marked_done: done,
      marked_by: done ? user.id : null,
      note: String(formData.get("note") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    } as Pick<DevelopmentProgress, "profile_id" | "milestone_id"> & Partial<DevelopmentProgress>,
    { onConflict: "profile_id,milestone_id" },
  );

  if (error) {
    return {
      error: /row-level security/i.test(error.message)
        ? "Only the shura can tick these off."
        : error.message,
      ok: null,
    };
  }
  revalidatePath("/app/development");
  return { error: null, ok: done ? "Ticked." : "Un-ticked." };
}
