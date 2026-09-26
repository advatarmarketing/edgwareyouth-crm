import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Where an invite or password-reset link lands if the Supabase email
 * template is changed to the token_hash format (see docs/GO-LIVE.md).
 *
 * Verifying the token HERE, on the server, rather than letting Supabase
 * redirect back with the session in the URL's #fragment, is Supabase's
 * own recommendation for server-rendered apps: the session is set as a
 * cookie before the browser sees any page, and no token ever sits in
 * the address bar or the browser history.
 *
 * The default template still works without this route — /welcome reads
 * the #fragment itself — so nothing breaks before the template change.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Only ever redirect within this site. `next` comes from a URL a
  // stranger could hand-craft, and an open redirect on the sign-in
  // path is exactly how a convincing phishing link gets built.
  const next = searchParams.get("next") ?? "/welcome";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/welcome";

  const supabase = createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/welcome?error=expired`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/welcome?error=expired`);
  }

  return NextResponse.redirect(`${origin}/welcome?error=missing`);
}
