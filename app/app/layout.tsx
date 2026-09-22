import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { loadViewer } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification, PermissionKey } from "@/lib/supabase/types";

const ALL_KEYS: PermissionKey[] = [
  "members.view_directory", "members.view_contact", "members.manage", "members.view_notes",
  "permissions.manage", "audit.view", "tasks.assign", "sops.manage", "calendar.view_all",
  "meetings.manage", "meetings.view_shura", "events.propose", "events.approve", "events.view_all",
  "risk.manage", "finance.view_totals", "finance.view_individual", "finance.log", "finance.approve",
  "strategy.edit", "yearplan.view", "okr.manage", "okr.update_own", "kpi.view",
  "announcements.post", "media.manage", "media.edit", "development.view_all", "resources.upload",
];

/**
 * Shared shell for everything under /app/*.
 *
 * middleware.ts has already confirmed there is a session and the
 * account is active. Loading the viewer here is for the nav only.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await loadViewer();

  if (!viewer) redirect("/login");

  const granted = ALL_KEYS.filter((key) => viewer.can(key));

  // The bell's first page, fetched here so it paints filled in. RLS
  // returns the caller's own rows only, so there is nothing to filter.
  const { data: notifications } = await createClient()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppNav permissions={granted} notifications={(notifications ?? []) as AppNotification[]} />
      {children}
    </div>
  );
}
