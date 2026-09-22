import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, sectionTitle } from "@/lib/ui";
import { toggleChecklistItem } from "../actions";
import { StatusForm, CommentForm } from "./TaskDetail";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // RLS decides whether this comes back at all — "tasks: read" gives
  // you your own, ones you assigned, or everything with tasks.view_all.
  // A task somebody else owns simply returns nothing, which is a 404
  // rather than a redirect on purpose: it does not confirm the task
  // exists.
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!task) notFound();

  const [{ data: items }, { data: comments }, { data: people }] = await Promise.all([
    task.checklist_id
      ? supabase
          .from("checklist_items")
          .select("id, text, depth, position, done")
          .eq("checklist_id", task.checklist_id)
          .order("position")
      : Promise.resolve({ data: null }),
    supabase
      .from("task_comments")
      .select("id, body, author_id, created_at")
      .eq("task_id", params.id)
      .order("created_at"),
    supabase.from("member_directory").select("id, full_name"),
  ]);

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const steps = items ?? [];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/tasks" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Tasks</Link>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "8px 0 4px" }}>{task.title}</h1>

      <p style={{ color: "var(--text-2)", margin: "0 0 28px", fontSize: 14 }}>
        {task.owner_id ? names.get(task.owner_id) ?? "Unassigned" : "Unassigned"}
        {task.due_date && ` · due ${new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
        {task.priority === "high" && " · High priority"}
        {/* Where this came from, when it was not typed in by hand.
            Spec 4.1: every checklist links back to its source. */}
        {task.source !== "manual" && ` · from a ${task.source}`}
      </p>

      {task.description && (
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, margin: "0 0 28px" }}>{task.description}</p>
      )}

      {steps.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={sectionTitle}>
            Checklist <span style={{ color: "var(--text-3)", fontSize: 15 }}>{doneCount} of {steps.length}</span>
          </h2>

          <div style={{ display: "grid", gap: 2 }}>
            {steps.map((step) => (
              <form key={step.id} action={toggleChecklistItem}>
                <input type="hidden" name="item_id" value={step.id} />
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="done" value={String(!step.done)} />
                <button
                  type="submit"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    // Sub-steps sit in from their parent, which is how
                    // an indented line in the pasted text survives.
                    paddingLeft: 10 + step.depth * 22,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    color: step.done ? "var(--text-3)" : "var(--text-1)",
                    textDecoration: step.done ? "line-through" : "none",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  <span aria-hidden style={{ fontFamily: "var(--font-mono)" }}>{step.done ? "☑" : "☐"}</span>
                  {step.text}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionTitle}>Status</h2>
        <StatusForm taskId={task.id} status={task.status} blockedReason={task.blocked_reason} />
      </section>

      <section>
        <h2 style={sectionTitle}>Comments</h2>

        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {(comments ?? []).map((c) => (
            <div key={c.id} style={card}>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{c.body}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                {c.author_id ? names.get(c.author_id) ?? "Someone" : "Someone"} ·{" "}
                {new Date(c.created_at).toLocaleDateString("en-GB")}
              </div>
            </div>
          ))}
          {(comments ?? []).length === 0 && (
            <p style={{ color: "var(--text-3)", fontSize: 14, margin: 0 }}>No comments yet.</p>
          )}
        </div>

        <CommentForm taskId={task.id} />
      </section>
    </main>
  );
}
