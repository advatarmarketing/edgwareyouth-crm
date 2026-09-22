import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, Position, TeamKey, Tier } from "@/lib/supabase/types";

/**
 * Who is looking, and what they may do.
 *
 * One round trip for the profile and one for the permission set, at
 * the top of any page that needs either. The permissions come from
 * my_permissions() in the database rather than being recomputed here:
 * if this file and the SQL ever disagreed, the UI would show people
 * buttons that then fail, which is worse than not showing them.
 *
 * Nothing here is a security control. It decides what to RENDER. The
 * policies in Postgres are what stop the data coming back.
 */
export interface Viewer {
  id: string;
  fullName: string | null;
  tier: Tier | null;
  isAnsar: boolean;
  position: Position | null;
  teams: TeamKey[];
  can: (permission: PermissionKey) => boolean;
}

export async function loadViewer(): Promise<Viewer | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: permissionKeys }, { data: teamRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, tier, is_ansar, position").eq("id", user.id).single(),
    supabase.rpc("my_permissions"),
    supabase.from("team_members").select("team_key").eq("profile_id", user.id),
  ]);

  if (!profile) return null;

  const granted = new Set((permissionKeys ?? []) as string[]);

  return {
    id: user.id,
    fullName: profile.full_name,
    tier: profile.tier,
    isAnsar: profile.is_ansar,
    position: profile.position,
    teams: (teamRows ?? []).map((t) => t.team_key),
    can: (permission) => granted.has(permission),
  };
}

// Display helpers live in lib/members.ts so client components can
// use them without dragging next/headers into the bundle.
export { describeTier, POSITION_LABELS } from "@/lib/members";
