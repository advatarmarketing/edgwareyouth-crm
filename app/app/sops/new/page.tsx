import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { pageTitle } from "@/lib/ui";
import { SopEditor } from "../SopEditor";

export const dynamic = "force-dynamic";

export default async function NewSopPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("sops.manage")) redirect("/app/sops");

  const { data: teams } = await createClient().from("teams").select("*").eq("is_active", true).order("position");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/sops" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← SOPs</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 24px" }}>New SOP</h1>
      <SopEditor sop={null} steps="" teams={teams ?? []} visibleTiers={[]} visibleTeams={[]} />
    </main>
  );
}
