import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Per person: actions given, done on time, overdue (spec 4.6).
 *
 * Counted from the real tasks rather than from the minutes, because
 * the minutes only record what was agreed — whether it happened is a
 * property of the task.
 *
 * "On time" means done on or before the due date. A task finished late
 * still counts as done; it is just not counted as on time, which is
 * the distinction the shura are actually after.
 */
export default async function AccountabilityPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("tasks.view_all")) redirect("/app/meetings");

  const supabase = createClient();

  const [{ data: tasks }, { data: people }] = await Promise.all([
    supabase
      .from("tasks")
      .select("owner_id, status, due_date, completed_at")
      .eq("source", "meeting"),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const rows = (people ?? []).map((person) => {
    const mine = (tasks ?? []).filter((t) => t.owner_id === person.id);
    const done = mine.filter((t) => t.status === "done");

    const onTime = done.filter((t) => {
      if (!t.due_date || !t.completed_at) return false;
      return t.completed_at.slice(0, 10) <= t.due_date;
    });

    const overdue = mine.filter((t) => t.status !== "done" && t.due_date && t.due_date < todayKey);

    return {
      name: person.full_name ?? "Unnamed",
      given: mine.length,
      done: done.length,
      onTime: onTime.length,
      overdue: overdue.length,
    };
  }).filter((r) => r.given > 0);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 760, margin: "0 auto" }}>
      <Link href="/app/meetings" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Accountability</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Actions given in meetings, and what happened to them. Counted from the tasks
        themselves rather than from the minutes.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 500 }}>{r.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
              {r.given} given · {r.done} done · {r.onTime} on time
              {r.overdue > 0 && <span style={{ color: "var(--danger-fg)" }}> · {r.overdue} overdue</span>}
            </span>
          </div>
        ))}

        {rows.length === 0 && (
          <p style={{ color: "var(--text-3)" }}>Nothing yet — no meeting has been published with actions.</p>
        )}
      </div>
    </main>
  );
}
