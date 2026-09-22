import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { pageTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * The calendar (spec 4.7).
 *
 * Layers are on/off and each one is a separate source. Only the task
 * deadlines layer has anything behind it yet — meetings arrive in
 * Prompt 4b, events and milestones in Prompt 5. The layer list is
 * written out in full now, with the unbuilt ones disabled and labelled,
 * so it is obvious what is coming rather than looking like the feature
 * is missing.
 *
 * Islamic dates and school holidays are deliberately not faked with a
 * hardcoded table: both need a real source and a wrong date on a
 * calendar people plan around is worse than no date.
 */
const LAYERS = [
  { key: "tasks", label: "Task deadlines", ready: true },
  { key: "meetings", label: "Meetings", ready: false, comingIn: "Prompt 4b" },
  { key: "events", label: "Org events", ready: false, comingIn: "Prompt 5" },
  { key: "milestones", label: "Event milestones", ready: false, comingIn: "Prompt 5" },
  { key: "islamic", label: "Islamic dates", ready: false, comingIn: "needs a data source" },
  { key: "holidays", label: "School holidays", ready: false, comingIn: "needs a data source" },
] as const;

export default async function CalendarPage({ searchParams }: { searchParams: { month?: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  const today = new Date();
  const [year, month] = searchParams.month
    ? searchParams.month.split("-").map(Number)
    : [today.getFullYear(), today.getMonth() + 1];

  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fromKey = key(first);
  const toKey = key(last);

  // Own tasks, plus everyone's for anyone who may see them.
  let query = supabase
    .from("tasks")
    .select("id, title, due_date, status, owner_id")
    .gte("due_date", fromKey)
    .lte("due_date", toKey)
    .neq("status", "done");

  if (!viewer.can("tasks.view_all")) query = query.eq("owner_id", viewer.id);

  const { data: tasks } = await query;

  const byDay = new Map<string, { id: string; title: string }[]>();
  for (const t of tasks ?? []) {
    if (!t.due_date) continue;
    const list = byDay.get(t.due_date) ?? [];
    list.push({ id: t.id, title: t.title });
    byDay.set(t.due_date, list);
  }

  // Monday-first, which is how a UK calendar reads.
  const leading = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: last.getDate() }, (_, i) => new Date(year, month - 1, i + 1)),
  ];

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <h1 style={pageTitle}>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h1>
        <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 12 }}>
          <Link href={`/app/calendar?month=${prev}`} style={{ color: "var(--text-3)" }}>← Previous</Link>
          <Link href="/app/calendar" style={{ color: "var(--text-3)" }}>Today</Link>
          <Link href={`/app/calendar?month=${next}`} style={{ color: "var(--text-3)" }}>Next →</Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18, fontSize: 13 }}>
        {LAYERS.map((layer) => (
          <label
            key={layer.key}
            title={layer.ready ? undefined : `Not built yet — ${layer.comingIn}`}
            style={{ display: "flex", alignItems: "center", gap: 6, color: layer.ready ? "var(--text-2)" : "var(--text-3)" }}
          >
            <input type="checkbox" defaultChecked={layer.ready} disabled={!layer.ready} />
            {layer.label}
          </label>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} style={{ background: "var(--surface-2)", padding: "8px 6px", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "center" }}>
            {d}
          </div>
        ))}

        {cells.map((date, i) => {
          const dayKey = date ? key(date) : null;
          const items = dayKey ? byDay.get(dayKey) ?? [] : [];
          const isToday = dayKey === key(today);

          return (
            <div
              key={i}
              style={{
                background: "var(--surface)",
                minHeight: 96,
                padding: 6,
                outline: isToday ? "2px solid var(--accent)" : undefined,
                outlineOffset: -2,
              }}
            >
              {date && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isToday ? "var(--accent)" : "var(--text-3)", marginBottom: 4 }}>
                  {date.getDate()}
                </div>
              )}

              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/app/tasks/${item.id}`}
                  style={{
                    display: "block",
                    fontSize: 11,
                    lineHeight: 1.3,
                    padding: "3px 5px",
                    marginBottom: 3,
                    borderRadius: 3,
                    background: "var(--accent-soft)",
                    color: "var(--text-1)",
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
