"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KeyResult, OrgStatement, YearPlanGoal } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

function explain(message: string): string {
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  if (/target_differs_from_start/.test(message)) {
    return "The target has to be different from where you are starting, or there is nothing to measure.";
  }
  return message;
}

export async function saveStatement(key: string, body: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("org_statements")
    .update({ body: body.trim(), updated_by: user?.id ?? null, updated_at: new Date().toISOString() } as Partial<OrgStatement>)
    .eq("key", key);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/strategy");
  return {};
}

export async function addYearPlanGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the goal a name.", ok: null };

  const { error } = await supabase.from("year_plan_goals").insert({
    year: Number(formData.get("year")),
    quarter: Number(formData.get("quarter")),
    title,
    detail: String(formData.get("detail") ?? "").trim() || null,
    owner_id: String(formData.get("owner_id") ?? "").trim() || null,
    priority_id: String(formData.get("priority_id") ?? "").trim() || null,
  });
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/strategy");
  return { error: null, ok: "Added." };
}

export async function setGoalStatus(id: string, status: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("year_plan_goals")
    .update({ status } as Partial<YearPlanGoal>)
    .eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/strategy");
  return {};
}

export async function addObjective(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "What is the objective?", ok: null };

  const { error } = await supabase.from("objectives").insert({
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    priority_id: String(formData.get("priority_id") ?? "").trim() || null,
    year: Number(formData.get("year")),
    quarter: formData.get("quarter") ? Number(formData.get("quarter")) : null,
    owner_id: String(formData.get("owner_id") ?? "").trim() || null,
    status: "active",
  });
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/strategy/okrs");
  return { error: null, ok: "Added." };
}

export async function addKeyResult(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "What is being measured?", ok: null };

  const target = Number(formData.get("target_value"));
  const start = Number(formData.get("start_value") ?? 0);
  if (!Number.isFinite(target)) return { error: "Give it a target.", ok: null };

  const { error } = await supabase.from("key_results").insert({
    objective_id: String(formData.get("objective_id") ?? ""),
    title,
    unit: String(formData.get("unit") ?? "").trim() || null,
    start_value: Number.isFinite(start) ? start : 0,
    target_value: target,
    current_value: Number.isFinite(start) ? start : 0,
    direction: String(formData.get("direction") ?? "up") as "up" | "down",
    owner_id: String(formData.get("owner_id") ?? "").trim() || null,
  });
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/strategy/okrs");
  return { error: null, ok: "Added." };
}

/**
 * An owner moving their own number.
 *
 * The RLS policy is what actually permits this — owner_id = auth.uid()
 * plus okr.update_own — and its WITH CHECK repeats the owner test so
 * that updating a key result cannot also hand it to somebody else.
 */
export async function updateKeyResultValue(id: string, value: string): Promise<{ error?: string }> {
  const trimmed = value.trim();
  if (trimmed === "") return { error: "Put a number in." };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { error: "That needs to be a number." };

  const supabase = createClient();
  const { error } = await supabase
    .from("key_results")
    .update({ current_value: n, updated_at: new Date().toISOString() } as Partial<KeyResult>)
    .eq("id", id);
  if (error) return { error: explain(error.message) };
  revalidatePath("/app/strategy/okrs");
  return {};
}

export async function recordKpiValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const period = String(formData.get("period") ?? "");
  if (!period) return { error: "Pick a month.", ok: null };
  const value = Number(formData.get("value"));
  if (!Number.isFinite(value)) return { error: "Put a number in.", ok: null };

  // is_auto false, deliberately. A number a person typed is marked as
  // theirs, and refresh_auto_kpis() will not overwrite it — if somebody
  // counted the room and the calculation disagrees, the person who was
  // in the room wins and the disagreement stays visible.
  const { error } = await supabase.from("kpi_values").upsert(
    {
      kpi_id: String(formData.get("kpi_id") ?? ""),
      period: `${period.slice(0, 7)}-01`,
      value,
      is_auto: false,
      note: String(formData.get("note") ?? "").trim() || null,
      recorded_by: user?.id ?? null,
    },
    { onConflict: "kpi_id,period" },
  );
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/strategy/kpis");
  return { error: null, ok: "Recorded." };
}

export async function refreshAutoKpis(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const period = String(formData.get("period") ?? "").slice(0, 7);
  const { data, error } = await supabase.rpc("refresh_auto_kpis", {
    p_period: period ? `${period}-01` : undefined,
  });
  if (error) return { error: explain(error.message), ok: null };
  revalidatePath("/app/strategy/kpis");
  return { error: null, ok: `Recalculated ${data ?? 0}. Anything typed in by hand was left alone.` };
}
