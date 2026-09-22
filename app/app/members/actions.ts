"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DbsStatus, Position, TeamKey, Tier } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Every write below goes through the ordinary signed-in client, not
 * the service role. That means the RLS policies from 0002 decide
 * whether it lands — a sabiqun posting this form by hand gets nothing,
 * without this file needing a permission check of its own.
 *
 * The one exception is inviting, which has to create an auth user and
 * genuinely cannot be done as the caller. That one checks explicitly.
 */
export async function updateMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing member.", ok: null };

  const tierRaw = String(formData.get("tier") ?? "");
  const positionRaw = String(formData.get("position") ?? "");
  const dbsRaw = String(formData.get("dbs_status") ?? "");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(formData.get("full_name")),
      nickname: str(formData.get("nickname")),
      phone: str(formData.get("phone")),
      // "" is the "Ansar only" option in the select, and it must land
      // as NULL rather than as an empty string that fails the check
      // constraint. Null tier is a real state — see spec section 2.
      tier: (tierRaw || null) as Tier | null,
      is_ansar: formData.get("is_ansar") === "on",
      position: (positionRaw || null) as Position | null,
      is_active: formData.get("is_active") === "on",
      skills: str(formData.get("skills"))?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
      availability: str(formData.get("availability")),
      dbs_status: (dbsRaw || null) as DbsStatus | null,
      dbs_expiry: str(formData.get("dbs_expiry")),
      first_aid_trained: formData.get("first_aid_trained") === "on",
      first_aid_expiry: str(formData.get("first_aid_expiry")),
      date_joined: str(formData.get("date_joined")),
    })
    .eq("id", id);

  if (error) return { error: error.message, ok: null };

  // Teams: replace the set rather than diff it. The list is at most
  // five rows per person, so a delete-then-insert is simpler than
  // working out what changed and cannot drift out of step.
  const chosen = formData.getAll("teams").map(String) as TeamKey[];
  await supabase.from("team_members").delete().eq("profile_id", id);
  if (chosen.length > 0) {
    await supabase.from("team_members").insert(chosen.map((team_key) => ({ profile_id: id, team_key })));
  }

  revalidatePath(`/app/members/${id}`);
  revalidatePath("/app/members");
  return { error: null, ok: "Saved." };
}

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const profileId = String(formData.get("profile_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "Write something first.", ok: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("member_notes")
    .insert({ profile_id: profileId, body, author_id: user?.id ?? null });

  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/members/${profileId}`);
  return { error: null, ok: "Note added." };
}

function str(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}
