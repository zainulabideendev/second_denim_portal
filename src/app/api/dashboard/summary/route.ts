import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import type { Country, CountryStats } from "@/lib/types";
import { differenceInDays } from "date-fns";
import {
  countByStatuses,
  getDocsByStatuses,
} from "@/lib/firestore-reads";

const COUNTRIES: Country[] = ["FR", "BE", "UK", "DE"];
const EXPIRY_WARN_DAYS = 7;

function countryStatsFromDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  availableStatuses: string[],
  assignedStatuses: string[],
  flaggedStatuses: string[]
): CountryStats[] {
  return COUNTRIES.map((country) => {
    const countryDocs = docs.filter((d) => d.data().country === country);
    const available = countryDocs.filter((d) =>
      availableStatuses.includes(d.data().status)
    ).length;
    const assigned = countryDocs.filter((d) =>
      assignedStatuses.includes(d.data().status)
    ).length;
    const expired = countryDocs.filter((d) => d.data().status === "expired").length;
    const flagged = countryDocs.filter((d) =>
      flaggedStatuses.includes(d.data().status)
    ).length;
    return {
      country,
      available,
      assigned,
      expired,
      flagged,
      total: available + assigned + expired + flagged,
    };
  });
}

export async function GET() {
  try {
    const actor = await requireAuth();
    const db = adminDb();
    const now = new Date();

    if (actor.role === "salesman") {
      const [proxySnap, phoneSnap, reqSnap] = await Promise.all([
        db.collection("proxies").where("assignedTo", "==", actor.uid).get(),
        db.collection("phoneNumbers").where("assignedTo", "==", actor.uid).get(),
        db
          .collection("requests")
          .where("requestedBy", "==", actor.uid)
          .limit(50)
          .get(),
      ]);

      const activeProxyDocs = proxySnap.docs.filter((d) =>
        ["assigned", "flagged"].includes(d.data().status)
      );
      const activePhoneDocs = phoneSnap.docs.filter((d) =>
        ["active", "banned", "banned_with_balance", "assigned", "flagged"].includes(
          d.data().status
        )
      );
      const pendingReqCount = reqSnap.docs.filter(
        (d) => d.data().status === "pending"
      ).length;

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
          myPendingRequests: pendingReqCount,
          myExpiringSoon: expiringSoon.length,
          proxyStats: [],
          phoneStats: [],
          pendingRequests: 0,
          expiringSoon,
        },
      });
    }

    const [
      proxyDocs,
      phoneDocs,
      pendingRequests,
    ] = await Promise.all([
      getDocsByStatuses(
        db,
        "proxies",
        ["fresh", "available", "assigned", "flagged", "expired"],
        400
      ),
      getDocsByStatuses(
        db,
        "phoneNumbers",
        [
          "available",
          "active",
          "assigned",
          "expired",
          "flagged",
          "banned",
          "banned_with_balance",
        ],
        300
      ),
      countByStatuses(db, "requests", ["pending"]),
    ]);

    const proxyStats = countryStatsFromDocs(
      proxyDocs,
      ["fresh", "available"],
      ["active", "assigned"],
      ["banned", "banned_with_balance", "flagged"]
    );
    const phoneStats = countryStatsFromDocs(
      phoneDocs,
      ["available"],
      ["active", "assigned"],
      ["banned", "banned_with_balance", "flagged"]
    );

    const soonDate = new Date(
      now.getTime() + EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000
    );
    const expiringSoon = [
      ...proxyDocs
        .filter((d) => {
          const s = d.data().status;
          if (s !== "assigned" && s !== "available" && s !== "fresh") return false;
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
      ...phoneDocs
        .filter((d) => {
          const s = d.data().status;
          if (s !== "assigned" && s !== "available" && s !== "active") return false;
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
        pendingRequests,
        expiringSoon,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
