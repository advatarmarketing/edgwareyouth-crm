import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer, describeTier } from "@/lib/permissions";
import type { PermissionKey, TierKey } from "@/lib/supabase/types";
import { PermissionsForm } from "./PermissionsForm";

export const dynamic = "force-dynamic";

/**
 * The permissions screen — spec section 2: "the shura can switch
 * individual permissions on or off per person".
 *
 * Pick a person, then set each key to Default, Always on, or Always
 * off. Default is not the same as off: it means "whatever their tier
 * says", so promoting someone later moves their permissions with them
 * instead of leaving a pinned set behind.
 */
export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: { member?: string };
}) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("permissions.manage")) redirect("/app/dashboard");

  const supabase = createClient();

  const { data: members } = await supabase
    .from("member_directory")
    .select("id, full_name, tier, is_ansar")
    .eq("is_active", true)
    .order("full_name");

  const selectedId = searchParams.member;
  const selected = (members ?? []).find((m) => m.id === selectedId);

  const [{ data: permissions }, { data: tierRows }, { data: overrideRows }] = await Promise.all([
    supabase.from("permissions").select("*").order("category").order("key"),
    supabase.from("tier_permissions").select("tier_key, permission_key"),
    selected
      ? supabase.from("profile_permissions").select("permission_key, granted").eq("profile_id", selected.id)
      : Promise.resolve({ data: null }),
  ]);

  // What the tier alone would grant — shown next to each row so the
  // shura can see what they are overriding rather than guessing.
  const tierKeys: TierKey[] = selected
    ? ([selected.tier, selected.is_ansar ? "ansar" : null].filter(Boolean) as TierKey[])
    : [];

  const defaults = (tierRows ?? [])
    .filter((r) => tierKeys.includes(r.tier_key))
    .map((r) => r.permission_key as PermissionKey);

  const overrides: Record<string, boolean> = {};
  for (const row of overrideRows ?? []) overrides[row.permission_key] = row.granted;

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/admin" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Admin</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: "8px 0 4px" }}>Permissions</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", maxWidth: 560, lineHeight: 1.6 }}>
        Each tier comes with a set of permissions. Here you change them for one person —
        giving a sabiqun finance access, say, or taking something away. “Default” follows
        their tier, so it keeps up if they are promoted.
      </p>

      <form style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        <select name="member" defaultValue={selectedId ?? ""} style={select}>
          <option value="">Choose someone…</option>
          {(members ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name ?? "Unnamed"} — {describeTier(m.tier, m.is_ansar)}
            </option>
          ))}
        </select>
        <button type="submit" style={secondary}>Open</button>
      </form>

      {selected ? (
        <PermissionsForm
          profileId={selected.id}
          permissions={permissions ?? []}
          defaults={defaults}
          overrides={overrides}
        />
      ) : (
        <p style={{ color: "var(--text-3)" }}>Pick someone to see what they can do.</p>
      )}
    </main>
  );
}

const select = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontSize: 14,
  flex: "1 1 260px",
} as const;

const secondary = {
  padding: "9px 16px",
  border: "1px solid var(--border-2)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  cursor: "pointer",
} as const;
