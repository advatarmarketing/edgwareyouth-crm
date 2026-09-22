import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { Sparkline } from "@/components/Sparkline";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { recordKpiValue, refreshAutoKpis } from "../actions";
import { KpiValueForm, RefreshKpisForm } from "../StrategyForms";

export const dynamic = "force-dynamic";

export default async function KpisPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("kpi.view")) redirect("/app/strategy");

  const supabase = createClient();

  const [{ data: kpis }, { data: values }] = await Promise.all([
    supabase.from("kpis").select("*").eq("is_active", true).order("position"),
    supabase.from("kpi_values").select("*").order("period"),
  ]);

  const canEdit = viewer.can("strategy.edit");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/strategy" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Strategy</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>KPIs</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 20px", lineHeight: 1.6 }}>
        The ones the CRM can work out, it works out. The rest are typed in each month.
        A number somebody entered by hand is never overwritten by a recalculation —
        if you counted the room and the system disagrees, you were there and it was not.
      </p>

      {canEdit && (
        <section style={{ ...card, marginBottom: 20 }}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Recalculate</h2>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>
            Leave the month blank for this one.
          </p>
          <RefreshKpisForm action={refreshAutoKpis} />
        </section>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {(kpis ?? []).map((k) => {
          const series = (values ?? []).filter((v) => v.kpi_id === k.id);
          const numbers = series.map((v) => Number(v.value));
          const latest = series.at(-1);
          const previous = series.at(-2);
          const change =
            latest && previous && Number(previous.value) !== 0
              ? Math.round(((Number(latest.value) - Number(previous.value)) / Number(previous.value)) * 100)
              : null;
          // A KPI going the wrong way is the only thing here worth a colour.
          const goodDirection =
            change == null ? null : k.direction === "up" ? change >= 0 : change <= 0;

          return (
            <section key={k.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <strong style={{ color: "var(--text-1)", fontSize: 15 }}>{k.name}</strong>
                  <span style={{
                    marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    color: k.is_auto ? "var(--accent)" : "var(--text-3)",
                  }}>
                    {k.is_auto ? "calculated" : "typed in"}
                  </span>
                  {k.description && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{k.description}</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--text-1)" }}>
                    {latest ? `${Number(latest.value)}${k.unit && k.unit !== "£" ? ` ${k.unit}` : ""}` : "—"}
                  </div>
                  {change != null && (
                    <div style={{ fontSize: 12, color: goodDirection ? "#1e8449" : "#c0392b" }}>
                      {change > 0 ? "+" : ""}{change}% on last month
                    </div>
                  )}
                </div>
              </div>

              {numbers.length >= 2 && (
                <div style={{ marginTop: 10 }}>
                  <Sparkline values={numbers} width={280} height={34} />
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                    {series.length} months
                    {latest && !latest.is_auto && k.is_auto && " · latest entered by hand, so it is left alone"}
                  </div>
                </div>
              )}

              {canEdit && <KpiValueForm kpiId={k.id} action={recordKpiValue} />}
            </section>
          );
        })}
      </div>
    </main>
  );
}
