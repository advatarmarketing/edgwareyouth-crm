import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationKind } from "@/lib/supabase/types";

/**
 * Raises an in-app notification.
 *
 * Email is not sent from here. The bell is immediate and the email is
 * a nightly sweep over rows with `emailed_at is null` — so a burst of
 * ten task assignments is one digest rather than ten messages, and a
 * failing mail provider can never take a server action down with it.
 *
 * Written with the service-role client, because the row belongs to the
 * person being told, not to the person doing the telling — the
 * "notifications: own" policy would reject it otherwise. That is the
 * correct shape: you may read only your own, and nobody can write to
 * their own to fake one.
 */
export async function notify(
  admin: SupabaseClient<Database>,
  notification: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body?: string | null;
    href?: string | null;
  }
): Promise<void> {
  // A notification failing must never fail the thing that caused it.
  // Somebody's task still got assigned even if the bell stays quiet.
  const { error } = await admin.from("notifications").insert({
    user_id: notification.userId,
    kind: notification.kind,
    title: notification.title,
    body: notification.body ?? null,
    href: notification.href ?? null,
  });

  if (error) console.error("notify failed:", error.message);
}

export async function notifyMany(
  admin: SupabaseClient<Database>,
  userIds: string[],
  notification: { kind: NotificationKind; title: string; body?: string | null; href?: string | null }
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;

  const { error } = await admin.from("notifications").insert(
    unique.map((user_id) => ({
      user_id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body ?? null,
      href: notification.href ?? null,
    }))
  );

  if (error) console.error("notifyMany failed:", error.message);
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  task_new: "A task is given to me",
  task_due_soon: "A task of mine is due in 2 days",
  task_overdue: "A task of mine is overdue",
  task_blocked: "A task I assigned is blocked",
  meeting_pack: "My meeting pack after a meeting",
  mention: "Somebody @mentions me",
  event_decision: "An event I proposed is approved or returned",
  expense_decision: "My expense claim is decided",
  announcement: "A new announcement",
  sop_to_read: "A new or updated SOP to read",
};
