import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { displayName } from "@/lib/names";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { markMilestone, refreshDevelopment } from "./actions";
import { MarkMilestoneForm, RefreshForm } from "./DevelopmentForms";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  const [{ data: milestones }, { data: progress }, { data: ready }, { data: people }, { data: dawahLive }] =
    await Promise.all([
      supabase.from("development_milestones").select("*").eq("is_active", true).order("position"),
      supabase.from("development_progress").select("*"),
      supabase.from("ready_to_step_up").select("*"),
      supabase.from("member_directory").select("id, full_name, tier").eq("is_active", true).order("full_name"),
      supabase.rpc("dawah_is_live"),
    ]);

  const seesEveryone = viewer.can("development.view_all");
  const nameOf = new Map((people ?? []).map((p) => [p.id, displayName(p.full_name)]));

  const progressFor = (profileId: string, milestoneId: string) =>
    (progress ?? []).find((d) => d.profile_id === profileId && d.milestone_id === milestoneId);

  const met = (profileId: string, m: { id: string; target_count: number }) => {
    const d = progressFor(profileId, m.id);
    return d?.marked_done || (d?.count_so_far ?? 0) >= m.target_count;
  };

  const mineMet = (milestones ?? []).filter((m) => met(viewer.id, m)).length;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={pageTitle}>Development</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        The path from Muhsinun to Sabiqun. Most of it counts itself from what you have already
        done; the rest is ticked off by the shura.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={sectionTitle}>
          Yours — {mineMet} of {(milestones ?? []).length}
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(milestones ?? []).map((m) => {
            const d = progressFor(viewer.id, m.id);
            const done = met(viewer.id, m);
            const count = d?.count_so_far ?? 0;
            const pct = Math.min(100, Math.round((count / m.target_count) * 100));
            return (
              <div key={m.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <strong style={{ color: done ? "#1e8449" : "var(--text-1)" }}>
                      {done ? "✓ " : ""}{m.name}
                    </strong>
                    {m.description && (
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{m.description}</div>
                    )}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                    {m.auto_source
                      ? `${count} / ${m.target_count}`
                      : d?.marked_done
                        ? "ticked by the shura"
                        : "not yet"}
                  </span>
                </div>
                {m.auto_source && !done && (
                  <div style={{ height: 5, background: "var(--border)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {seesEveryone && (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Ready to step up</h2>
            <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 10px", lineHeight: 1.6 }}>
              A suggestion, not a promotion. The system can count what somebody has done; it
              cannot tell you whether they are ready, and it should not pretend to.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {(ready ?? []).length === 0 && (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No muhsinun on the list yet.</p>
              )}
              {(ready ?? [])
                .slice()
                .sort((a, b) => b.met / b.total - a.met / a.total)
                .map((r) => (
                  <div key={r.profile_id} style={{ ...card, padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--text-1)" }}>{displayName(r.full_name)}</strong>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 13,
                      color: r.met === r.total ? "#1e8449" : "var(--text-3)",
                    }}>
                      {r.met} / {r.total}{r.met === r.total && " — ready"}
                    </span>
                  </div>
                ))}
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={sectionTitle}>Tick things off</h2>
            <div style={{ ...card, marginBottom: 10 }}>
              <RefreshForm action={refreshDevelopment} />
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: "8px 0 0", lineHeight: 1.6 }}>
                Recounts events, tasks, meetings and SOP reads. A milestone you ticked by hand
                stays ticked — the counter never touches it.
              </p>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {(people ?? [])
                .filter((p) => p.tier === "muhsinun")
                .map((p) => (
                  <div key={p.id} style={card}>
                    <strong style={{ color: "var(--text-1)" }}>{displayName(p.full_name)}</strong>
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {(milestones ?? [])
                        .filter((m) => m.auto_source == null)
                        .map((m) => {
                          const d = progressFor(p.id, m.id);
                          return (
                            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, color: d?.marked_done ? "#1e8449" : "var(--text-2)" }}>
                                {d?.marked_done ? "✓ " : ""}{m.name}
                              </span>
                              <MarkMilestoneForm
                                profileId={p.id}
                                milestoneId={m.id}
                                done={d?.marked_done ?? false}
                                action={markMilestone}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {/* Built, and switched off until the team goes live (Part B, 5).
          The gate is in RLS, not here: with the team inactive the rows
          cannot be read at all, including through the API. */}
      <section>
        <h2 style={sectionTitle}>Dawah list</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          {dawahLive
            ? "The Dawah/Outreach team is live. Your list is private to you; the shura see totals."
            : "Built and waiting. It switches on with the Dawah/Outreach team — until then the rows are unreadable even through the API, not merely hidden."}
        </p>
      </section>
    </main>
  );
}
