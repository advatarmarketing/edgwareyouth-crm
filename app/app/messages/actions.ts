"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notify";
import { findMentions } from "@/lib/messaging/mentions";
import type { TeamKey, TierKey } from "@/lib/supabase/types";

export interface ActionState {
  error: string | null;
  ok: string | null;
}

function explain(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You cannot post in that channel.";
  }
  return message;
}

/**
 * Post a message, resolve its mentions, attach its file.
 *
 * The order matters: the message row first, because a mention or an
 * attachment with no message is orphaned, whereas a message whose
 * mention failed is merely a message.
 */
export async function postMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const channelId = String(formData.get("channel_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.size > 0;

  if (!body && !hasFile) return { error: "Nothing to send.", ok: null };

  // Announcement targeting. Absent means everyone, which is what the
  // column defaults to.
  const tiers = formData.getAll("tier").map(String).filter(Boolean) as TierKey[];
  const teams = formData.getAll("team").map(String).filter(Boolean) as TeamKey[];
  const targeted = tiers.length > 0 || teams.length > 0;

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      channel_id: channelId,
      author_id: user.id,
      body: body || "(attachment)",
      audience_all: !targeted,
    })
    .select("id")
    .single();

  if (error || !message) return { error: explain(error?.message ?? "Could not send it."), ok: null };

  if (targeted) {
    if (tiers.length) {
      await supabase.from("message_audience_tiers").insert(
        tiers.map((tier_key) => ({ message_id: message.id, tier_key })),
      );
    }
    if (teams.length) {
      await supabase.from("message_audience_teams").insert(
        teams.map((team_key) => ({ message_id: message.id, team_key })),
      );
    }
  }

  if (hasFile) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(path, file, { contentType: file.type || undefined });
    if (!uploadError) {
      await supabase.from("message_attachments").insert({
        message_id: message.id,
        path,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
    }
  }

  // Mentions. Resolved against people who can actually see the
  // channel, so @-ing somebody into a conversation they have no access
  // to does not send them a notification about a page they cannot open.
  const { data: audience } = await supabase
    .from("channel_members")
    .select("profile_id")
    .eq("channel_id", channelId);

  const { data: channel } = await supabase
    .from("channels").select("kind, name").eq("id", channelId).maybeSingle();

  const { data: people } = await supabase
    .from("member_directory")
    .select("id, full_name, nickname")
    .eq("is_active", true);

  const reachable =
    channel?.kind === "announcement"
      ? (people ?? [])
      : (people ?? []).filter((p) => (audience ?? []).some((m) => m.profile_id === p.id));

  const found = findMentions(
    body,
    reachable.map((p) => ({ id: p.id, fullName: p.full_name, nickname: p.nickname })),
  );

  const toNotify = found.profileIds.filter((id) => id !== user.id);
  if (toNotify.length) {
    await supabase.from("message_mentions").insert(
      toNotify.map((profile_id) => ({ message_id: message.id, profile_id })),
    );
    await notifyMany(createAdminClient(), toNotify, {
      kind: "mention",
      title: `You were mentioned in ${channel?.name ?? "a channel"}`,
      body: body.slice(0, 140),
      href: `/app/messages/${channelId}`,
    });
  }

  revalidatePath(`/app/messages/${channelId}`);

  // Tell the sender what did NOT land. Same rule as the meeting
  // parser: a mention that matched nobody, or matched six people, is
  // reported rather than quietly doing nothing.
  const notes: string[] = [];
  if (found.unknown.length) {
    notes.push(`Nobody called ${found.unknown.map((u) => `@${u}`).join(", ")} — not notified.`);
  }
  for (const a of found.ambiguous) {
    notes.push(`@${a.token} could be ${a.candidates.join(" or ")} — nobody notified.`);
  }

  return { error: null, ok: notes.length ? `Sent. ${notes.join(" ")}` : "Sent." };
}

/**
 * Mark everything visible in a channel as read, for this person only.
 *
 * Upsert with ignoreDuplicates so re-opening a channel does not move
 * the original read time — when somebody first saw a message is worth
 * more than when they last looked at the page.
 */
export async function markChannelRead(channelId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: messages } = await supabase
    .from("messages")
    .select("id")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .neq("author_id", user.id);

  if (!messages?.length) return {};

  const { error } = await supabase.from("message_reads").upsert(
    messages.map((m) => ({ message_id: m.id, profile_id: user.id })),
    { onConflict: "message_id,profile_id", ignoreDuplicates: true },
  );

  if (error) return { error: error.message };
  revalidatePath("/app/messages");
  return {};
}

export async function startDirectMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", ok: null };

  const withId = String(formData.get("profile_id") ?? "");
  if (!withId || withId === user.id) return { error: "Pick somebody else.", ok: null };

  // An existing two-person conversation is reused rather than stacked
  // up: three threads with the same person is how messages get missed.
  const { data: mine } = await supabase
    .from("channel_members")
    .select("channel_id, channels!inner(kind)")
    .eq("profile_id", user.id);

  const candidateIds = (mine ?? [])
    .filter((row) => (row.channels as unknown as { kind: string }).kind === "dm")
    .map((row) => row.channel_id);

  if (candidateIds.length) {
    const { data: theirs } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("profile_id", withId)
      .in("channel_id", candidateIds);
    if (theirs?.length) redirect(`/app/messages/${theirs[0].channel_id}`);
  }

  const { data: channel, error } = await supabase
    .from("channels")
    .insert({ kind: "dm", created_by: user.id })
    .select("id")
    .single();

  if (error || !channel) return { error: explain(error?.message ?? "Could not start it."), ok: null };

  await supabase.from("channel_members").insert([
    { channel_id: channel.id, profile_id: user.id, is_owner: true },
    { channel_id: channel.id, profile_id: withId },
  ]);

  redirect(`/app/messages/${channel.id}`);
}
