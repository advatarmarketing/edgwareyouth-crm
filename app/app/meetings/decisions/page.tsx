import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, input, pageTitle, secondaryButton } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * The decision log — every decision, searchable (spec 4.6).
 *
 * Reads meeting_decisions directly. Its policy defers to
 * can_see_meeting(), so a decision taken in a shura meeting is not in
 * these rows for anybody who could not have attended it. There is no
 * visibility logic in this page.
 */
export default async function DecisionLogPage({ searchParams }: { searchParams: { q?: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const query = (searchParams.q ?? "").trim();

  let request = supabase
    .from("meeting_decisions")
    .select("id, text, created_at, meeting_id")
    .order("created_at", { ascending: false })
    .limit(200);

  if (query) request = request.ilike("text", `%${query}%`);

  const { data: decisions } = await request;

  const meetingIds = [...new Set((decisions ?? []).map((d) => d.meeting_id))];
  const { data: meetings } = meetingIds.length
    ? await supabase.from("meetings").select("id, title, meeting_date").in("id", meetingIds)
    : { data: [] };

  const meeting = new Map((meetings ?? []).map((m) => [m.id, m]));

  return (
    <main style={{ padding: "28px 16px", maxWidth: 760, margin: "0 auto" }}>
      <Link href="/app/meetings" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Decision log</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 20px" }}>
        Everything the organisation has decided, so nothing has to be re-argued from memory.
      </p>

      <form style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <input name="q" defaultValue={query} placeholder="Search decisions" style={{ ...input, flex: "1 1 240px" }} />
        <button type="submit" style={secondaryButton}>Search</button>
      </form>

      <div style={{ display: "grid", gap: 8 }}>
        {(decisions ?? []).map((d) => {
          const m = meeting.get(d.meeting_id);
          return (
            <div key={d.id} style={card}>
              <div style={{ lineHeight: 1.6 }}>{d.text}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                {m ? (
                  <Link href={`/app/meetings/${m.id}`} style={{ color: "var(--text-3)" }}>
                    {m.title} · {new Date(m.meeting_date).toLocaleDateString("en-GB")}
                  </Link>
                ) : (
                  new Date(d.created_at).toLocaleDateString("en-GB")
                )}
              </div>
            </div>
          );
        })}

        {(decisions ?? []).length === 0 && (
          <p style={{ color: "var(--text-3)" }}>{query ? "Nothing matches that." : "No decisions recorded yet."}</p>
        )}
      </div>
    </main>
  );
}
