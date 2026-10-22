import { createHmac, timingSafeEqual } from "crypto";
import type { AppUser, Country, Role } from "@/lib/types";

export const PROFILE_COOKIE_NAME = "sc_profile";
/** Skip users/{uid} reads; refreshed on the next authenticated API call. */
export const PROFILE_COOKIE_MAX_AGE_SEC = 2 * 60 * 60;

type ProfilePayload = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  country?: Country;
  poolCountries?: Country[];
  activeProxyLimit: number;
  status: AppUser["status"];
  createdAt: string;
  exp: number;
};

function secret(): string | null {
  const value = process.env.AUTH_COOKIE_SECRET?.trim();
  return value ? value : null;
}

function sign(payloadB64: string, key: string): string {
  return createHmac("sha256", key).update(payloadB64).digest("base64url");
}

function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function profileCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: PROFILE_COOKIE_MAX_AGE_SEC,
    path: "/",
  };
}

export function signUserProfileCookie(user: AppUser): string | null {
  const key = secret();
  if (!key) return null;

  const payload: ProfilePayload = {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: user.role,
    country: user.country,
    poolCountries: user.poolCountries,
    activeProxyLimit: user.activeProxyLimit,
    status: user.status,
    createdAt: user.createdAt,
    exp: Date.now() + PROFILE_COOKIE_MAX_AGE_SEC * 1000,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${payloadB64}.${sign(payloadB64, key)}`;
}

export function verifyUserProfileCookie(token: string | undefined): AppUser | null {
  if (!token) return null;
  const key = secret();
  if (!key) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payloadB64 || !sig) return null;

  if (!signaturesMatch(sign(payloadB64, key), sig)) return null;

  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(json) as ProfilePayload;
    if (!payload?.uid || !payload.exp || payload.exp < Date.now()) return null;
    if (payload.status !== "active" && payload.status !== "disabled") return null;
    if (!["admin", "manager", "salesman"].includes(payload.role)) return null;

    return {
      uid: payload.uid,
      name: payload.name ?? "",
      email: payload.email ?? "",
      role: payload.role,
      country: payload.country,
      poolCountries: payload.poolCountries,
      activeProxyLimit: payload.activeProxyLimit ?? 4,
      status: payload.status,
      createdAt: payload.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
