import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { EditableField } from "@/components/EditableField";
import { card, fieldLabel, pageTitle, sectionTitle } from "@/lib/ui";
import {
  closeInitiative,
  finaliseRetrospective,
  pushLessonsIntoTemplate,
  rateIhsan,
  saveRetrospectiveField,
} from "../../actions";
import { StageForm } from "../../EventForms";
import { IhsanRating } from "./IhsanRating";
import type { IhsanDimension } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const DIMENSIONS: IhsanDimension[] = [
  "emotional", "sight", "sound", "smell", "taste", "touch", "personal",
];

export default async function RetrospectivePage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const id = params.id;

  const { data: initiative } = await supabase
    .from("initiatives")
    .select("id, title, stage, template_id")
    .eq("id", id)
    .maybeSingle();
  if (!initiative) notFound();

  const [{ data: retro }, { data: ratings }, { data: scores }] = await Promise.all([
    supabase.from("initiative_retrospectives").select("*").eq("initiative_id", id).maybeSingle(),
    supabase.from("initiative_ihsan_ratings").select("*").eq("initiative_id", id),
    supabase.from("ihsan_scores_by_dimension").select("*").eq("initiative_id", id),
  ]);

  const mine: Record<string, number> = {};
  for (const r of ratings ?? []) if (r.rater_id === viewer.id) mine[r.dimension] = r.score;

  const spread = new Map((scores ?? []).map((s) => [s.dimension, s]));
  const save = (field: string) => saveRetrospectiveField.bind(null, id, field);
  const words = (retro?.summary ?? "").trim().split(/\s+/).filter(Boolean).length;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 760, margin: "0 auto" }}>
      <Link href={`/app/events/${id}`} style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>
        ← {initiative.title}
      </Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Retrospective</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Required before this can be closed. What goes in here is what the next person running
        one of these will read first.
      </p>

      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>How it went</h2>
        <Field label="What went well"><EditableField value={retro?.went_well ?? ""} onSave={save("went_well")} as="textarea" /></Field>
        <Field label="What was hard"><EditableField value={retro?.challenges ?? ""} onSave={save("challenges")} as="textarea" /></Field>
        <Field label="What to improve"><EditableField value={retro?.improve ?? ""} onSave={save("improve")} as="textarea" /></Field>
        <Field label="What to change next time"><EditableField value={retro?.change_next ?? ""} onSave={save("change_next")} as="textarea" /></Field>
        <Field label="Feedback from people who came"><EditableField value={retro?.feedback ?? ""} onSave={save("feedback")} as="textarea" /></Field>
      </section>

      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>The account</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 8px", lineHeight: 1.6 }}>
          At least 100 words. Anything shorter is a note, and a note is no use to whoever runs
          this in two years.{" "}
          <span style={{ fontFamily: "var(--font-mono)", color: words >= 100 ? "var(--text-3)" : "var(--accent)" }}>
            {words}/100
          </span>
        </p>
        <EditableField value={retro?.summary ?? ""} onSave={save("summary")} as="textarea" />
      </section>

      {/* -------------------------------------------------------- */}
      {/* The ihsan scores. There is no ihsan section in the plan — */}
      {/* the prompts live where the decisions are made — but the   */}
      {/* scoring is here, because how it felt can only be judged   */}
      {/* once it is over.                                          */}
      {/* -------------------------------------------------------- */}
      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>How it felt, 1 to 5</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
          Your own scores. Everyone on the team scores separately — if one of you says 5 and
          another says 2, you were at different events, and that is worth finding out.
        </p>
        <IhsanRating initiativeId={id} dimensions={DIMENSIONS} mine={mine} onRate={rateIhsan} />

        {(scores ?? []).length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <h3 style={{ ...fieldLabel, marginBottom: 8 }}>The team, together</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {DIMENSIONS.map((d) => {
                const s = spread.get(d);
                if (!s) return null;
                const split = s.low_score !== s.high_score;
                return (
                  <li key={d} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--text-2)" }}>{d}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: split ? "var(--accent)" : "var(--text-3)" }}>
                      {Number(s.avg_score).toFixed(1)}
                      {split && ` · ${s.low_score}–${s.high_score} across ${s.raters}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>Finish</h2>
        {!retro?.is_final ? (
          <StageForm id={id} label="Sign off the retrospective" action={finaliseRetrospective} />
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>Signed off.</p>
            {initiative.template_id && (
              <div>
                <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 8px", lineHeight: 1.6 }}>
                  Push what you learned back into the template, so the next one starts from
                  what this one found out rather than from the same blank page.
                </p>
                <StageForm id={id} label="Push lessons into the template" action={pushLessonsIntoTemplate} secondary />
              </div>
            )}
            {initiative.stage !== "closed" && (
              <StageForm id={id} label="Close it" action={closeInitiative} />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </div>
  );
}
