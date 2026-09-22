"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_HOME } from "@/lib/routes";

export interface LoginState {
  error: string | null;
}

/**
 * Signs the user in and sends them to the dashboard.
 *
 * Everyone lands in the same place — this is a staff-only CRM and the
 * tiers share the app. What differs is what the dashboard shows them
 * (spec 4.2), which is decided on that page, not here.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = createClient();

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", signInData.user.id)
    .single();

  if (profileError || !profile) {
    // Shouldn't happen — the on_auth_user_created trigger provisions a
    // profile for every user — but fail safe rather than throw.
    await supabase.auth.signOut();
    return { error: "We couldn't find an account for this login. Speak to one of the shura." };
  }

  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: "This account is no longer active. Speak to one of the shura." };
  }

  redirect(APP_HOME);
}
