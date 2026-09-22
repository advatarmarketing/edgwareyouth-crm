import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { pageTitle } from "@/lib/ui";
import { SopEditor } from "../../SopEditor";
import type { TierKey } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function EditSopPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("sops.manage")) redirect(`/app/sops/${params.id}`);

  const supabase = createClient();

  const { data: sop } = await supabase.from("sops").select("*").eq("id", params.id).maybeSingle();
  if (!sop) notFound();

  const [{ data: teams }, { data: items }, { data: tiers }, { data: sopTeams }] = await Promise.all([
    supabase.from("teams").select("*").eq("is_active", true).order("position"),
    sop.checklist_id
      ? supabase.from("checklist_items").select("text, depth, position").eq("checklist_id", sop.checklist_id).order("position")
      : Promise.resolve({ data: null }),
    supabase.from("sop_visible_tiers").select("tier_key").eq("sop_id", params.id),
    supabase.from("sop_visible_teams").select("team_key").eq("sop_id", params.id),
  ]);

  // Back to the text the editor started from — two spaces per level,
  // which is what parseChecklistLines reads as one step of depth.
  const steps = (items ?? []).map((i) => "  ".repeat(i.depth) + i.text).join("\n");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href={`/app/sops/${params.id}`} style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Back</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 24px" }}>Edit SOP</h1>

      <SopEditor
        sop={sop}
        steps={steps}
        teams={teams ?? []}
        visibleTiers={(tiers ?? []).map((t) => t.tier_key as TierKey)}
        visibleTeams={(sopTeams ?? []).map((t) => t.team_key)}
      />
    </main>
  );
}
