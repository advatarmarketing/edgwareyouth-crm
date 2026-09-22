import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { loadViewer } from "@/lib/permissions";
import type { PermissionKey } from "@/lib/supabase/types";

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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppNav permissions={granted} />
      {children}
    </div>
  );
}
