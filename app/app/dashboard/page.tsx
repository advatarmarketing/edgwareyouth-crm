import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Placeholder. The real per-tier dashboard is spec 4.2 and lands in
 * Prompt 9, once the modules it summarises exist. Until then this
 * confirms the shell works: you are signed in, the database answered,
 * and the nav knows your tier.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, tier, is_ansar")
    .eq("id", user?.id ?? "")
    .single();

  const tierLabel = profile?.tier
    ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)
    : "Ansar only";

  return (
    <main style={{ padding: "32px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: "0 0 4px" }}>
        Assalamu alaikum{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
      </h1>

      <p style={{ color: "var(--text-2)", margin: "0 0 32px" }}>
        {tierLabel}
        {profile?.is_ansar ? " + Ansar" : ""}
      </p>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 20,
          background: "var(--surface)",
        }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 8px" }}>
          Nothing here yet
        </h2>
        <p style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
          The shell is up and the brand is in. Members, tiers and permissions come next —
          that is Prompt 1 in <code>docs/SPEC.md</code>. The dashboard itself is section 4.2
          and is built last, once there are tasks, meetings and events for it to summarise.
        </p>
      </div>
    </main>
  );
}
