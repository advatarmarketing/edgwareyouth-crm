import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth gate for /app/*.
 *
 * This checks two things only: that you are signed in, and that your
 * account is still active. It deliberately does NOT decide what you may
 * see once you are in.
 *
 * The Advatar CRM mapped each role to a list of allowed route prefixes
 * here. That worked because its roles were whole separate workspaces —
 * a client and a videographer never shared a page. Edgware Youth is
 * staff-only and the tiers share almost every screen, differing by what
 * is on it (spec section 3 is a matrix of areas, not of routes). A
 * prefix list would therefore have to be rebuilt from the permission
 * model on every change and would still be a convenience, never a
 * control.
 *
 * So: the nav hides what you cannot use, has_permission() gates the
 * server actions, and RLS in Postgres is what actually stops you
 * reading someone else's data. Prompt 1 builds all three. Do not
 * reintroduce a prefix allowlist here and treat it as security.
 */

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAppRoute = pathname.startsWith("/app");

  if (!isAppRoute) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();

  // No profile row means the auth user exists but was never
  // provisioned — treat as unauthenticated rather than guessing.
  // An inactive member keeps their login but loses access: the shura
  // deactivate people rather than deleting them, because the
  // engagement history in spec 4.3 has to survive them leaving.
  if (!profile || profile.is_active === false) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "inactive");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};
