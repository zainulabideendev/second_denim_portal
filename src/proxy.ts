import { type NextRequest, NextResponse } from "next/server";
import {
  copySessionCookies,
  updateSession,
} from "@/utils/supabase/middleware";

const PUBLIC_ROUTES = ["/login"];

const ADMIN_ONLY_PREFIXES = ["/users", "/audit-log", "/pools"];
const MANAGER_PLUS_PREFIXES = [
  "/proxies",
  "/phone-numbers",
  "/emails",
  "/requests",
];
const SALESMAN_ROUTES = ["/proxies/my", "/phone-numbers/my", "/requests/my"];

function getRouteTier(
  pathname: string
): "public" | "salesman" | "manager" | "admin" {
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")))
    return "public";
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return "admin";
  if (SALESMAN_ROUTES.some((p) => pathname.startsWith(p))) return "salesman";
  if (MANAGER_PLUS_PREFIXES.some((p) => pathname.startsWith(p)))
    return "manager";
  return "salesman";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const { supabase, supabaseResponse } = await updateSession(request);
  const tier = getRouteTier(pathname);

  let hasUser = false;
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    hasUser = Boolean(data?.claims?.sub);
  }

  if (tier === "public") {
    if (hasUser) {
      const redirect = NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
      return copySessionCookies(supabaseResponse, redirect);
    }
    return supabaseResponse;
  }

  if (!hasUser) {
    const redirect = NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url)
    );
    return copySessionCookies(supabaseResponse, redirect);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
