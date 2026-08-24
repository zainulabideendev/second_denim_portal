import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "session";

// Routes accessible without authentication
const PUBLIC_ROUTES = ["/login"];

// Role-based route guards (prefix matching)
const ADMIN_ONLY_PREFIXES = ["/users", "/audit-log", "/pools"];
const MANAGER_PLUS_PREFIXES = [
  "/proxies",
  "/phone-numbers",
  "/emails",
  "/requests",
];
const SALESMAN_ROUTES = ["/proxies/my", "/phone-numbers/my", "/requests/my"];

function getRouteTier(pathname: string): "public" | "salesman" | "manager" | "admin" {
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")))
    return "public";
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return "admin";
  // /proxies/my and /phone-numbers/my are salesman-accessible too
  if (SALESMAN_ROUTES.some((p) => pathname.startsWith(p))) return "salesman";
  if (MANAGER_PLUS_PREFIXES.some((p) => pathname.startsWith(p)))
    return "manager";
  return "salesman"; // dashboard and anything else requires at minimum a login
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes and Next.js internals through — they do their own auth
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const tier = getRouteTier(pathname);

  // Public pages: redirect to dashboard if already logged in
  if (tier === "public") {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protected pages: require session cookie (actual verification happens server-side)
  if (!sessionCookie) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  // We can't verify the JWT in Edge middleware without Firebase Admin,
  // so we pass the role check to the page's server component / API route.
  // The cookie presence check is enough for the redirect gate here.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
