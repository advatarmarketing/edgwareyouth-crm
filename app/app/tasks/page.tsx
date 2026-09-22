import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { NewTaskForm } from "./TaskForms";
import type { Task } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * My tasks — today, this week, overdue (spec 4.2 and 4.4).
 *
 * "Mine" means owned by me. Anyone with tasks.view_all can switch to
 * the org-wide view, which is what the shura's overdue-across-the-org
 * tile needs.
 */
export default async function TasksPage({ searchParams }: { searchParams: { scope?: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const orgScope = searchParams.scope === "all" && viewer.can("tasks.view_all");

  let query = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, owner_id, blocked_reason")
    .neq("status", "done")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (!orgScope) query = query.eq("owner_id", viewer.id);

  const [{ data: tasks }, { data: people }] = await Promise.all([
    query,
    supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  // Dates are compared as plain YYYY-MM-DD strings against the local
  // day. due_date is a DATE in Postgres, not a timestamp — turning it
  // into a Date object here would drag the browser's timezone in and
  // make a task due today look overdue to anyone west of London.
  const today = new Date();
  const todayKey = toKey(today);
  const weekKey = toKey(new Date(today.getTime() + 7 * 86_400_000));

  const rows = (tasks ?? []) as Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "owner_id" | "blocked_reason">[];

  const overdue = rows.filter((t) => t.due_date && t.due_date < todayKey);
  const todayTasks = rows.filter((t) => t.due_date === todayKey);
  const thisWeek = rows.filter((t) => t.due_date && t.due_date > todayKey && t.due_date <= weekKey);
  const later = rows.filter((t) => !t.due_date || t.due_date > weekKey);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <h1 style={pageTitle}>{orgScope ? "All tasks" : "My tasks"}</h1>

        {viewer.can("tasks.view_all") && (
          <Link
            href={orgScope ? "/app/tasks" : "/app/tasks?scope=all"}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}
          >
            {orgScope ? "Show only mine" : "Show everyone's"}
          </Link>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <NewTaskForm people={people ?? []} canAssign={viewer.can("tasks.assign")} meId={viewer.id} />
      </div>

      <Group title="Overdue" tasks={overdue} names={names} showOwner={orgScope} tone="danger" />
      <Group title="Today" tasks={todayTasks} names={names} showOwner={orgScope} />
      <Group title="This week" tasks={thisWeek} names={names} showOwner={orgScope} />
      <Group title="Later" tasks={later} names={names} showOwner={orgScope} />

      {rows.length === 0 && (
        <p style={{ color: "var(--text-2)" }}>Nothing outstanding. </p>
      )}
    </main>
  );
}

function Group({
  title,
  tasks,
  names,
  showOwner,
  tone,
}: {
  title: string;
  tasks: Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "owner_id" | "blocked_reason">[];
  names: Map<string, string | null>;
  showOwner: boolean;
  tone?: "danger";
}) {
  if (tasks.length === 0) return null;

  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ ...sectionTitle, color: tone === "danger" ? "var(--danger-fg)" : "var(--text-1)" }}>
        {title} <span style={{ color: "var(--text-3)", fontSize: 15 }}>{tasks.length}</span>
      </h2>

      <div style={{ display: "grid", gap: 8 }}>
        {tasks.map((task) => (
          <Link key={task.id} href={`/app/tasks/${task.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 500 }}>{task.title}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {task.due_date ? formatDate(task.due_date) : "No date"}
              </span>
            </div>

            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
              {task.status === "blocked" ? (
                <span style={{ color: "var(--warn-fg)" }}>Blocked — {task.blocked_reason}</span>
              ) : (
                <span>{task.status === "doing" ? "In progress" : "To do"}</span>
              )}
              {task.priority === "high" && <span style={{ color: "var(--danger-fg)" }}> · High priority</span>}
              {showOwner && task.owner_id && <span> · {names.get(task.owner_id) ?? "Unassigned"}</span>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
