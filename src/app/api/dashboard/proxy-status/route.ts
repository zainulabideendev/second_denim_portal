import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import { normalizeLane } from "@/lib/pool-utils";
import type { Country } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import { getDocsByStatuses } from "@/lib/firestore-reads";

export interface CountryProxyBreakdown {
  country: Country;
  label: string;
  active: number;
  backup: number;
  restricted: number;
  banned: number;
  expired: number;
  total: number;
}

export interface UserProxyStatusRow {
  uid: string;
  name: string;
  email: string;
  status: string;
  activeProxyLimit: number;
  /** Assigned + active lane, not restricted */
  active: number;
  /** Assigned + backup lane */
  backup: number;
  /** Assigned + active + restricted */
  restricted: number;
  /** Flagged / banned */
  banned: number;
  /** Expired while still linked to user */
  expired: number;
  /** All proxies currently linked to this user in the filter */
  total: number;
  byCountry: CountryProxyBreakdown[];
}

export interface ProxyStatusTotals {
  active: number;
  backup: number;
  restricted: number;
  banned: number;
  expired: number;
  total: number;
  salesmen: number;
}

function parseDayStart(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assignedAtMs(data: FirebaseFirestore.DocumentData): number | null {
  const raw = data.assignedAt;
  if (!raw) return null;
  if (typeof raw?.toDate === "function") return raw.toDate().getTime();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function classifyProxy(data: FirebaseFirestore.DocumentData): {
  active: number;
  backup: number;
  restricted: number;
  banned: number;
  expired: number;
} {
  const status = data.status as string;
  if (status === "flagged") {
    return { active: 0, backup: 0, restricted: 0, banned: 1, expired: 0 };
  }
  if (status === "expired") {
    return { active: 0, backup: 0, restricted: 0, banned: 0, expired: 1 };
  }
  if (status === "assigned") {
    const lane = normalizeLane(data.lane);
    if (lane === "active") {
      if (data.restricted) {
        return { active: 0, backup: 0, restricted: 1, banned: 0, expired: 0 };
      }
      return { active: 1, backup: 0, restricted: 0, banned: 0, expired: 0 };
    }
    return { active: 0, backup: 1, restricted: 0, banned: 0, expired: 0 };
  }
  return { active: 0, backup: 0, restricted: 0, banned: 0, expired: 0 };
}

/**
 * Admin/manager: per-salesman proxy status with optional assignedAt date range.
 * GET /api/dashboard/proxy-status?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);
    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const from = parseDayStart(searchParams.get("from"));
    const to = parseDayEnd(searchParams.get("to"));

    const [usersSnap, proxyDocs] = await Promise.all([
      db.collection("users").where("role", "==", "salesman").limit(150).get(),
      getDocsByStatuses(db, "proxies", ["assigned", "flagged", "expired"], 500),
    ]);

    const salesmen = usersSnap.docs;

    const rows: UserProxyStatusRow[] = salesmen.map((userDoc) => {
      const u = userDoc.data();
      const uid = userDoc.id;

      const userProxies = proxyDocs.filter((p) => {
        const data = p.data();
        if (data.assignedTo !== uid) return false;

        if (from || to) {
          const ts = assignedAtMs(data);
          if (ts == null) return false;
          if (from && ts < from.getTime()) return false;
          if (to && ts > to.getTime()) return false;
        }
        return true;
      });

      let active = 0;
      let backup = 0;
      let restricted = 0;
      let banned = 0;
      let expired = 0;

      const countryMap = new Map<
        Country,
        { active: number; backup: number; restricted: number; banned: number; expired: number }
      >();

      for (const c of COUNTRIES) {
        countryMap.set(c, {
          active: 0,
          backup: 0,
          restricted: 0,
          banned: 0,
          expired: 0,
        });
      }

      for (const p of userProxies) {
        const data = p.data();
        const cls = classifyProxy(data);
        active += cls.active;
        backup += cls.backup;
        restricted += cls.restricted;
        banned += cls.banned;
        expired += cls.expired;

        const country = data.country as Country;
        if (COUNTRIES.includes(country)) {
          const bucket = countryMap.get(country)!;
          bucket.active += cls.active;
          bucket.backup += cls.backup;
          bucket.restricted += cls.restricted;
          bucket.banned += cls.banned;
          bucket.expired += cls.expired;
        }
      }

      const byCountry: CountryProxyBreakdown[] = COUNTRIES.map((country) => {
        const b = countryMap.get(country)!;
        return {
          country,
          label: COUNTRY_LABELS[country],
          ...b,
          total: b.active + b.backup + b.restricted + b.banned + b.expired,
        };
      }).filter((c) => c.total > 0);

      return {
        uid,
        name: u.name ?? "",
        email: u.email ?? "",
        status: u.status ?? "active",
        activeProxyLimit: u.activeProxyLimit ?? 4,
        active,
        backup,
        restricted,
        banned,
        expired,
        total: active + backup + restricted + banned + expired,
        byCountry,
      };
    });

    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const totals: ProxyStatusTotals = rows.reduce(
      (acc, r) => {
        acc.active += r.active;
        acc.backup += r.backup;
        acc.restricted += r.restricted;
        acc.banned += r.banned;
        acc.expired += r.expired;
        acc.total += r.total;
        return acc;
      },
      {
        active: 0,
        backup: 0,
        restricted: 0,
        banned: 0,
        expired: 0,
        total: 0,
        salesmen: rows.length,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        rows,
        totals,
        filters: {
          from: from ? toIso(from).slice(0, 10) : null,
          to: to ? toIso(to).slice(0, 10) : null,
        },
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
