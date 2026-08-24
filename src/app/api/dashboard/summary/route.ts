import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import type { Country, CountryStats } from "@/lib/types";
import { differenceInDays } from "date-fns";

const COUNTRIES: Country[] = ["FR", "BE", "UK", "DE"];
const EXPIRY_WARN_DAYS = 7;

export async function GET() {
  try {
    const actor = await requireAuth();
    const db = adminDb();
    const now = new Date();

    if (actor.role === "salesman") {
      // Single where clause per query — no composite indexes needed, filter in JS
      const [proxySnap, phoneSnap, reqSnap] = await Promise.all([
        db.collection("proxies").where("assignedTo", "==", actor.uid).get(),
        db.collection("phoneNumbers").where("assignedTo", "==", actor.uid).get(),
        db.collection("requests").where("requestedBy", "==", actor.uid).get(),
      ]);

      // Filter in JS
      const activeProxyDocs = proxySnap.docs.filter((d) =>
        ["assigned", "flagged"].includes(d.data().status)
      );
      const activePhoneDocs = phoneSnap.docs.filter((d) =>
        ["active", "banned", "banned_with_balance", "assigned", "flagged"].includes(d.data().status)
      );
      const pendingReqDocs = reqSnap.docs.filter(
        (d) => d.data().status === "pending"
      );

      const allItems = [
        ...activeProxyDocs.map((d) => ({
          id: d.id,
          type: "proxy" as const,
          country: d.data().country as Country,
          expiresAt: toIso(d.data().expiresAt),
          assignedTo: d.data().assignedTo,
          daysLeft: differenceInDays(new Date(toIso(d.data().expiresAt)), now),
        })),
        ...activePhoneDocs.map((d) => ({
          id: d.id,
          type: "phone" as const,
          country: d.data().country as Country,
          expiresAt: toIso(d.data().expiresAt),
          assignedTo: d.data().assignedTo,
          daysLeft: differenceInDays(new Date(toIso(d.data().expiresAt)), now),
        })),
      ];

      const expiringSoon = allItems
        .filter((i) => i.daysLeft <= EXPIRY_WARN_DAYS)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      return NextResponse.json({
        success: true,
        data: {
          role: actor.role,
          myActiveProxies: activeProxyDocs.length,
          myActivePhones: activePhoneDocs.length,
          myPendingRequests: pendingReqDocs.length,
          myExpiringSoon: expiringSoon.length,
          proxyStats: [],
          phoneStats: [],
          pendingRequests: 0,
          expiringSoon,
        },
      });
    }

    // Manager/Admin: full inventory — fetch all, filter retired in JS
    const [proxySnap, phoneSnap, pendingReqSnap] = await Promise.all([
      db.collection("proxies").limit(1000).get(),
      db.collection("phoneNumbers").limit(1000).get(),
      db.collection("requests").limit(500).get(),
    ]);

    const activeProxyDocs = proxySnap.docs.filter((d) => d.data().status !== "retired");
    const activePhoneDocs = phoneSnap.docs.filter((d) => d.data().status !== "retired");
    const pendingReqCount = pendingReqSnap.docs.filter((d) => d.data().status === "pending").length;

    // Aggregate by country
    const proxyStats: CountryStats[] = COUNTRIES.map((country) => {
      const docs = activeProxyDocs.filter((d) => d.data().country === country);
      return {
        country,
        available: docs.filter((d) => {
          const s = d.data().status;
          return s === "fresh" || s === "available";
        }).length,
        assigned: docs.filter((d) => {
          const s = d.data().status;
          return s === "active" || s === "assigned";
        }).length,
        expired: docs.filter((d) => d.data().status === "expired").length,
        flagged: docs.filter((d) => {
          const s = d.data().status;
          return s === "banned" || s === "banned_with_balance" || s === "flagged";
        }).length,
        total: docs.length,
      };
    });

    const phoneStats: CountryStats[] = COUNTRIES.map((country) => {
      const docs = activePhoneDocs.filter((d) => d.data().country === country);
      return {
        country,
        available: docs.filter((d) => d.data().status === "available").length,
        assigned: docs.filter((d) => {
          const s = d.data().status;
          return s === "active" || s === "assigned";
        }).length,
        expired: docs.filter((d) => d.data().status === "expired").length,
        flagged: docs.filter((d) => {
          const s = d.data().status;
          return s === "banned" || s === "banned_with_balance" || s === "flagged";
        }).length,
        total: docs.length,
      };
    });

    // Expiring-soon items (within 7 days)
    const soonDate = new Date(now.getTime() + EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000);
    const expiringSoon = [
      ...activeProxyDocs
        .filter((d) => {
          const s = d.data().status;
          if (s !== "assigned" && s !== "available") return false;
          const exp = d.data().expiresAt?.toDate?.() ?? new Date(d.data().expiresAt);
          return exp <= soonDate;
        })
        .map((d) => ({
          id: d.id,
          type: "proxy" as const,
          country: d.data().country as Country,
          expiresAt: toIso(d.data().expiresAt),
          assignedTo: d.data().assignedTo ?? null,
          daysLeft: differenceInDays(new Date(toIso(d.data().expiresAt)), now),
        })),
      ...activePhoneDocs
        .filter((d) => {
          const s = d.data().status;
          if (s !== "assigned" && s !== "available") return false;
          const exp = d.data().expiresAt?.toDate?.() ?? new Date(d.data().expiresAt);
          return exp <= soonDate;
        })
        .map((d) => ({
          id: d.id,
          type: "phone" as const,
          country: d.data().country as Country,
          expiresAt: toIso(d.data().expiresAt),
          assignedTo: d.data().assignedTo ?? null,
          daysLeft: differenceInDays(new Date(toIso(d.data().expiresAt)), now),
        })),
    ].sort((a, b) => a.daysLeft - b.daysLeft);

    return NextResponse.json({
      success: true,
      data: {
        role: actor.role,
        proxyStats,
        phoneStats,
        pendingRequests: pendingReqCount,
        expiringSoon,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
