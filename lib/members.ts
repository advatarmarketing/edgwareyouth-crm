import type { Position, Tier } from "@/lib/supabase/types";

/**
 * Pure display helpers, kept out of lib/permissions.ts on purpose.
 *
 * That file imports the server-side Supabase client, which pulls in
 * next/headers — so a client component importing anything from it, even
 * a plain string map, fails the build. These have no server dependency
 * and are safe on both sides.
 */

/** How a person is described in one line. "Sabiqun + Ansar", "Ansar only". */
export function describeTier(tier: Tier | null, isAnsar: boolean): string {
  const name = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : null;
  if (name && isAnsar) return `${name} + Ansar`;
  if (name) return name;
  return isAnsar ? "Ansar only" : "No tier";
}

export const POSITION_LABELS: Record<Position, string> = {
  lead: "Lead",
  vice_lead: "Vice Lead",
  head_of_finance: "Head of Finance",
  head_of_media: "Head of Media",
  event_lead: "Event Lead",
};
