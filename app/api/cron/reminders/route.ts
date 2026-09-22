import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily sweep: tasks due in two days, and tasks already overdue
 * (spec 4.4 — "Reminders 2 days before and on the day; overdue flagged
 * to assigner and shura").
 *
 * Runs as a scheduled job rather than being worked out when somebody
 * opens a page: a reminder has to arrive whether or not the person
 * logs in, which is the entire point of it.
 *
 * Guarded by CRON_SECRET. Without that this is an unauthenticated
 * endpoint that writes notification rows, which anybody who guessed
 * the path could spam. The check comes first, before any query.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  }

  // Vercel Cron sends this header; a manual call can use it too.
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const today = new Date();
  const todayKey = key(today);
  const inTwoDays = key(new Date(today.getTime() + 2 * 86_400_000));

  const { data: dueSoon } = await admin
    .from("tasks")
    .select("id, title, owner_id, due_date")
    .eq("due_date", inTwoDays)
    .neq("status", "done");

  const { data: overdue } = await admin
    .from("tasks")
    .select("id, title, owner_id, due_date, created_by")
    .lt("due_date", todayKey)
    .neq("status", "done");

  const rows: { user_id: string; kind: string; title: string; body: string; href: string }[] = [];

  for (const task of dueSoon ?? []) {
    if (!task.owner_id) continue;
    rows.push({
      user_id: task.owner_id,
      kind: "task_due_soon",
      title: task.title,
      body: "Due in two days.",
      href: `/app/tasks/${task.id}`,
    });
  }

  for (const task of overdue ?? []) {
    if (task.owner_id) {
      rows.push({
        user_id: task.owner_id,
        kind: "task_overdue",
        title: task.title,
        body: `Was due ${task.due_date}.`,
        href: `/app/tasks/${task.id}`,
      });
    }
    // The person who handed it out is told too, but only if that is
    // somebody else — no point telling you your own task is late twice.
    if (task.created_by && task.created_by !== task.owner_id) {
      rows.push({
        user_id: task.created_by,
        kind: "task_overdue",
        title: `Overdue: ${task.title}`,
        body: `Was due ${task.due_date}.`,
        href: `/app/tasks/${task.id}`,
      });
    }
  }

  if (rows.length > 0) {
    await admin.from("notifications").insert(rows as never);
  }

  return NextResponse.json({ dueSoon: dueSoon?.length ?? 0, overdue: overdue?.length ?? 0, created: rows.length });
}

function key(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
