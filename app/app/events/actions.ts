"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notify";
import type {
  IhsanDimension,
  Initiative,
  InitiativeRetrospective,
  InitiativeStage,
} from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Columns the file's inline editors are allowed to write.
 *
 * An allowlist rather than trusting the field name off the form. RLS
 * decides WHICH ROW you may touch; this decides which columns, so a
 * crafted request cannot set `stage` to 'closed' or rewrite
 * `approved_by` through a text box meant for the parking notes.
 */
const EDITABLE = new Set([
  "title", "starts_on", "ends_on", "starts_at", "ends_at", "recurrence",
  "background", "aims", "audience", "age_range", "outputs", "outcomes", "serves_okr",
  "feels_arriving", "feels_peak", "feels_leaving", "one_thing",
  "theme", "theme_why", "content_outline",
  "venue_name", "venue_address", "venue_contact", "access_from", "access_until",
  "layout", "transport", "parking",
  "briefing",
  "expected_attendance", "actual_attendance", "first_timers", "returning_attendees",
]);

const NUMERIC = new Set([
  "expected_attendance", "actual_attendance", "first_timers", "returning_attendees",
]);
const DATE_OR_TIME = new Set([
  "starts_on", "ends_on", "starts_at", "ends_at", "access_from", "access_until",
]);

export async function saveInitiativeField(
  id: string,
  field: string,
  value: string,
): Promise<{ error?: string }> {
  if (!EDITABLE.has(field)) return { error: "That field cannot be edited here." };

  const supabase = createClient();
  const trimmed = value.trim();

  // An empty date is null, not "". Postgres rejects the empty string
  // for a date column and the error it gives is not one anybody should
  // have to read.
  let out: string | number | null = trimmed === "" ? null : trimmed;
  if (NUMERIC.has(field)) {
    out = trimmed === "" ? null : Number(trimmed);
    if (out !== null && Number.isNaN(out)) return { error: "That needs to be a number." };
  }
  if (DATE_OR_TIME.has(field) && trimmed === "") out = null;

  // The cast is the price of a generic field saver. It is safe because
  // EDITABLE above is checked first: `field` is one of a fixed set of
  // real column names by the time it gets here.
  const patch = { [field]: out } as Partial<Initiative>;

  const { error } = await supabase
    .from("initiatives")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/app/events/${id}`);
  return {};
}

export async function setVenueBooked(id: string, booked: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("initiatives").update({ venue_booked: booked }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/app/events/${id}`);
  return {};
}

/**
 * An ihsan prompt's answer.
 *
 * `response` is free text, not a tick, on purpose. "Bukhoor lit" can
 * be ticked without a thought; "who is lighting it, and when?" has to
 * be answered with a name.
 */
export async function saveIhsanResponse(
  promptId: string,
  initiativeId: string,
  response: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("initiative_ihsan_prompts")
    .update({ response: response.trim() || null })
    .eq("id", promptId);
  if (error) return { error: error.message };
  revalidatePath(`/app/events/${initiativeId}`);
  return {};
}

export async function createInitiative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const templateId = String(formData.get("template_id") ?? "");
  const { data: template } = await supabase
    .from("initiative_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return { error: "Pick what sort of thing this is.", ok: null };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give it a name.", ok: null };

  const startsOn = String(formData.get("starts_on") ?? "").trim();

  const { data: created, error } = await supabase
    .from("initiatives")
    .insert({
      template_id: template.id,
      kind: template.kind,
      initiative_type: template.initiative_type,
      title,
      starts_on: startsOn || null,
      starts_at: String(formData.get("starts_at") ?? "").trim() || null,
      lead_id: String(formData.get("lead_id") ?? "").trim() || user.id,
      safeguarding_purge_weeks: template.safeguarding_purge_weeks,
      created_by: user.id,
    })
    .select("id")
    .single();

  // The insert reads the row back, which evaluates the SELECT policy
  // as well — see migration 0007 for the hour this cost last time.
  if (error || !created) {
    return { error: error?.message ?? "Could not create it.", ok: null };
  }

  redirect(`/app/events/${created.id}`);
}

export async function submitForApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("initiatives")
    .update({ stage: "proposal", submitted_by: user.id, submitted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message, ok: null };

  await supabase.from("initiative_approvals").insert({
    initiative_id: id,
    action: "submitted",
    actor_id: user.id,
    comment: String(formData.get("comment") ?? "").trim() || null,
  });

  // Everyone who can approve gets told. Without this the proposal sits
  // in a stage nobody is looking at.
  const { data: approvers } = await supabase
    .from("profiles")
    .select("id")
    .eq("tier", "shura")
    .eq("is_active", true);

  const { data: initiative } = await supabase
    .from("initiatives").select("title").eq("id", id).maybeSingle();

  if (approvers?.length) {
    await notifyMany(
      createAdminClient(),
      approvers.map((a) => a.id),
      {
        kind: "event_decision",
        title: `Proposal to approve: ${initiative?.title ?? "an event"}`,
        body: "Someone has put this forward. It cannot be planned until it is approved or returned.",
        href: `/app/events/${id}`,
      },
    );
  }

  revalidatePath(`/app/events/${id}`);
  return { error: null, ok: "Sent to the shura." };
}

/**
 * Approve it, and build the plan.
 *
 * apply_template_to_initiative() does the work in SQL: roles, run
 * sheet, ihsan prompts, risks, equipment, and milestones dated
 * backwards from the start date with a task each. It is in the
 * database rather than here so it cannot half-happen — an approval
 * that creates nine of fifteen tasks is worse than one that fails.
 */
export async function approveInitiative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("initiatives")
    .update({ stage: "planning", approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message, ok: null };

  await supabase.from("initiative_approvals").insert({
    initiative_id: id, action: "approved", actor_id: user.id,
    comment: String(formData.get("comment") ?? "").trim() || null,
  });

  const { data: made, error: rpcError } = await supabase
    .rpc("apply_template_to_initiative", { p_id: id });
  if (rpcError) return { error: `Approved, but the plan did not build: ${rpcError.message}`, ok: null };

  // The media plan, dated backwards from the event like the milestones
  // (spec 4.11). A failure here is worth reporting but must not undo
  // the approval — the event is approved either way, and a missing
  // poster task is recoverable in a way an un-approved event is not.
  const { error: mediaError } = await supabase
    .rpc("build_initiative_media_plan", { p_id: id });

  const { data: initiative } = await supabase
    .from("initiatives").select("title, lead_id").eq("id", id).maybeSingle();
  if (initiative?.lead_id) {
    await notifyMany(createAdminClient(), [initiative.lead_id], {
      kind: "event_decision",
      title: `Approved: ${initiative.title}`,
      body: `${made ?? 0} milestones are on the plan, dated backwards from the day itself.`,
      href: `/app/events/${id}`,
    });
  }

  revalidatePath(`/app/events/${id}`);
  revalidatePath("/app/tasks");
  return {
    error: null,
    ok: `Approved. ${made ?? 0} milestones created.${
      mediaError ? " The media plan did not build — add it by hand." : ""
    }`,
  };
}

export async function returnForChanges(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  // Returning something without saying why is how people give up on a
  // proposal rather than fix it.
  if (!comment) return { error: "Say what needs changing.", ok: null };

  const { error } = await supabase.from("initiatives").update({ stage: "idea" }).eq("id", id);
  if (error) return { error: error.message, ok: null };

  await supabase.from("initiative_approvals").insert({
    initiative_id: id, action: "returned", actor_id: user.id, comment,
  });

  const { data: initiative } = await supabase
    .from("initiatives").select("title, submitted_by").eq("id", id).maybeSingle();
  if (initiative?.submitted_by) {
    await notifyMany(createAdminClient(), [initiative.submitted_by], {
      kind: "event_decision",
      title: `Returned with comments: ${initiative.title}`,
      body: comment,
      href: `/app/events/${id}`,
    });
  }

  revalidatePath(`/app/events/${id}`);
  return { error: null, ok: "Returned." };
}

const FORWARD: Partial<Record<InitiativeStage, InitiativeStage>> = {
  planning: "live",
  live: "wrap_up",
};

export async function advanceStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const from = String(formData.get("from") ?? "") as InitiativeStage;
  const next = FORWARD[from];
  if (!next) return { error: "That is not a move this can make.", ok: null };

  const { error } = await supabase.from("initiatives").update({ stage: next }).eq("id", id);
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/events/${id}`);
  return { error: null, ok: null };
}

// ---------------------------------------------------------------
// Retrospective, ihsan ratings, and closing
// ---------------------------------------------------------------

const RETRO_FIELDS = new Set([
  "went_well", "challenges", "improve", "change_next", "summary", "feedback",
]);

export async function saveRetrospectiveField(
  initiativeId: string,
  field: string,
  value: string,
): Promise<{ error?: string }> {
  if (!RETRO_FIELDS.has(field)) return { error: "That field cannot be edited here." };

  const supabase = createClient();
  // Upsert, because the retrospective row does not exist until
  // somebody types the first word into it.
  // Same cast, same reason as saveInitiativeField: RETRO_FIELDS has
  // already narrowed `field` to a real column name.
  const patch = {
    initiative_id: initiativeId,
    [field]: value.trim() || null,
  } as Pick<InitiativeRetrospective, "initiative_id"> & Partial<InitiativeRetrospective>;

  const { error } = await supabase
    .from("initiative_retrospectives")
    .upsert(patch, { onConflict: "initiative_id" });
  if (error) return { error: error.message };
  revalidatePath(`/app/events/${initiativeId}/retrospective`);
  return {};
}

/**
 * One person's score for one dimension.
 *
 * Stored per rater rather than as a single number for the event: one
 * person's 5 and another's 2 on the same night means they experienced
 * different events, and that is the finding, not noise to average away.
 */
export async function rateIhsan(
  initiativeId: string,
  dimension: string,
  score: number,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: "Scores run 1 to 5." };

  const { error } = await supabase
    .from("initiative_ihsan_ratings")
    .upsert(
      {
        initiative_id: initiativeId,
        rater_id: user.id,
        dimension: dimension as IhsanDimension,
        score,
      },
      { onConflict: "initiative_id,rater_id,dimension" },
    );
  if (error) return { error: error.message };
  revalidatePath(`/app/events/${initiativeId}/retrospective`);
  return {};
}

export async function finaliseRetrospective(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("initiative_retrospectives")
    .update({ is_final: true, finalised_by: user.id, finalised_at: new Date().toISOString() })
    .eq("initiative_id", id);

  // The 100-word rule is a CHECK constraint, so this is where it
  // surfaces. Translate it — nobody should have to read a constraint
  // name to find out what went wrong.
  if (error) {
    const tooShort = /final_retro_needs_a_real_summary/.test(error.message);
    return {
      error: tooShort
        ? "The summary needs to be at least 100 words. A retrospective shorter than that is a note, not a record."
        : error.message,
      ok: null,
    };
  }

  revalidatePath(`/app/events/${id}/retrospective`);
  return { error: null, ok: "Signed off." };
}

export async function closeInitiative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");

  const { error } = await supabase.from("initiatives").update({ stage: "closed" }).eq("id", id);
  if (error) {
    // The database trigger, not the form, is what refuses this.
    const noRetro = /retrospective/i.test(error.message);
    return {
      error: noRetro
        ? "It cannot be closed until the retrospective is written and signed off."
        : error.message,
      ok: null,
    };
  }
  revalidatePath(`/app/events/${id}`);
  return { error: null, ok: "Closed." };
}

/**
 * Push what was learned back into the template.
 *
 * This is the ratchet: without it every event starts from the same
 * blank template and the organisation learns nothing it does not
 * personally remember. What moves across is the ihsan prompts as they
 * were actually rewritten for this event, because a prompt somebody
 * changed under pressure is a better prompt than the one shipped.
 */
export async function pushLessonsIntoTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");

  const { data: initiative } = await supabase
    .from("initiatives").select("template_id").eq("id", id).maybeSingle();
  if (!initiative?.template_id) return { error: "This was not built from a template.", ok: null };

  const { data: prompts } = await supabase
    .from("initiative_ihsan_prompts")
    .select("section, dimension, prompt, position")
    .eq("initiative_id", id);

  if (!prompts?.length) return { error: "Nothing to push across.", ok: null };

  // Replace rather than merge. Two near-identical prompts in a
  // template is how a checklist becomes something people skim.
  const { error: clearError } = await supabase
    .from("template_ihsan_prompts")
    .delete()
    .eq("template_id", initiative.template_id);
  if (clearError) return { error: clearError.message, ok: null };

  const { error } = await supabase.from("template_ihsan_prompts").insert(
    prompts.map((p) => ({
      template_id: initiative.template_id as string,
      section: p.section,
      dimension: p.dimension,
      prompt: p.prompt,
      position: p.position,
    })),
  );
  if (error) return { error: error.message, ok: null };

  return { error: null, ok: `${prompts.length} prompts are now the template's.` };
}
