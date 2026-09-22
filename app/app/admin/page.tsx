import Link from "next/link";
import { redirect } from "next/navigation";
import { loadViewer } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");
  if (!viewer.can("members.manage")) redirect("/app/dashboard");

  return (
    <main style={{ padding: "28px 16px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, margin: "0 0 24px" }}>Admin</h1>

      <div style={{ display: "grid", gap: 10 }}>
        <Card href="/app/admin/invite" title="Invite someone" body="Send an invite and set their tier." />
        {viewer.can("permissions.manage") && (
          <Card
            href="/app/admin/permissions"
            title="Permissions"
            body="Turn individual permissions on or off for one person, on top of what their tier gives them."
          />
        )}
        <Card href="/app/members" title="Members" body="The directory, and where you edit someone's details." />
      </div>
    </main>
  );
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "16px 18px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{title}</div>
      <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 2 }}>{body}</div>
    </Link>
  );
}
