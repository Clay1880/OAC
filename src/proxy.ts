import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeFor } from "@/lib/auth/redirects";
import type { UserRole } from "@/lib/auth/types";
import { supabaseEnv } from "@/lib/supabase/env";

/** Reachable without signing in. Everything else needs a session. */
const SIGNED_OUT_PATHS = ["/login", "/verify", "/staff-login", "/demo-login"];

const isArea = (path: string, area: string) => path === area || path.startsWith(`${area}/`);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = supabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  /** A redirect that keeps any session cookies the client just refreshed. */
  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  const path = request.nextUrl.pathname;

  // Dev-only design reference page.
  if (process.env.NODE_ENV !== "production" && path === "/design") return response;

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) {
    return SIGNED_OUT_PATHS.includes(path) ? response : redirectTo("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
    .eq("id", userId)
    .maybeSingle();

  // A signed-in user without a profile is a student who has not finished onboarding.
  const role: UserRole = (profile?.role as UserRole | undefined) ?? "student";
  const home = homeFor(role, profile !== null, profile?.must_change_password ?? false, profile?.is_active ?? true);

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return redirectTo(home);
  }

  // Onboarding and the forced password change are the only places those users may be.
  if (!profile) return path === "/onboarding" ? response : redirectTo(home);
  if (profile.must_change_password) return path === "/change-password" ? response : redirectTo(home);

  if (SIGNED_OUT_PATHS.includes(path) || path === "/onboarding" || path === "/change-password") {
    return redirectTo(home);
  }

  if (role === "student" && (isArea(path, "/staff") || isArea(path, "/admin"))) return redirectTo(home);
  if (role === "staff" && isArea(path, "/admin")) return redirectTo(home);
  if (role !== "student" && !isArea(path, "/staff") && !isArea(path, "/admin")) return redirectTo(home);

  return response;
}

export const config = {
  // Skip assets, the API (routes authenticate themselves) and the offline fallback.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|js|css|map)$).*)",
  ],
};
