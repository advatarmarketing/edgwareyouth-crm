import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { pageTitle } from "@/lib/ui";
import { createInitiative } from "../actions";
import { CreateInitiativeForm } from "../EventForms";

export const dynamic = "force-dynamic";

export default async function NewInitiativePage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("events.propose")) redirect("/app/events");

  const supabase = createClient();

  const [{ data: templates }, { data: people }] = await Promise.all([
    supabase
      .from("initiative_templates")
      .select("id, name, description, weight, kind")
      .eq("is_active", true)
      .order("position"),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/events" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Events</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>Propose something</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        Nothing is created until the shura approve it. On approval the whole plan appears at
        once — roles, run sheet, risks, and a milestone on somebody&apos;s task list for every
        week between now and the day.
      </p>

      <CreateInitiativeForm templates={templates ?? []} people={people ?? []} action={createInitiative} />
    </main>
  );
}
