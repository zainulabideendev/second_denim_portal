import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { AppUser, Role } from "@/lib/types";
import {
  PROFILE_COOKIE_NAME,
  profileCookieOptions,
  signUserProfileCookie,
  verifyUserProfileCookie,
} from "@/lib/user-profile-cookie";

export const SESSION_COOKIE_NAME = "session";
export { PROFILE_COOKIE_NAME };
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Short in-process cache — cuts repeat users/{uid} reads on warm instances. */
const USER_CACHE_TTL_MS = 60_000;
const userDocCache = new Map<string, { user: AppUser; expiresAt: number }>();

export function invalidateUserCache(uid?: string) {
  if (uid) userDocCache.delete(uid);
  else userDocCache.clear();
}

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

function mapUserDoc(
  uid: string,
  sessionEmail: string,
  data: FirebaseFirestore.DocumentData
): AppUser {
  return {
    uid,
    name: data.name ?? "",
    email: data.email ?? sessionEmail,
    role: data.role ?? "salesman",
    country: data.country,
    poolCountries: data.poolCountries ?? undefined,
    activeProxyLimit: data.activeProxyLimit ?? 4,
    status: data.status ?? "active",
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  };
}

async function loadUserFromFirestore(
  uid: string,
  sessionEmail: string
): Promise<AppUser | null> {
  const cached = userDocCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const db = adminDb();
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    userDocCache.delete(uid);
    return null;
  }

  const user = mapUserDoc(uid, sessionEmail, userDoc.data()!);
  userDocCache.set(uid, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

/**
 * Get the currently authenticated user.
 * Prefers the signed profile cookie (no Firestore read). Falls back to
 * users/{uid} only when the profile is missing or expired.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  const session = await verifySession(sessionCookie);
  if (!session) return null;

  const profile = verifyUserProfileCookie(
    cookieStore.get(PROFILE_COOKIE_NAME)?.value
  );
  if (profile && profile.uid === session.uid) {
    return profile;
  }

  const user = await loadUserFromFirestore(session.uid, session.email);
  if (user) {
    const token = signUserProfileCookie(user);
    if (token) {
      try {
        cookieStore.set(PROFILE_COOKIE_NAME, token, profileCookieOptions());
      } catch {
        // Server Components cannot set cookies; Route Handlers can.
      }
    }
  }
  return user;
});

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
