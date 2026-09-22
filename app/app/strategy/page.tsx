import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { EditableField } from "@/components/EditableField";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { addYearPlanGoal, saveStatement } from "./actions";
import { GoalForm } from "./StrategyForms";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  dropped: "Dropped",
};

export default async function StrategyPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const year = new Date().getFullYear();

  const [{ data: statements }, { data: values }, { data: priorities }, { data: goals }, { data: people }] =
    await Promise.all([
      supabase.from("org_statements").select("*").order("position"),
      supabase.from("org_values").select("*").order("position"),
      supabase.from("org_priorities").select("*").eq("is_active", true).order("number"),
      supabase.from("year_plan_goals").select("*").eq("year", year).order("quarter").order("position"),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
    ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const canEdit = viewer.can("strategy.edit");
  const seesPlan = viewer.can("yearplan.view");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={pageTitle}>Strategy</h1>

      <div style={{ display: "flex", gap: 14, margin: "10px 0 24px", fontFamily: "var(--font-mono)", fontSize: 12, flexWrap: "wrap" }}>
        {(viewer.can("okr.manage") || viewer.can("okr.update_own")) && (
          <Link href="/app/strategy/okrs" style={{ color: "var(--text-3)" }}>OKRs</Link>
        )}
        {viewer.can("kpi.view") && <Link href="/app/strategy/kpis" style={{ color: "var(--text-3)" }}>KPIs</Link>}
      </div>

      {/* VMV — the one part of the strategy everybody can read. */}
      <section style={{ marginBottom: 24 }}>
        {(statements ?? []).map((s) => (
          <div key={s.key} style={{ ...card, marginBottom: 10 }}>
            <h2 style={{ ...sectionTitle, marginTop: 0 }}>{s.label}</h2>
            {canEdit ? (
              <EditableField value={s.body} onSave={saveStatement.bind(null, s.key)} as="textarea" />
            ) : (
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--text-1)" }}>{s.body}</p>
            )}
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Values</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {(values ?? []).map((v) => (
            <div key={v.id} style={{ ...card, padding: "10px 14px" }}>
              <strong style={{ color: "var(--text-1)" }}>{v.name}</strong>
              {v.description && <span style={{ color: "var(--text-3)" }}> — {v.description}</span>}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Priorities</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {(priorities ?? []).map((p) => (
            <div key={p.id} style={{ ...card, padding: "10px 14px", display: "flex", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)" }}>{p.number}</span>
              <div>
                <strong style={{ color: "var(--text-1)" }}>{p.title}</strong>
                {p.description && <div style={{ color: "var(--text-3)", fontSize: 13 }}>{p.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The year plan. Sabiqun see it by tier; ansar and muhsinun only
          if the shura grant them yearplan.view — "only if invited". */}
      {seesPlan ? (
        <section>
          <h2 style={sectionTitle}>Year plan {year}</h2>
          {[1, 2, 3, 4].map((q) => {
            const inQuarter = (goals ?? []).filter((g) => g.quarter === q);
            return (
              <div key={q} style={{ marginBottom: 16 }}>
                <h3 style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.06em", color: "var(--text-3)", margin: "0 0 6px" }}>
                  Q{q}
                </h3>
                {inQuarter.length === 0 ? (
                  <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>Nothing set.</p>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {inQuarter.map((g) => (
                      <div key={g.id} style={{ ...card, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <strong style={{ color: "var(--text-1)" }}>{g.title}</strong>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", color: "var(--text-3)" }}>
                            {STATUS_LABEL[g.status]}
                          </span>
                        </div>
                        {g.detail && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-2)" }}>{g.detail}</p>}
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                          {g.owner_id ? nameOf.get(g.owner_id) ?? "Unknown" : "Nobody yet"}
                          {g.initiative_id && (
                            <>
                              {" · "}
                              <Link href={`/app/events/${g.initiative_id}`} style={{ color: "var(--accent)" }}>the event</Link>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {canEdit && (
            <div style={{ ...card, marginTop: 8 }}>
              <h3 style={{ ...sectionTitle, marginTop: 0 }}>Add a goal</h3>
              <GoalForm year={year} people={people ?? []} priorities={priorities ?? []} action={addYearPlanGoal} />
            </div>
          )}
        </section>
      ) : (
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>
          The year plan is shared with the shura and sabiqun, and with anyone else the shura
          invite. Ask them if you need it.
        </p>
      )}
    </main>
  );
}
