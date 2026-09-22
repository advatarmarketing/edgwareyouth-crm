import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { pageTitle } from "@/lib/ui";
import { createMeeting } from "../actions";
import { CreateMeetingForm } from "../[id]/MeetingForms";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("meetings.manage")) redirect("/app/meetings");

  const supabase = createClient();

  const [{ data: templates }, { data: people }] = await Promise.all([
    supabase.from("meeting_templates").select("id, name").eq("is_active", true).order("position"),
    supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <main style={{ padding: "28px 16px", maxWidth: 820, margin: "0 auto" }}>
      <Link href="/app/meetings" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Meetings</Link>
      <h1 style={{ ...pageTitle, margin: "8px 0 8px" }}>New meeting</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 24px", lineHeight: 1.6 }}>
        The agenda is built from the type you pick, and any unfinished actions from the
        last meeting of the same type come across as Matters arising.
      </p>

      <CreateMeetingForm templates={templates ?? []} people={people ?? []} action={createMeeting} />
    </main>
  );
}
