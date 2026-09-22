import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { Sparkline } from "@/components/Sparkline";
import { card, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Still mostly a placeholder — the full per-person dashboard is spec
 * 4.2 and lands in Prompt 9, once every module it summarises exists.
 *
 * What is here now is the part Prompt 7 asks for: OKR progress and the
 * headline KPIs, for whoever is permitted to see them. Everything is
 * behind a permission check AND behind RLS, so a muhsinun loading this
 * page gets the greeting and nothing else without the page having to
 * decide that itself.
 */
export default async function DashboardPage() {
  const viewer = await loadViewer();
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, tier, is_ansar")
    .eq("id", user?.id ?? "")
    .single();

  const tierLabel = profile?.tier
    ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)
    : "Ansar only";

  const seesOkrs = viewer?.can("okr.manage") || viewer?.can("okr.update_own");
  const seesKpis = viewer?.can("kpi.view") ?? false;
  const year = new Date().getFullYear();

  const [{ data: objectives }, { data: results }, { data: kpis }, { data: kpiValues }] =
    await Promise.all([
      seesOkrs
        ? supabase.from("objectives").select("id, title").eq("year", year).eq("status", "active")
        : Promise.resolve({ data: null }),
      seesOkrs
        ? supabase.from("key_result_progress").select("objective_id, percent_complete, owner_id, title, current_value, target_value, unit")
        : Promise.resolve({ data: null }),
      seesKpis
        ? supabase.from("kpis").select("id, key, name, unit, direction").eq("is_active", true).order("position").limit(4)
        : Promise.resolve({ data: null }),
      seesKpis
        ? supabase.from("kpi_values").select("kpi_id, period, value").order("period")
        : Promise.resolve({ data: null }),
    ]);

  const mine = (results ?? []).filter((k) => k.owner_id === viewer?.id);

  return (
    <main style={{ padding: "32px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: "0 0 4px" }}>
        Assalamu alaikum{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
      </h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 28px" }}>
        {tierLabel}{profile?.is_ansar ? " + Ansar" : ""}
      </p>

      {/* Your own key results first. A dashboard that opens with the
          organisation's average is a dashboard nobody acts on. */}
      {mine.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Yours to move</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {mine.map((k, n) => (
              <Link key={n} href="/app/strategy/okrs" style={{ ...card, textDecoration: "none", display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-1)", fontSize: 14 }}>{k.title}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                    {k.current_value} / {k.target_value} {k.unit ?? ""}
                  </span>
                </div>
                <div style={{ height: 5, background: "var(--border)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${k.percent_complete}%`, height: "100%", background: "var(--accent)" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seesOkrs && (objectives ?? []).length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Objectives, {year}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(objectives ?? []).map((o) => {
              const krs = (results ?? []).filter((k) => k.objective_id === o.id);
              const pct = krs.length
                ? Math.round(krs.reduce((s, k) => s + k.percent_complete, 0) / krs.length)
                : 0;
              return (
                <Link key={o.id} href="/app/strategy/okrs" style={{ ...card, textDecoration: "none", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-1)", fontSize: 14 }}>{o.title}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 13,
                      color: pct >= 70 ? "#1e8449" : pct >= 30 ? "var(--text-2)" : "var(--accent)",
                    }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                    {krs.length === 0 ? "No key results — an objective without one is a wish" : `${krs.length} key results`}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {seesKpis && (kpis ?? []).length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Where the numbers are</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(kpis ?? []).map((k) => {
              const series = (kpiValues ?? []).filter((v) => v.kpi_id === k.id).map((v) => Number(v.value));
              const latest = series.at(-1);
              return (
                <Link key={k.id} href="/app/strategy/kpis"
                  style={{ ...card, flex: "1 1 170px", minWidth: 160, textDecoration: "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                    {k.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--text-1)", marginTop: 4 }}>
                    {latest != null ? `${k.unit === "£" ? "£" : ""}${latest}${k.unit && k.unit !== "£" ? ` ${k.unit}` : ""}` : "—"}
                  </div>
                  {series.length >= 2 && <div style={{ marginTop: 6 }}><Sparkline values={series} width={140} height={22} fill={false} /></div>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!seesOkrs && !seesKpis && (
        <div style={card}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 8px" }}>
            Your tasks and events
          </h2>
          <p style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
            The full dashboard is spec 4.2 and is built in Prompt 9, once every module it
            summarises exists. In the meantime,{" "}
            <Link href="/app/tasks" style={{ color: "var(--accent)" }}>your tasks</Link> and{" "}
            <Link href="/app/events" style={{ color: "var(--accent)" }}>events</Link> are the
            two places to be.
          </p>
        </div>
      )}
    </main>
  );
}
