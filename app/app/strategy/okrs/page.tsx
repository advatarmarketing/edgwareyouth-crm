import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { EditableField } from "@/components/EditableField";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { addKeyResult, addObjective, updateKeyResultValue } from "../actions";
import { KeyResultForm, ObjectiveForm } from "../StrategyForms";

export const dynamic = "force-dynamic";

export default async function OkrsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const year = new Date().getFullYear();

  const [{ data: objectives }, { data: results }, { data: priorities }, { data: people }] =
    await Promise.all([
      supabase.from("objectives").select("*").eq("year", year).order("position"),
      supabase.from("key_result_progress").select("*").order("position"),
      supabase.from("org_priorities").select("id, number, title").order("number"),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
    ]);

  // Empty for ansar and muhsinun: neither tier holds either OKR
  // permission, so RLS returns nothing and there is no page to show.
  if ((objectives ?? []).length === 0 && !viewer.can("okr.manage")) {
    return (
      <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
        <Link href="/app/strategy" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Strategy</Link>
        <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>OKRs</h1>
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing here for you at the moment.</p>
      </main>
    );
  }

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const priorityOf = new Map((priorities ?? []).map((p) => [p.id, p]));
  const canManage = viewer.can("okr.manage");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/strategy" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Strategy</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>OKRs {year}</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Each objective serves one of the five priorities. You can update the key results you
        own; changing anybody else&apos;s is the shura&apos;s job.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        {(objectives ?? []).map((o) => {
          const krs = (results ?? []).filter((k) => k.objective_id === o.id);
          const priority = o.priority_id ? priorityOf.get(o.priority_id) : null;
          const overall = krs.length
            ? Math.round(krs.reduce((sum, k) => sum + k.percent_complete, 0) / krs.length)
            : 0;

          return (
            <section key={o.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <h2 style={{ ...sectionTitle, marginTop: 0, marginBottom: 2 }}>{o.title}</h2>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {priority ? `Priority ${priority.number} — ${priority.title}` : "No priority set"}
                    {o.quarter ? ` · Q${o.quarter}` : " · all year"}
                    {o.owner_id && ` · ${nameOf.get(o.owner_id)}`}
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: overall >= 70 ? "#1e8449" : overall >= 30 ? "var(--text-1)" : "var(--accent)" }}>
                  {overall}%
                </span>
              </div>

              {krs.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13, margin: "10px 0 0" }}>
                  No key results yet. An objective without one is a wish.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {krs.map((k) => {
                    const isOwner = k.owner_id === viewer.id;
                    const canWrite = canManage || (isOwner && viewer.can("okr.update_own"));
                    return (
                      <div key={k.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, color: "var(--text-1)" }}>{k.title}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                            {k.current_value} / {k.target_value} {k.unit ?? ""}
                            {k.direction === "down" && " (down is good)"}
                          </span>
                        </div>
                        <div style={{ height: 6, background: "var(--border)", borderRadius: 3, marginTop: 5, overflow: "hidden" }}>
                          <div style={{ width: `${k.percent_complete}%`, height: "100%", background: "var(--accent)" }} />
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                            {k.owner_id ? (isOwner ? "Yours" : nameOf.get(k.owner_id)) : "Nobody owns this"}
                          </span>
                          {canWrite && (
                            <div style={{ width: 120 }}>
                              <EditableField
                                value={String(k.current_value)}
                                onSave={updateKeyResultValue.bind(null, k.id)}
                                mono
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canManage && <KeyResultForm objectiveId={o.id} people={people ?? []} action={addKeyResult} />}
            </section>
          );
        })}
      </div>

      {canManage && (
        <section style={{ ...card, marginTop: 20 }}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Add an objective</h2>
          <ObjectiveForm year={year} people={people ?? []} priorities={priorities ?? []} action={addObjective} />
        </section>
      )}
    </main>
  );
}
