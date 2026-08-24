import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { AppUser, Role } from "@/lib/types";

export const SESSION_COOKIE_NAME = "session";
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Create session cookie from ID token ─────────────────────────────────────

export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = adminAuth();
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRY_MS });
}

// ─── Verify session cookie and return decoded claims ─────────────────────────

export async function verifySession(
  sessionCookie: string
): Promise<{ uid: string; email: string } | null> {
  try {
    const auth = adminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email ?? "" };
  } catch {
    return null;
  }
}

// ─── Get session cookie from request ─────────────────────────────────────────

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

// ─── Get the currently authenticated user from the session ───────────────────

export async function getCurrentUser(): Promise<AppUser | null> {
  const sessionCookie = await getSessionCookie();
  if (!sessionCookie) return null;

  const session = await verifySession(sessionCookie);
  if (!session) return null;

  const db = adminDb();
  const userDoc = await db.collection("users").doc(session.uid).get();
  if (!userDoc.exists) return null;

  const data = userDoc.data()!;
  return {
    uid: session.uid,
    name: data.name ?? "",
    email: data.email ?? session.email,
    role: data.role ?? "salesman",
    country: data.country,
    poolCountries: data.poolCountries ?? undefined,
    activeProxyLimit: data.activeProxyLimit ?? 4,
    status: data.status ?? "active",
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  };
}

// ─── Require auth — throws 401/403 via response if not met ───────────────────

export async function requireAuth(
  allowedRoles?: Role[]
): Promise<AppUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError(401, "Not authenticated");
  }

  if (user.status === "disabled") {
    throw new AuthError(403, "Account is disabled");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new AuthError(403, "Insufficient permissions");
  }

  return user;
}

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ─── Helper to handle auth errors in API routes ───────────────────────────────

export function handleAuthError(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json(
      { success: false, error: err.message },
      { status: err.statusCode }
    );
  }
  // Always return JSON — never let Next.js emit an empty 500 body
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";
  console.error("[API error]", err);
  return Response.json(
    { success: false, error: message },
    { status: 500 }
  );
}
