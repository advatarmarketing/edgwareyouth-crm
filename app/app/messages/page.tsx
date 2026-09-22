import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { displayName } from "@/lib/names";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { startDirectMessage } from "./actions";
import { StartDmForm } from "./MessageForms";

export const dynamic = "force-dynamic";

const KIND_ORDER: Record<string, number> = { announcement: 0, event: 1, team: 2, dm: 3 };

export default async function MessagesPage() {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();

  // RLS decides which channels come back; this page never filters by
  // kind or membership itself.
  const [{ data: channels }, { data: unread }, { data: members }, { data: people }] =
    await Promise.all([
      supabase.from("channels").select("*").order("kind"),
      supabase.from("channel_unread").select("*"),
      supabase.from("channel_members").select("channel_id, profile_id"),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true).order("full_name"),
    ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, displayName(p.full_name)]));
  const unreadOf = new Map((unread ?? []).map((u) => [u.channel_id, u]));

  // A direct message has no name — the other person is the name.
  const labelFor = (channelId: string, kind: string, name: string | null): string => {
    if (kind !== "dm") return name ?? "Untitled";
    const others = (members ?? [])
      .filter((m) => m.channel_id === channelId && m.profile_id !== viewer.id)
      .map((m) => nameOf.get(m.profile_id) ?? "Someone");
    return others.length ? others.join(", ") : "Just you";
  };

  const sorted = [...(channels ?? [])].sort((a, b) => {
    if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1;
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <h1 style={pageTitle}>Messages</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 24px", lineHeight: 1.6 }}>
        Read state is per person here. If it says four people have not read the announcement,
        four people have not read it.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
        {sorted.length === 0 && (
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>No channels yet.</p>
        )}
        {sorted.map((c) => {
          const u = unreadOf.get(c.id);
          return (
            <Link key={c.id} href={`/app/messages/${c.id}`}
              style={{ ...card, textDecoration: "none", display: "block", opacity: c.is_archived ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ color: "var(--text-1)" }}>{labelFor(c.id, c.kind, c.name)}</strong>
                  <span style={{
                    marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10,
                    textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)",
                  }}>
                    {c.kind === "dm" ? "direct" : c.kind}
                    {c.is_archived && " · archived"}
                  </span>
                </div>
                {u && u.unread > 0 && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                    background: "var(--accent)", color: "var(--accent-fg)",
                    borderRadius: 10, padding: "1px 8px",
                  }}>
                    {u.unread}
                  </span>
                )}
              </div>
              {c.description && !c.is_archived && (
                <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 3 }}>{c.description}</div>
              )}
            </Link>
          );
        })}
      </div>

      <section style={card}>
        <h2 style={{ ...sectionTitle, marginTop: 0 }}>Direct message</h2>
        <StartDmForm
          people={(people ?? []).filter((p) => p.id !== viewer.id)}
          action={startDirectMessage}
        />
      </section>
    </main>
  );
}
