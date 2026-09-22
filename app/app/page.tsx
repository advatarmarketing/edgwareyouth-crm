import { redirect } from "next/navigation";
import { APP_HOME } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * The front door at /app.
 *
 * The web manifest's `start_url` is /app, so launching from a phone
 * home screen arrives here. Without a page, that is a 404 — so this
 * exists even though nobody types it.
 */
export default function AppIndexPage() {
  redirect(APP_HOME);
}
