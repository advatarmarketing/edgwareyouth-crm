import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer, describeTier, POSITION_LABELS } from "@/lib/permissions";
import type { TeamKey } from "@/lib/supabase/types";
import { MemberForm, NoteForm } from "./MemberForm";

export const dynamic = "force-dynamic";

export default async function MemberPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("members.view_directory")) redirect("/app/dashboard");

  const supabase = createClient();

  const { data: member } = await supabase
    .from("member_directory")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!member) notFound();

  const [{ data: teams }, { data: memberships }] = await Promise.all([
    supabase.from("teams").select("*").order("position"),
    supabase.from("team_members").select("team_key").eq("profile_id", params.id),
  ]);

  const memberTeams = (memberships ?? []).map((m) => m.team_key as TeamKey);

  // Only asked for when the viewer may see them. The policy would
  // return nothing anyway, but not asking keeps the intent obvious.
  const { data: notes } = viewer.can("members.view_notes")
    ? await supabase
        .from("member_notes")
        .select("id, body, created_at")
        .eq("profile_id", params.id)
        .order("created_at", { ascending: false })
    : { data: null };

  const canEdit = viewer.can("members.manage");
  const activeTeams = (teams ?? []).filter((t) => t.is_active);
  const teamName = new Map((teams ?? []).map((t) => [t.key, t.name]));

  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/members" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>
        ← Members
      </Link>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: "8px 0 2px" }}>
        {member.full_name ?? "Unnamed"}
      </h1>

      <p style={{ color: "var(--text-2)", margin: "0 0 28px" }}>
        {describeTier(member.tier, member.is_ansar)}
        {member.position ? ` · ${POSITION_LABELS[member.position]}` : ""}
        {!member.is_active && " · Inactive"}
      </p>

      {!canEdit && (
        <dl style={{ display: "grid", gap: 10, margin: "0 0 28px" }}>
          <Row label="Teams" value={memberTeams.map((k) => teamName.get(k) ?? k).join(", ") || "None"} />
          {/* Null unless the viewer has members.view_contact — the
              directory view masked it before it reached this page. */}
          {member.phone && <Row label="Phone" value={member.phone} />}
          {member.email && <Row label="Email" value={member.email} />}
        </dl>
      )}

      {canEdit && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={heading}>Details</h2>
          <MemberForm member={member} teams={activeTeams} memberTeams={memberTeams} />
        </section>
      )}

      {viewer.can("members.view_notes") && (
        <section>
          <h2 style={heading}>Private notes</h2>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px" }}>
            Shura only. {member.full_name?.split(" ")[0] ?? "This person"} cannot see these.
          </p>

          <NoteForm profileId={member.id} />

          <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
            {(notes ?? []).map((note) => (
              <div
                key={note.id}
                style={{
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{note.body}</div>
                <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
                  {new Date(note.created_at).toLocaleDateString("en-GB")}
                </div>
              </div>
            ))}
            {(notes ?? []).length === 0 && (
              <p style={{ color: "var(--text-3)", fontSize: 14 }}>No notes yet.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <dt style={{ width: 110, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

const heading = {
  fontFamily: "var(--font-display)",
  fontSize: 24,
  margin: "0 0 14px",
} as const;
