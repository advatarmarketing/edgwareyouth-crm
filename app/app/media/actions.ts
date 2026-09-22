"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContentCalendarItem, MediaGuideline, MediaPlatform } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

function explain(message: string): string {
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  return message;
}

export async function addContentItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "What is the post?", ok: null };
  const plannedFor = String(formData.get("planned_for") ?? "");
  if (!plannedFor) return { error: "Pick a date.", ok: null };

  const { error } = await supabase.from("content_calendar").insert({
    planned_for: plannedFor,
    title,
    platform: String(formData.get("platform") ?? "").trim() || null,
    pillar_id: String(formData.get("pillar_id") ?? "").trim() || null,
    owner_id: String(formData.get("owner_id") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/media");
  return { error: null, ok: "Added." };
}

export async function setContentStatus(id: string, status: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("content_calendar")
    .update({
      status,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    } as Partial<ContentCalendarItem>)
    .eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/media");
  return {};
}

export async function savePlatformField(
  id: string,
  field: string,
  value: string,
): Promise<{ error?: string }> {
  const allowed = new Set(["purpose", "audience", "frequency", "what_works"]);
  if (!allowed.has(field)) return { error: "That field cannot be edited here." };

  const supabase = createClient();
  const { error } = await supabase
    .from("media_platforms")
    .update({ [field]: value.trim() || null } as Partial<MediaPlatform>)
    .eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/media");
  return {};
}

export async function saveGuideline(id: string, body: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("media_guidelines")
    .update({ body: body.trim() } as Partial<MediaGuideline>)
    .eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/media");
  return {};
}

/**
 * The monthly review, which also moves the followers KPI.
 *
 * Written straight into kpi_values as a MANUAL entry, because that is
 * what it is — somebody read a number off a screen. Marking it manual
 * means refresh_auto_kpis() will leave it alone, which is the rule the
 * whole KPI design rests on.
 */
export async function saveMediaReview(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const month = String(formData.get("month") ?? "");
  if (!month) return { error: "Pick a month.", ok: null };
  const firstOfMonth = `${month.slice(0, 7)}-01`;

  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? Number(v) : null;
  };
  const followers = num("followers");

  const { error } = await supabase.from("media_reviews").upsert(
    {
      month: firstOfMonth,
      followers,
      reach: num("reach"),
      posts: num("posts"),
      engagement: num("engagement"),
      what_worked: String(formData.get("what_worked") ?? "").trim() || null,
      what_did_not: String(formData.get("what_did_not") ?? "").trim() || null,
      recorded_by: user?.id ?? null,
    },
    { onConflict: "month" },
  );
  if (error) return { error: explain(error.message), ok: null };

  let note = "";
  if (followers != null) {
    const { data: kpi } = await supabase
      .from("kpis").select("id").eq("key", "social_followers").maybeSingle();
    if (kpi) {
      const { error: kpiError } = await supabase.from("kpi_values").upsert(
        {
          kpi_id: kpi.id, period: firstOfMonth, value: followers,
          is_auto: false, note: "From the monthly media review",
          recorded_by: user?.id ?? null,
        },
        { onConflict: "kpi_id,period" },
      );
      note = kpiError ? " The followers KPI did not update." : " The followers KPI moved with it.";
    }
  }

  revalidatePath("/app/media");
  revalidatePath("/app/strategy/kpis");
  return { error: null, ok: `Saved.${note}` };
}
