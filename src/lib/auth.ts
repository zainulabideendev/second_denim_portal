import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapProfile } from "@/lib/mappers";
import type { AppUser, Role } from "@/lib/types";

const USER_CACHE_TTL_MS = 60_000;
const userDocCache = new Map<string, { user: AppUser; expiresAt: number }>();

export function invalidateUserCache(uid?: string) {
  if (uid) userDocCache.delete(uid);
  else userDocCache.clear();
}

async function loadProfile(uid: string, fallbackEmail = ""): Promise<AppUser | null> {
  const cached = userDocCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error || !data) {
    userDocCache.delete(uid);
    return null;
  }

  const user = mapProfile({
    ...data,
    email: data.email || fallbackEmail,
  });
  userDocCache.set(uid, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

/**
 * Authenticated app user from Supabase session + profiles table.
 * Deduped per React request via cache().
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const uid = String(data.claims.sub);
  const email =
    typeof data.claims.email === "string" ? data.claims.email : "";

  return loadProfile(uid, email);
});

export async function requireAuth(allowedRoles?: Role[]): Promise<AppUser> {
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

export function handleAuthError(err: unknown): Response {
  if (err instanceof AuthError) {
    return Response.json(
      { success: false, error: err.message },
      { status: err.statusCode }
    );
  }
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";
  console.error("[API error]", err);
  return Response.json(
    { success: false, error: message },
    { status: 500 }
  );
}
