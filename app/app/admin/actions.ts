"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import type { PermissionKey, Tier } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Sets one person's permission overrides.
 *
 * Three states per key, not two: "default" removes any override and
 * lets the tier decide, "allow" and "deny" pin it. Deny matters — the
 * shura need to take something away from a person whose tier grants
 * it, and a design where a row only ever means "allow" cannot say
 * that. See the profile_permissions comment in 0002.
 *
 * Writes go through the caller's own client, so the
 * "profile_permissions: manage" policy is what authorises this. A
 * sabiqun posting this form by hand writes nothing.
 */
export async function savePermissions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) return { error: "Missing member.", ok: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: catalogue } = await supabase.from("permissions").select("key");

  const overrides: { profile_id: string; permission_key: PermissionKey; granted: boolean; set_by: string | null }[] = [];
  const clear: PermissionKey[] = [];

  for (const row of catalogue ?? []) {
    const choice = String(formData.get(`perm:${row.key}`) ?? "default");
    if (choice === "allow" || choice === "deny") {
      overrides.push({
        profile_id: profileId,
        permission_key: row.key,
        granted: choice === "allow",
        set_by: user?.id ?? null,
      });
    } else {
      clear.push(row.key);
    }
  }

  if (clear.length > 0) {
    const { error } = await supabase
      .from("profile_permissions")
      .delete()
      .eq("profile_id", profileId)
      .in("permission_key", clear);
    if (error) return { error: error.message, ok: null };
  }

  if (overrides.length > 0) {
    const { error } = await supabase.from("profile_permissions").upsert(overrides);
    if (error) return { error: error.message, ok: null };
  }

  revalidatePath("/app/admin/permissions");
  return { error: null, ok: "Permissions updated." };
}

/**
 * Invites somebody by email and sets their tier at invite time.
 *
 * This is the one action that genuinely needs the service role: it
 * creates an auth user, which the caller cannot do as themselves. So
 * unlike every other write in this app, the permission check here is
 * explicit rather than a policy — and it has to come first.
 */
export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();

  const { data: allowed } = await supabase.rpc("has_permission", { p_key: "members.manage" });
  if (allowed !== true) return { error: "You can't invite people.", ok: null };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const tier = String(formData.get("tier") ?? "");
  const isAnsar = formData.get("is_ansar") === "on";

  if (!email) return { error: "Enter an email address.", ok: null };
  if (!tier && !isAnsar) {
    return { error: "Pick a tier, or tick the Ansar badge for someone who is Ansar only.", ok: null };
  }

  // Refuse rather than send a broken link. The address in the email is
  // wherever THIS copy of the app thinks it lives — and a copy running on
  // somebody's laptop thinks it lives at localhost, which is a link that
  // works on exactly one computer and it is not the recipient's. That is
  // how the first real invite went out.
  const base = siteUrl();
  if (!base || isLocalAddress(base)) {
    return {
      error:
        "Invites can only be sent from the live site. This copy is running on your own " +
        "computer, so the link in the email would point back at it and not work for anyone else.",
      ok: null,
    };
  }

  const admin = createAdminClient();

  // /welcome, not /login. An invited person has an account and no
  // password, so a sign-in page is the one place they cannot get past.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || null },
    redirectTo: `${base}/welcome`,
  });

  // Already has an account. Supabase refuses a second invite to anyone
  // who has clicked their first one — and clicking it is enough, even if
  // the page they landed on was broken. Send a set-your-password link
  // instead, which lands on the same /welcome page.
  if (inviteError && /already been registered|already exists/i.test(inviteError.message)) {
    const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/welcome`,
    });
    if (resetError) return { error: resetError.message, ok: null };
    return {
      error: null,
      ok: `${email} already has an account, so they have been sent a fresh link to set their password instead.`,
    };
  }

  if (inviteError || !invited?.user) {
    return { error: inviteError?.message ?? "Could not send the invite.", ok: null };
  }

  // The on_auth_user_created trigger has made the profile row already;
  // this fills in what only the inviter knows.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName || null,
      email,
      tier: (tier || null) as Tier | null,
      is_ansar: isAnsar,
    })
    .eq("id", invited.user.id);

  if (profileError) return { error: profileError.message, ok: null };

  revalidatePath("/app/members");
  return { error: null, ok: `Invite sent to ${email}.` };
}

function isLocalAddress(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}
