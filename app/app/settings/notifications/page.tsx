import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_LABELS } from "@/lib/notify";
import { button, pageTitle } from "@/lib/ui";
import { saveNotificationPreferences } from "./actions";
import type { NotificationKind } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Email on/off per notification type (spec 4.16).
 *
 * The in-app bell is not switchable and is not listed here. It costs
 * nothing, and a person who has turned off every email still needs
 * somewhere their overdue tasks show up.
 */
export default async function NotificationSettingsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("kind, email_enabled")
    .eq("user_id", user.id);

  // A missing row means on. Nobody should have to opt in to being told
  // their own task is overdue.
  const enabled = new Map((prefs ?? []).map((p) => [p.kind, p.email_enabled]));
  const kinds = Object.keys(NOTIFICATION_LABELS) as NotificationKind[];

  return (
    <main style={{ padding: "28px 16px", maxWidth: 620, margin: "0 auto" }}>
      <h1 style={pageTitle}>Notifications</h1>
      <p style={{ color: "var(--text-2)", margin: "8px 0 28px", lineHeight: 1.6 }}>
        Everything below shows in the bell regardless. These switches only decide
        whether it also reaches you by email.
      </p>

      <form action={saveNotificationPreferences} style={{ display: "grid", gap: 4 }}>
        {kinds.map((kind) => (
          <label
            key={kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              fontSize: 14,
            }}
          >
            <input type="checkbox" name={`email:${kind}`} defaultChecked={enabled.get(kind) ?? true} />
            {NOTIFICATION_LABELS[kind]}
          </label>
        ))}

        <div style={{ marginTop: 16 }}>
          <button type="submit" style={button}>Save</button>
        </div>
      </form>
    </main>
  );
}
