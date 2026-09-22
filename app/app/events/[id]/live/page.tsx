import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { card, pageTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Live mode: the run sheet on a phone, in a dark room, one-handed.
 *
 * Deliberately not the event file. On the night nobody needs the
 * budget or the stakeholder list — they need to know what is happening
 * now, what is next, and who is holding it. Everything else is noise
 * at exactly the moment noise is most expensive.
 */
export default async function LivePage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const id = params.id;

  const { data: basics } = await supabase
    .from("initiative_basics")
    .select("id, title, starts_on, starts_at, venue_name")
    .eq("id", id)
    .maybeSingle();
  if (!basics) notFound();

  const [{ data: slots }, { data: people }] = await Promise.all([
    supabase.from("initiative_runsheet").select("*").eq("initiative_id", id).order("position"),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Unnamed"]));

  // "Now" is worked out from the wall clock against the slot times.
  // It is only meaningful on the day, so on any other day the page
  // simply shows the schedule rather than pretending.
  const today = new Date();
  const isToday = basics.starts_on === today.toISOString().slice(0, 10);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  const withTimes = (slots ?? []).map((s) => {
    const [h, m] = (s.starts_at ?? "00:00").split(":").map(Number);
    const start = h * 60 + m;
    return { ...s, start, end: start + s.duration_minutes };
  });

  const currentIndex = isToday
    ? withTimes.findIndex((s) => nowMinutes >= s.start && nowMinutes < s.end)
    : -1;

  return (
    <main style={{ padding: "20px 16px", maxWidth: 520, margin: "0 auto" }}>
      <Link href={`/app/events/${id}`} style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>
        ← {basics.title}
      </Link>
      <h1 style={{ ...pageTitle, fontSize: 28, margin: "8px 0 4px" }}>Run sheet</h1>
      <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 20px" }}>
        {basics.venue_name ?? "Venue not set"} · {basics.starts_on}
        {!isToday && " · not today, so nothing is highlighted"}
      </p>

      {withTimes.length === 0 ? (
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>No run sheet yet.</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {withTimes.map((s, n) => {
            const now = n === currentIndex;
            const next = n === currentIndex + 1 && currentIndex >= 0;
            return (
              <li
                key={s.id}
                style={{
                  ...card,
                  padding: now ? "16px 16px" : "11px 14px",
                  borderColor: now ? "var(--accent)" : s.is_peak_moment ? "var(--accent)" : "var(--border)",
                  borderWidth: now ? 2 : 1,
                  opacity: currentIndex >= 0 && n < currentIndex ? 0.45 : 1,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: now ? 16 : 13, color: now ? "var(--accent)" : "var(--text-3)" }}>
                    {s.starts_at?.slice(0, 5) ?? "—"}
                  </span>
                  {(now || next) && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
                      {now ? "Now" : "Next"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: now ? 19 : 15, color: "var(--text-1)", marginTop: 3, fontWeight: s.is_peak_moment ? 600 : 400 }}>
                  {s.title}
                  {s.is_peak_moment && <span style={{ color: "var(--accent)" }}> ◆</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
                  {s.duration_minutes} min
                  {s.owner_id && ` · ${nameOf.get(s.owner_id) ?? ""}`}
                </div>
                {s.notes && <p style={{ fontSize: 13, color: "var(--text-2)", margin: "6px 0 0" }}>{s.notes}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
