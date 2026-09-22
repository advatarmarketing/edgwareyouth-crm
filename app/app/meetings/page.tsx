import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { button, card, pageTitle, sectionTitle } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // can_see_meeting() filters this — a shura meeting simply is not in
  // the rows a sabiqun gets back.
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title, meeting_date, status, meeting_type")
    .order("meeting_date", { ascending: false })
    .limit(50);

  const upcoming = (meetings ?? []).filter((m) => m.status !== "published");
  const past = (meetings ?? []).filter((m) => m.status === "published");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={pageTitle}>Meetings</h1>
        {viewer.can("meetings.manage") && (
          <Link href="/app/meetings/new" style={{ ...button, textDecoration: "none" }}>New meeting</Link>
        )}
      </div>

      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        Actions written in the minutes land on people&apos;s task lists the moment the
        meeting is published. <Link href="/app/meetings/guide" style={{ color: "var(--accent)" }}>
        How to write the notes</Link>.
      </p>

      <div style={{ display: "flex", gap: 14, marginBottom: 24, fontFamily: "var(--font-mono)", fontSize: 12 }}>
        <Link href="/app/meetings/decisions" style={{ color: "var(--text-3)" }}>Decision log</Link>
        {viewer.can("tasks.view_all") && (
          <Link href="/app/meetings/accountability" style={{ color: "var(--text-3)" }}>Accountability</Link>
        )}
      </div>

      {upcoming.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={sectionTitle}>In progress</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {upcoming.map((m) => <Row key={m.id} meeting={m} />)}
          </div>
        </section>
      )}

      <section>
        <h2 style={sectionTitle}>Published</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {past.map((m) => <Row key={m.id} meeting={m} />)}
          {past.length === 0 && <p style={{ color: "var(--text-3)" }}>Nothing published yet.</p>}
        </div>
      </section>
    </main>
  );
}

function Row({ meeting }: { meeting: { id: string; title: string; meeting_date: string; status: string } }) {
  return (
    <Link href={`/app/meetings/${meeting.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 500 }}>{meeting.title}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
        {new Date(meeting.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        {meeting.status === "review" && " · needs review"}
        {meeting.status === "draft" && " · not started"}
      </span>
    </Link>
  );
}
