import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer, describeTier, POSITION_LABELS } from "@/lib/permissions";
import type { TeamKey } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * The members directory.
 *
 * Reads `member_directory`, not `profiles`. The view masks contact and
 * safeguarding columns to null for anyone without the permission to
 * see them — a column-level rule that a row policy cannot express.
 * Reading profiles directly here would hand a muhsin everyone's phone
 * number, which is exactly the mistake the view exists to prevent.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: { q?: string; team?: string; show?: string };
}) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("members.view_directory")) redirect("/app/dashboard");

  const supabase = createClient();
  const showInactive = searchParams.show === "inactive";

  const [{ data: members }, { data: teams }, { data: memberships }] = await Promise.all([
    supabase.from("member_directory").select("*").order("full_name"),
    supabase.from("teams").select("*").eq("is_active", true).order("position"),
    supabase.from("team_members").select("profile_id, team_key"),
  ]);

  const teamsByMember = new Map<string, TeamKey[]>();
  for (const row of memberships ?? []) {
    const list = teamsByMember.get(row.profile_id) ?? [];
    list.push(row.team_key);
    teamsByMember.set(row.profile_id, list);
  }

  const teamName = new Map((teams ?? []).map((t) => [t.key, t.name]));
  const query = (searchParams.q ?? "").toLowerCase().trim();

  const visible = (members ?? []).filter((m) => {
    if (m.is_active !== !showInactive) return false;
    if (searchParams.team && !(teamsByMember.get(m.id) ?? []).includes(searchParams.team as TeamKey)) return false;
    if (!query) return true;
    return [m.full_name, m.nickname, m.email].some((v) => v?.toLowerCase().includes(query));
  });

  return (
    <main style={{ padding: "28px 16px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: 0 }}>Members</h1>
        {viewer.can("members.manage") && (
          <Link href="/app/admin/invite" style={buttonStyle}>Invite someone</Link>
        )}
      </div>

      <form style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0" }}>
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search name or nickname"
          style={{ ...inputStyle, flex: "1 1 220px" }}
        />
        <select name="team" defaultValue={searchParams.team ?? ""} style={inputStyle}>
          <option value="">All teams</option>
          {(teams ?? []).map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </select>
        {viewer.can("members.manage") && (
          <select name="show" defaultValue={searchParams.show ?? "active"} style={inputStyle}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        )}
        <button type="submit" style={buttonStyle}>Filter</button>
      </form>

      <p style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12, margin: "0 0 12px" }}>
        {visible.length} {visible.length === 1 ? "person" : "people"}
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {visible.map((m) => (
          <Link
            key={m.id}
            href={`/app/members/${m.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>
                {m.full_name ?? "Unnamed"}
                {m.nickname ? <span style={{ color: "var(--text-3)" }}> ({m.nickname})</span> : null}
              </div>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 2 }}>
                {describeTier(m.tier, m.is_ansar)}
                {m.position ? ` · ${POSITION_LABELS[m.position]}` : ""}
                {(teamsByMember.get(m.id) ?? []).length > 0
                  ? ` · ${(teamsByMember.get(m.id) ?? []).map((k) => teamName.get(k) ?? k).join(", ")}`
                  : ""}
              </div>
            </div>
            {/* Null for anyone without members.view_contact — the view
                masked it, so there is nothing to hide here. */}
            {m.phone ? (
              <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "nowrap" }}>
                {m.phone}
              </div>
            ) : null}
          </Link>
        ))}

        {visible.length === 0 && (
          <p style={{ color: "var(--text-2)" }}>Nobody matches that.</p>
        )}
      </div>
    </main>
  );
}

const inputStyle = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontSize: 14,
} as const;

const buttonStyle = {
  padding: "9px 16px",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent)",
  color: "var(--accent-fg)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
  display: "inline-block",
} as const;
