import Link from "next/link";
import { redirect } from "next/navigation";
import { loadViewer } from "@/lib/permissions";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("members.manage")) redirect("/app/dashboard");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/app/admin" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Admin</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: "8px 0 4px" }}>Invite someone</h1>
      <p style={{ color: "var(--text-2)", margin: "0 0 28px" }}>
        They get an email with a link to set their own password. Teams, position and
        skills are set afterwards on their member page.
      </p>
      <InviteForm />
    </main>
  );
}
