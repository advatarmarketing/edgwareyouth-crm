import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadViewer } from "@/lib/permissions";
import { displayName } from "@/lib/names";
import { card, pageTitle, sectionTitle } from "@/lib/ui";
import { markChannelRead, postMessage } from "../actions";
import { Composer, MarkRead } from "../MessageForms";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: { id: string } }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const id = params.id;

  const { data: channel } = await supabase.from("channels").select("*").eq("id", id).maybeSingle();
  if (!channel) notFound();

  const [{ data: messages }, { data: members }, { data: people }, { data: teams }, { data: canPost }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("channel_id", id)
        .is("deleted_at", null)
        .order("created_at"),
      supabase.from("channel_members").select("profile_id").eq("channel_id", id),
      supabase.from("member_directory").select("id, full_name").eq("is_active", true),
      supabase.from("teams").select("key, name").order("name"),
      supabase.rpc("can_post_in_channel", { p_channel_id: id }),
    ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, displayName(p.full_name)]));

  const [{ data: attachments }, { data: readStatus }] = await Promise.all([
    supabase
      .from("message_attachments")
      .select("*")
      .in("message_id", (messages ?? []).map((m) => m.id).slice(0, 500)),
    channel.kind === "announcement"
      ? supabase.from("announcement_read_status").select("*").eq("channel_id", id)
      : Promise.resolve({ data: null }),
  ]);

  const title =
    channel.kind === "dm"
      ? (members ?? [])
          .filter((m) => m.profile_id !== viewer.id)
          .map((m) => nameOf.get(m.profile_id) ?? "Someone")
          .join(", ") || "Just you"
      : channel.name ?? "Channel";

  return (
    <main style={{ padding: "28px 16px", maxWidth: 780, margin: "0 auto" }}>
      <Link href="/app/messages" style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>← Messages</Link>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginTop: 8 }}>
        <h1 style={{ ...pageTitle, margin: 0 }}>{title}</h1>
        {channel.is_archived && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", color: "var(--text-3)" }}>
            Archived
          </span>
        )}
      </div>
      {channel.initiative_id && (
        <Link href={`/app/events/${channel.initiative_id}`} style={{ color: "var(--accent)", fontSize: 13 }}>
          The event file
        </Link>
      )}

      <MarkRead channelId={id} onRead={markChannelRead} />

      <div style={{ display: "grid", gap: 10, margin: "20px 0" }}>
        {(messages ?? []).length === 0 && (
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing said yet.</p>
        )}
        {(messages ?? []).map((m) => {
          const files = (attachments ?? []).filter((a) => a.message_id === m.id);
          const mine = m.author_id === viewer.id;
          const unread =
            channel.kind === "announcement"
              ? (readStatus ?? []).filter((r) => r.message_id === m.id && r.read_at == null)
              : [];
          return (
            <article key={m.id} style={{ ...card, borderColor: mine ? "var(--border-2)" : "var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <strong style={{ color: "var(--text-1)", fontSize: 14 }}>
                  {m.author_id ? nameOf.get(m.author_id) ?? "Someone" : "Someone"}
                </strong>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                  {new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  {!m.audience_all && " · targeted"}
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--text-1)", whiteSpace: "pre-wrap" }}>
                {m.body}
              </p>
              {files.length > 0 && (
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
                  {files.map((f) => (
                    <li key={f.id} style={{ fontSize: 13, color: "var(--text-2)" }}>
                      📎 {f.filename}
                      {f.size_bytes && (
                        <span style={{ color: "var(--text-3)" }}> · {Math.round(f.size_bytes / 1024)} KB</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* The question the shared `read` flag made unanswerable. */}
              {mine && channel.kind === "announcement" && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  {unread.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#1e8449" }}>Everyone has read this.</span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--accent)" }}>
                      Not read by {unread.map((r) => displayName(r.full_name)).join(", ")}
                    </span>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {channel.is_archived ? (
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          This event is closed, so the conversation is closed with it. It stays here because it
          is part of the record.
        </p>
      ) : canPost ? (
        <section style={card}>
          <h2 style={{ ...sectionTitle, marginTop: 0 }}>Say something</h2>
          <Composer
            channelId={id}
            isAnnouncement={channel.kind === "announcement"}
            teams={teams ?? []}
            action={postMessage}
          />
        </section>
      ) : (
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          {channel.kind === "announcement"
            ? "Announcements are posted by the shura."
            : "You can read this but not post in it."}
        </p>
      )}
    </main>
  );
}
