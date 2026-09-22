import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { deleteAction, dismissUnresolved, setAttendance } from "../actions";
import {
  PasteNotesForm,
  ActionRow,
  NewActionForm,
  DecisionForm,
  PublishForm,
  SuggestItemForm,
} from "./MeetingForms";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", params.id).maybeSingle();
  if (!meeting) notFound();

  const { data: canRun } = await supabase.rpc("can_run_meeting", { p_meeting_id: params.id });
  const running = canRun === true;

  const [{ data: agenda }, { data: actions }, { data: decisions }, { data: unresolved }, { data: people }, { data: attendees }] =
    await Promise.all([
      supabase.from("meeting_agenda_items").select("*").eq("meeting_id", params.id).order("position"),
      supabase.from("meeting_actions").select("*").eq("meeting_id", params.id).order("created_at"),
      supabase.from("meeting_decisions").select("*").eq("meeting_id", params.id).order("created_at"),
      running
        ? supabase.from("meeting_unresolved").select("*").eq("meeting_id", params.id).order("created_at")
        : Promise.resolve({ data: null }),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("meeting_attendees").select("profile_id, attendance").eq("meeting_id", params.id),
    ]);

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const attendance = new Map((attendees ?? []).map((a) => [a.profile_id, a.attendance]));
  const published = meeting.status === "published";

  // Progress against the real tasks, not against the minutes — "7 of 9
  // done" has to mean seven people actually did the thing.
  const taskIds = (actions ?? []).map((a) => a.task_id).filter(Boolean) as string[];
  const { data: tasks } = taskIds.length
    ? await supabase.from("tasks").select("id, status").in("id", taskIds)
    : { data: [] };
  const doneTasks = new Set((tasks ?? []).filter((t) => t.status === "done").map((t) => t.id));
  const doneCount = (actions ?? []).filter((a) => a.task_id && doneTasks.has(a.task_id)).length;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/meetings" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Meetings</Link>

      <h1 style={{ ...pageTitle, fontSize: 34, margin: "8px 0 4px" }}>{meeting.title}</h1>

      <p style={{ color: "var(--text-2)", margin: "0 0 28px", fontSize: 14 }}>
        {new Date(meeting.meeting_date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        {meeting.chair_id && ` · chaired by ${names.get(meeting.chair_id) ?? "someone"}`}
        {published
          ? ` · published · ${doneCount} of ${(actions ?? []).length} actions done`
          : " · not published yet"}
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Agenda</h2>
        <ol style={{ margin: "0 0 14px", paddingLeft: 20, lineHeight: 1.9 }}>
          {(agenda ?? []).map((item) => (
            <li key={item.id}>
              {item.title}
              {item.origin === "matters_arising" && (
                <span style={{ color: "var(--warn-fg)", fontFamily: "var(--font-mono)", fontSize: 11 }}> CARRIED OVER</span>
              )}
              {item.origin === "suggested" && (
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                  {" "}— suggested by {item.suggested_by ? names.get(item.suggested_by) ?? "someone" : "someone"}
                </span>
              )}
            </li>
          ))}
          {(agenda ?? []).length === 0 && <li style={{ color: "var(--text-3)" }}>Nothing on it yet.</li>}
        </ol>

        {!published && <SuggestItemForm meetingId={meeting.id} />}
      </section>

      {running && !published && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>Paste the notes in</h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 12px" }}>
            Notes from Notion, your phone, or typed while listening back.{" "}
            <Link href="/app/meetings/guide" style={{ color: "var(--accent)" }}>How to write them</Link>.
            Pasting again replaces what is below.
          </p>
          <PasteNotesForm meetingId={meeting.id} />
        </section>
      )}

      {running && (unresolved ?? []).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ ...sectionTitle, color: "var(--warn-fg)" }}>
            Needs a look — {(unresolved ?? []).length}
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 14px" }}>
            The CRM would not guess at these. Turn each one into an action or dismiss it —
            the meeting cannot be published while any are left.
          </p>

          <div style={{ display: "grid", gap: 14 }}>
            {(unresolved ?? []).map((line) => (
              <div key={line.id} style={{ ...card, background: "var(--warn-bg)", borderColor: "var(--warn-border)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, margin: "0 0 4px" }}>{line.line}</p>
                <p style={{ color: "var(--warn-fg)", fontSize: 13, margin: "0 0 10px" }}>
                  {line.reason}
                  {line.candidates && ` — ${line.candidates.map((c) => c.name).join(" or ")}`}
                </p>

                <ActionRow
                  meetingId={meeting.id}
                  people={people ?? []}
                  resolvesId={line.id}
                  action={{ text: line.line.replace(/^\s*action\b\s*:?\s*/i, ""), owner_id: null, due_date: null, steps: line.steps }}
                />

                <form action={dismissUnresolved} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={line.id} />
                  <input type="hidden" name="meeting_id" value={meeting.id} />
                  <button type="submit" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, padding: 0 }}>
                    Not an action — dismiss
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Actions <span style={{ color: "var(--text-3)", fontSize: 15 }}>{(actions ?? []).length}</span></h2>

        <div style={{ display: "grid", gap: 12 }}>
          {(actions ?? []).map((item) =>
            running && !published ? (
              <div key={item.id}>
                <ActionRow
                  meetingId={meeting.id}
                  people={people ?? []}
                  action={{ id: item.id, text: item.text, owner_id: item.owner_id, due_date: item.due_date, steps: item.steps }}
                />
                <form action={deleteAction} style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="meeting_id" value={meeting.id} />
                  <button type="submit" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, padding: 0 }}>
                    Delete
                  </button>
                </form>
              </div>
            ) : (
              <div key={item.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ textDecoration: item.task_id && doneTasks.has(item.task_id) ? "line-through" : "none" }}>
                    {item.text}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                    {item.owner_id ? names.get(item.owner_id) ?? "Unassigned" : "Unassigned"}
                    {item.due_date && ` · ${new Date(item.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                  </span>
                </div>
                {item.task_id && (
                  <Link href={`/app/tasks/${item.task_id}`} style={{ color: "var(--accent)", fontSize: 12 }}>
                    Open the task
                  </Link>
                )}
              </div>
            )
          )}

          {(actions ?? []).length === 0 && <p style={{ color: "var(--text-3)", margin: 0 }}>None yet.</p>}
        </div>

        {running && !published && (
          <div style={{ marginTop: 12 }}>
            <NewActionForm meetingId={meeting.id} people={people ?? []} />
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Decisions</h2>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {(decisions ?? []).map((d) => (
            <div key={d.id} style={card}>{d.text}</div>
          ))}
          {(decisions ?? []).length === 0 && <p style={{ color: "var(--text-3)", margin: 0 }}>None recorded.</p>}
        </div>
        {running && !published && <DecisionForm meetingId={meeting.id} />}
      </section>

      {running && !published && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>Attendance</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {(people ?? []).map((p) => (
              <form key={p.id} action={setAttendance} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="hidden" name="meeting_id" value={meeting.id} />
                <input type="hidden" name="profile_id" value={p.id} />
                <span style={{ flex: "1 1 auto", fontSize: 14 }}>{p.full_name ?? "Unnamed"}</span>
                <select name="attendance" defaultValue={attendance.get(p.id) ?? "expected"} style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--text-1)", fontSize: 13 }}>
                  <option value="expected">—</option>
                  <option value="present">Present</option>
                  <option value="apologies">Apologies</option>
                  <option value="absent">Absent</option>
                </select>
                <button type="submit" style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12 }}>Set</button>
              </form>
            ))}
          </div>
        </section>
      )}

      {running && !published && (
        <section style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <PublishForm meetingId={meeting.id} actionCount={(actions ?? []).length} />
        </section>
      )}
    </main>
  );
}
