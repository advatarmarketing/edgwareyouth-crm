import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import type { Tier } from "@/lib/supabase/types";

/**
 * Shared shell for everything under /app/*.
 *
 * middleware.ts has already confirmed there is a session and that the
 * account is active by the time this runs. Re-reading the tier here is
 * for the nav only — presentation, not a second enforcement layer.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // A null tier is "Ansar only" and is a valid person — do not treat
  // it as a missing profile. See spec section 2.
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppNav tier={(profile.tier ?? null) as Tier | null} />
      {children}
    </div>
  );
}
