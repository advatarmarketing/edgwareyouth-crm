import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { displayName } from "@/lib/names";
import { EditableField } from "@/components/EditableField";
import { card, fieldLabel, pageTitle, sectionTitle } from "@/lib/ui";
import {
  addContentItem, saveGuideline, saveMediaReview, savePlatformField, setContentStatus,
} from "./actions";
import { ContentItemForm, MediaReviewForm, StatusPicker } from "./MediaForms";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: goals }, { data: platforms }, { data: pillars },
    { data: calendar }, { data: guidelines }, { data: reviews }, { data: people },
  ] = await Promise.all([
    supabase.from("media_goals").select("*").order("position"),
    supabase.from("media_platforms").select("*").eq("is_active", true).order("position"),
    supabase.from("content_pillars").select("*").order("position"),
    supabase.from("content_calendar").select("*").gte("planned_for", today).order("planned_for").limit(40),
    supabase.from("media_guidelines").select("*").order("position"),
    supabase.from("media_reviews").select("*").order("month", { ascending: false }).limit(6),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, displayName(p.full_name)]));
  const pillarOf = new Map((pillars ?? []).map((p) => [p.id, p.name]));
  const canEdit = viewer.can("media.edit") || viewer.can("media.manage");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={pageTitle}>Media</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        Planning only. There is no editing queue and no approval workflow here — what gets
        made is made wherever you already make it. This is what, where, when and who.
      </p>

      {(goals ?? []).length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionTitle}>Goals</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(goals ?? []).map((g) => {
              const pct = g.target ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target)) * 100)) : 0;
              return (
                <div key={g.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--text-1)" }}>{g.title}</strong>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                      {Number(g.current_value)}{g.target && ` / ${Number(g.target)}`} {g.metric ?? ""}
                    </span>
                  </div>
                  {g.target && (
                    <div style={{ height: 5, background: "var(--border)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                  )}
                  {g.key_result_id && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                      Serves a <Link href="/app/strategy/okrs" style={{ color: "var(--accent)" }}>key result</Link>.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Content calendar</h2>
        {(calendar ?? []).length === 0 ? (
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>Nothing planned from today onwards.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {(calendar ?? []).map((c) => (
              <div key={c.id} style={{ ...card, padding: "10px 14px", display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginRight: 8 }}>
                    {new Date(c.planned_for).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <strong style={{ color: "var(--text-1)", fontSize: 14 }}>{c.title}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    {c.platform ?? "No platform"}
                    {c.pillar_id && ` · ${pillarOf.get(c.pillar_id)}`}
                    {c.owner_id && ` · ${nameOf.get(c.owner_id)}`}
                    {c.initiative_id && (
                      <>
                        {" · "}
                        <Link href={`/app/events/${c.initiative_id}`} style={{ color: "var(--accent)" }}>the event</Link>
                      </>
                    )}
                  </div>
                </div>
                {canEdit ? (
                  <StatusPicker id={c.id} status={c.status} onChange={setContentStatus} />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", color: "var(--text-3)" }}>
                    {c.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div style={{ ...card, marginTop: 10 }}>
            <h3 style={{ ...sectionTitle, marginTop: 0 }}>Plan a post</h3>
            <ContentItemForm
              platforms={platforms ?? []}
              pillars={pillars ?? []}
              people={people ?? []}
              action={addContentItem}
            />
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Pillars</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {(pillars ?? []).map((p) => (
            <div key={p.id} style={{ ...card, padding: "10px 14px" }}>
              <strong style={{ color: "var(--text-1)" }}>{p.name}</strong>
              {p.description && <span style={{ color: "var(--text-3)" }}> — {p.description}</span>}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Platforms</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {(platforms ?? []).map((p) => (
            <div key={p.id} style={card}>
              <strong style={{ color: "var(--text-1)" }}>{p.platform}</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {(["purpose", "audience", "frequency", "what_works"] as const).map((f) => (
                  <div key={f} style={{ display: "grid", gap: 3 }}>
                    <span style={fieldLabel}>{f === "what_works" ? "What works" : f}</span>
                    {canEdit ? (
                      <EditableField value={p[f] ?? ""} onSave={savePlatformField.bind(null, p.id, f)} as="textarea" />
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--text-2)" }}>{p[f] ?? "—"}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={sectionTitle}>Brand and tone</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(guidelines ?? []).map((g) => (
            <div key={g.id} style={card}>
              <span style={fieldLabel}>{g.section}</span>
              <div style={{ marginTop: 4 }}>
                {canEdit ? (
                  <EditableField value={g.body} onSave={saveGuideline.bind(null, g.id)} as="textarea" />
                ) : (
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--text-1)" }}>{g.body}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canEdit && (
        <section>
          <h2 style={sectionTitle}>Monthly review</h2>
          {(reviews ?? []).length > 0 && (
            <div style={{ ...card, marginBottom: 10 }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {(reviews ?? []).map((r) => (
                  <li key={r.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: "var(--text-2)" }}>
                      {new Date(r.month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                      {r.followers ?? "—"} followers · {r.posts ?? "—"} posts
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={card}>
            <MediaReviewForm action={saveMediaReview} />
          </div>
        </section>
      )}
    </main>
  );
}
