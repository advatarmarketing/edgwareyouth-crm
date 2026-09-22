"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_LABELS } from "@/lib/notify";
import type { NotificationKind } from "@/lib/supabase/types";

export async function saveNotificationPreferences(formData: FormData): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const rows = (Object.keys(NOTIFICATION_LABELS) as NotificationKind[]).map((kind) => ({
    user_id: user.id,
    kind,
    email_enabled: formData.get(`email:${kind}`) === "on",
  }));

  await supabase.from("notification_preferences").upsert(rows);
  revalidatePath("/app/settings/notifications");
}
