import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { EditableField } from "@/components/EditableField";
import { card, pageTitle, sectionTitle, fieldLabel } from "@/lib/ui";
import {
  advanceStage,
  approveInitiative,
  returnForChanges,
  saveInitiativeField,
  submitForApproval,
} from "../actions";
import { StageForm } from "../EventForms";
import { IhsanPrompts } from "./IhsanPrompts";
import type {
  IhsanSection,
  InitiativeIhsanPrompt,
  InitiativeStage,
  ReadinessIssue,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<InitiativeStage, string> = {
  idea: "Idea",
  proposal: "Waiting on the shura",
  approved: "Approved",
  planning: "Planning",
  live: "Live",
  wrap_up: "Wrapping up",
  closed: "Closed",
};

function riskColour(score: number): string {
  if (score >= 15) return "#c0392b";
  if (score >= 8) return "#b9770e";
  return "#1e8449";
}

export default async function InitiativePage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const id = params.id;

  const { data: initiative } = await supabase
    .from("initiatives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Not on the full file? Fall back to the basics — a volunteer is
  // entitled to know where to turn up and what they are doing.
  if (!initiative) {
    const { data: basics } = await supabase
      .from("initiative_basics")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!basics) notFound();
    return <VolunteerView id={id} />;
  }

  const [
    { data: roles },
    { data: milestones },
    { data: runsheet },
    { data: prompts },
    { data: risks },
    { data: volunteers },
    { data: equipment },
    { data: speakers },
    { data: budget },
    { data: approvals },
    { data: readiness },
    { data: people },
  ] = await Promise.all([
    supabase.from("initiative_roles").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_milestones").select("*").eq("initiative_id", id).order("due_date"),
    supabase.from("initiative_runsheet").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_ihsan_prompts").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_risks").select("*").eq("initiative_id", id).order("score", { ascending: false }),
    supabase.from("initiative_volunteers").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_equipment").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_speakers").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_budget_lines").select("*").eq("initiative_id", id).order("position"),
    supabase.from("initiative_approvals").select("*").eq("initiative_id", id).order("at", { ascending: false }),
    supabase.rpc("initiative_readiness", { p_id: id }),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));
  const canEdit = initiative.stage !== "closed" &&
    (viewer.can("events.approve") ||
      initiative.lead_id === viewer.id ||
      initiative.created_by === viewer.id ||
      (roles ?? []).some((r) => r.profile_id === viewer.id));

  const bySection = (s: IhsanSection): InitiativeIhsanPrompt[] =>
    (prompts ?? []).filter((p) => p.section === s);

  const issues = (readiness ?? []) as ReadinessIssue[];
  const peak = (runsheet ?? []).find((s) => s.is_peak_moment);

  const save = (field: string) => saveInitiativeField.bind(null, id, field);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/events" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Events</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <h1 style={{ ...pageTitle, margin: 0 }}>{initiative.title}</h1>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)" }}>
          {STAGE_LABEL[initiative.stage]}
        </span>
      </div>

      <div style={{ display: "flex", gap: 14, margin: "10px 0 24px", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        <Link href={`/app/events/${id}/live`} style={{ color: "var(--accent)" }}>Live run sheet</Link>
        <Link href={`/app/events/${id}/retrospective`} style={{ color: "var(--text-3)" }}>Retrospective</Link>
      </div>

      {/* ------------------------------------------------------- */}
      {/* Readiness. The price of integrating ihsan rather than    */}
      {/* giving it a section is that scattered prompts are easy   */}
      {/* to skip; this is what catches that, at the moment it     */}
      {/* still matters.                                           */}
      {/* ------------------------------------------------------- */}
      {issues.length > 0 && initiative.stage !== "closed" && (
        <section style={{ ...card, marginBottom: 24, borderColor: "var(--accent)" }}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Not ready yet</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-2)", fontSize: 13, lineHeight: 1.7 }}>
            {issues.map((issue, n) => (
              <li key={n}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", color: "var(--text-3)", marginRight: 6 }}>
                  {issue.section}
                </span>
                {issue.issue}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 1. Overview, including the emotional journey */}
      <Section title="Overview">
        <Grid>
          <Field label="Date"><EditableField value={initiative.starts_on ?? ""} onSave={save("starts_on")} /></Field>
          <Field label="Ends"><EditableField value={initiative.ends_on ?? ""} onSave={save("ends_on")} /></Field>
          <Field label="Starts at"><EditableField value={initiative.starts_at ?? ""} onSave={save("starts_at")} /></Field>
          <Field label="Lead">{nameOf.get(initiative.lead_id ?? "") ?? "Nobody yet"}</Field>
        </Grid>

        <Field label="Background"><EditableField value={initiative.background ?? ""} onSave={save("background")} as="textarea" /></Field>
        <Field label="Aims"><EditableField value={initiative.aims ?? ""} onSave={save("aims")} as="textarea" /></Field>
        <Field label="Who it is for"><EditableField value={initiative.audience ?? ""} onSave={save("audience")} /></Field>

        {/* The emotional journey lives here, next to the aims, because
            it IS an aim. Not in a section of its own at the end. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <h3 style={{ ...fieldLabel, marginBottom: 10 }}>What it should feel like</h3>
          <Field label="Walking in"><EditableField value={initiative.feels_arriving ?? ""} onSave={save("feels_arriving")} as="textarea" placeholder="The first sixty seconds." /></Field>
          <Field label="At the peak"><EditableField value={initiative.feels_peak ?? ""} onSave={save("feels_peak")} as="textarea" placeholder="The moment the whole thing is built around." /></Field>
          <Field label="Walking out"><EditableField value={initiative.feels_leaving ?? ""} onSave={save("feels_leaving")} as="textarea" /></Field>
          <Field label="The one thing they take home"><EditableField value={initiative.one_thing ?? ""} onSave={save("one_thing")} as="textarea" placeholder="One sentence. If you cannot write it, the plan is not finished." /></Field>
        </div>

        <IhsanPrompts prompts={bySection("overview")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 2. Roles */}
      <Section title="Roles">
        {(roles ?? []).length === 0 ? <Empty>Roles appear when it is approved.</Empty> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(roles ?? []).map((r) => (
              <li key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: "var(--text-1)" }}>{r.label}</span>
                <span style={{ color: r.profile_id ? "var(--text-2)" : "var(--accent)" }}>
                  {r.profile_id ? nameOf.get(r.profile_id) ?? "Unknown" : "Nobody yet"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 3. Milestones, dated backwards */}
      <Section title="Milestones">
        {(milestones ?? []).length === 0 ? <Empty>Dated backwards from the day, once approved.</Empty> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(milestones ?? []).map((m) => (
              <li key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: m.done ? "var(--text-3)" : "var(--text-1)", textDecoration: m.done ? "line-through" : "none" }}>
                  {m.task_id ? <Link href={`/app/tasks/${m.task_id}`} style={{ color: "inherit" }}>{m.title}</Link> : m.title}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  {m.due_date} · {m.owner_id ? nameOf.get(m.owner_id) ?? "—" : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 4. Run sheet — and the peak moment */}
      <Section title="Run sheet">
        {peak ? (
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-2)" }}>
            The peak moment is <strong>{peak.title}</strong> at {peak.starts_at ?? "a time nobody has set"},
            held by {peak.owner_id ? nameOf.get(peak.owner_id) ?? "someone" : <span style={{ color: "var(--accent)" }}>nobody yet</span>}.
          </p>
        ) : (
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--accent)" }}>
            No peak moment on the run sheet. A moment that is not scheduled does not happen.
          </p>
        )}
        {(runsheet ?? []).length === 0 ? <Empty>Built from the template on approval.</Empty> : (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(runsheet ?? []).map((s) => (
              <li key={s.id} style={{ display: "flex", gap: 12, fontSize: 14, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", minWidth: 52 }}>
                  {s.starts_at?.slice(0, 5) ?? "—"}
                </span>
                <span style={{ color: "var(--text-1)", fontWeight: s.is_peak_moment ? 600 : 400 }}>
                  {s.title}{s.is_peak_moment && <span style={{ color: "var(--accent)" }}> ◆</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <IhsanPrompts prompts={bySection("runsheet")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 5. Content */}
      <Section title="Content">
        <Field label="Theme"><EditableField value={initiative.theme ?? ""} onSave={save("theme")} /></Field>
        <Field label="Why this, now"><EditableField value={initiative.theme_why ?? ""} onSave={save("theme_why")} as="textarea" /></Field>
        <Field label="Outline"><EditableField value={initiative.content_outline ?? ""} onSave={save("content_outline")} as="textarea" /></Field>
        <IhsanPrompts prompts={bySection("content")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 6. Speakers */}
      {(speakers ?? []).length > 0 && (
        <Section title="Speakers">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(speakers ?? []).map((s) => (
              <li key={s.id} style={{ fontSize: 14, color: "var(--text-1)" }}>
                {s.name} — {s.topic ?? "topic not set"}{" "}
                <span style={{ color: s.confirmed ? "var(--text-3)" : "var(--accent)", fontSize: 12 }}>
                  {s.confirmed ? "confirmed" : "not confirmed"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 7. Venue */}
      <Section title="Venue &amp; logistics">
        <Grid>
          <Field label="Venue"><EditableField value={initiative.venue_name ?? ""} onSave={save("venue_name")} /></Field>
          <Field label="Contact"><EditableField value={initiative.venue_contact ?? ""} onSave={save("venue_contact")} /></Field>
          <Field label="Access from"><EditableField value={initiative.access_from ?? ""} onSave={save("access_from")} /></Field>
          <Field label="Access until"><EditableField value={initiative.access_until ?? ""} onSave={save("access_until")} /></Field>
        </Grid>
        <Field label="Address"><EditableField value={initiative.venue_address ?? ""} onSave={save("venue_address")} as="textarea" /></Field>
        <Field label="Layout"><EditableField value={initiative.layout ?? ""} onSave={save("layout")} /></Field>
        <Field label="Transport and parking"><EditableField value={initiative.transport ?? ""} onSave={save("transport")} as="textarea" /></Field>
        <p style={{ fontSize: 13, color: initiative.venue_booked ? "var(--text-3)" : "var(--accent)", margin: "8px 0 0" }}>
          {initiative.venue_booked ? "Booked." : "Not booked yet."}
        </p>
        <IhsanPrompts prompts={bySection("venue")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 8. Equipment */}
      <Section title="Equipment">
        {(equipment ?? []).length === 0 ? <Empty>Comes from the template on approval.</Empty> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {(equipment ?? []).map((e) => (
              <li key={e.id} style={{ fontSize: 14, color: "var(--text-1)" }}>
                {e.quantity} × {e.item}
                {e.who_brings && <span style={{ color: "var(--text-3)" }}> — {nameOf.get(e.who_brings)}</span>}
                {e.packed && <span style={{ color: "var(--text-3)", fontSize: 12 }}> · packed</span>}
              </li>
            ))}
          </ul>
        )}
        <IhsanPrompts prompts={bySection("equipment")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 9. Rota */}
      <Section title="Volunteers &amp; rota">
        <Field label="Briefing — what every volunteer is told">
          <EditableField value={initiative.briefing ?? ""} onSave={save("briefing")} as="textarea"
            placeholder="Where to report, when, who to ask, what the night is for." />
        </Field>
        {(volunteers ?? []).length === 0 ? <Empty>Nobody on the rota yet.</Empty> : (
          <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {(volunteers ?? []).map((v) => (
              <li key={v.id} style={{ fontSize: 14, color: "var(--text-1)" }}>
                {v.profile_id ? nameOf.get(v.profile_id) ?? "Unknown" : v.name} — {v.role ?? "role not set"}
                <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {" "}{v.from_time?.slice(0, 5)}–{v.to_time?.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <IhsanPrompts prompts={bySection("rota")} initiativeId={id} canEdit={canEdit} />
      </Section>

      {/* 10. Safeguarding — restricted, see the policies in 0008 */}
      {viewer.can("risk.manage") || initiative.lead_id === viewer.id ? (
        <Section title="Safeguarding">
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>
            Medical, allergy and consent records for this event are kept apart from the rest
            of the file and are deleted automatically{" "}
            <strong>{initiative.safeguarding_purge_weeks} weeks</strong> after it ends.
          </p>
          <IhsanPrompts prompts={bySection("safeguarding")} initiativeId={id} canEdit={canEdit} />
        </Section>
      ) : null}

      {/* 11. Risks */}
      <Section title="Risk register">
        {(risks ?? []).length === 0 ? <Empty>Pre-loaded from the template on approval.</Empty> : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {(risks ?? []).map((r) => (
              <li key={r.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 14 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                  color: "#fff", background: riskColour(r.score),
                  borderRadius: 3, padding: "1px 6px", minWidth: 22, textAlign: "center",
                }}>
                  {r.score}
                </span>
                <span style={{ color: "var(--text-1)" }}>
                  {r.title}
                  {r.mitigation && <span style={{ color: "var(--text-3)", fontSize: 13 }}> — {r.mitigation}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 12. Budget */}
      {(budget ?? []).length > 0 && (
        <Section title="Budget">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {(budget ?? []).map((b) => (
              <li key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{b.description}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                  £{Number(b.planned).toFixed(2)} planned{b.actual != null && ` · £${Number(b.actual).toFixed(2)} actual`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 14. Attendance */}
      <Section title="Attendance">
        <Grid>
          <Field label="Expected"><EditableField value={initiative.expected_attendance?.toString() ?? ""} onSave={save("expected_attendance")} /></Field>
          <Field label="Actual"><EditableField value={initiative.actual_attendance?.toString() ?? ""} onSave={save("actual_attendance")} /></Field>
          <Field label="First-timers"><EditableField value={initiative.first_timers?.toString() ?? ""} onSave={save("first_timers")} /></Field>
          <Field label="Returning"><EditableField value={initiative.returning_attendees?.toString() ?? ""} onSave={save("returning_attendees")} /></Field>
        </Grid>
      </Section>

      {/* 19. Follow-up */}
      {bySection("followup").length > 0 && (
        <Section title="Follow-up">
          <IhsanPrompts prompts={bySection("followup")} initiativeId={id} canEdit={canEdit} />
        </Section>
      )}

      {/* 17. Approval */}
      <Section title="Approval">
        {(approvals ?? []).length > 0 && (
          <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {(approvals ?? []).map((a) => (
              <li key={a.id} style={{ fontSize: 13, color: "var(--text-2)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", color: "var(--text-3)" }}>{a.action}</span>
                {" "}by {a.actor_id ? nameOf.get(a.actor_id) ?? "someone" : "someone"} — {new Date(a.at).toLocaleDateString("en-GB")}
                {a.comment && <div style={{ color: "var(--text-3)", marginLeft: 4 }}>{a.comment}</div>}
              </li>
            ))}
          </ul>
        )}

        {initiative.stage === "idea" && canEdit && (
          <StageForm id={id} label="Send to the shura" action={submitForApproval}
            needsComment placeholder="Anything they should know before they decide?" />
        )}
        {initiative.stage === "proposal" && viewer.can("events.approve") && (
          <div style={{ display: "grid", gap: 16 }}>
            <StageForm id={id} label="Approve and build the plan" action={approveInitiative} />
            <StageForm id={id} label="Return with comments" action={returnForChanges} needsComment secondary />
          </div>
        )}
        {initiative.stage === "planning" && canEdit && (
          <StageForm id={id} from="planning" label="Go live" action={advanceStage} />
        )}
        {initiative.stage === "live" && canEdit && (
          <StageForm id={id} from="live" label="Move to wrap-up" action={advanceStage} />
        )}
        {initiative.stage === "wrap_up" && (
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>
            It closes from the{" "}
            <Link href={`/app/events/${id}/retrospective`} style={{ color: "var(--accent)" }}>retrospective</Link>,
            and not before it is written.
          </p>
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <h2 style={{ ...sectionTitle, marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
      <span style={fieldLabel}>{label}</span>
      <div style={{ fontSize: 14, color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>{children}</p>;
}

/** What somebody on the rota gets: where, when, and what they are doing. */
async function VolunteerView({ id }: { id: string }) {
  const supabase = createClient();
  const [{ data: basics }, { data: mine }] = await Promise.all([
    supabase.from("initiative_basics").select("*").eq("id", id).maybeSingle(),
    supabase.from("initiative_volunteers").select("*").eq("initiative_id", id),
  ]);
  if (!basics) notFound();

  return (
    <main style={{ padding: "28px 16px", maxWidth: 620, margin: "0 auto" }}>
      <Link href="/app/events" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Events</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 16px" }}>{basics.title}</h1>
      <div style={{ ...card, marginBottom: 16 }}>
        <Field label="When">{basics.starts_on} {basics.starts_at?.slice(0, 5)}</Field>
        <Field label="Where">{basics.venue_name ?? "To be confirmed"}</Field>
        {basics.venue_address && <Field label="Address">{basics.venue_address}</Field>}
      </div>
      {(mine ?? []).map((v) => (
        <div key={v.id} style={{ ...card, marginBottom: 16 }}>
          <Field label="Your slot">{v.role ?? "Role not set"} · {v.from_time?.slice(0, 5)}–{v.to_time?.slice(0, 5)}</Field>
          {v.report_to && <Field label="Report to">{v.report_to}</Field>}
        </div>
      ))}
      {basics.briefing && (
        <div style={card}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Briefing</h2>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7, color: "var(--text-1)", margin: 0 }}>{basics.briefing}</p>
        </div>
      )}
    </main>
  );
}
