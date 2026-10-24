import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import type { Country, CountryStats } from "@/lib/types";
import { differenceInDays } from "date-fns";

const COUNTRIES: Country[] = ["FR", "BE", "UK", "DE"];
const EXPIRY_WARN_DAYS = 7;

type RowWithCountry = {
  id: string;
  country: string;
  status: string;
  expires_at?: string | null;
  assigned_to?: string | null;
};

function countryStatsFromRows(
  rows: RowWithCountry[],
  availableStatuses: string[],
  assignedStatuses: string[],
  flaggedStatuses: string[]
): CountryStats[] {
  return COUNTRIES.map((country) => {
    const countryDocs = rows.filter((d) => d.country === country);
    const available = countryDocs.filter((d) =>
      availableStatuses.includes(d.status)
    ).length;
    const assigned = countryDocs.filter((d) =>
      assignedStatuses.includes(d.status)
    ).length;
    const expired = countryDocs.filter((d) => d.status === "expired").length;
    const flagged = countryDocs.filter((d) =>
      flaggedStatuses.includes(d.status)
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
    const now = new Date();

    if (actor.role === "salesman") {
      const [proxyRes, phoneRes, reqRes] = await Promise.all([
        supabaseAdmin()
          .from("proxies")
          .select("*")
          .eq("assigned_to", actor.uid),
        supabaseAdmin()
          .from("phone_numbers")
          .select("*")
          .eq("assigned_to", actor.uid),
        supabaseAdmin()
          .from("requests")
          .select("id, status")
          .eq("requested_by", actor.uid)
          .limit(50),
      ]);

      const proxyDocs = proxyRes.data ?? [];
      const phoneDocs = phoneRes.data ?? [];
      const reqDocs = reqRes.data ?? [];

      const activeProxyDocs = proxyDocs.filter((d) =>
        ["assigned", "flagged"].includes(d.status)
      );
      const activePhoneDocs = phoneDocs.filter((d) =>
        [
          "active",
          "banned",
          "banned_with_balance",
          "assigned",
          "flagged",
        ].includes(d.status)
      );
      const pendingReqCount = reqDocs.filter((d) => d.status === "pending")
        .length;

      const allItems = [
        ...activeProxyDocs.map((d) => ({
          id: d.id,
          type: "proxy" as const,
          country: d.country as Country,
          expiresAt: toIso(d.expires_at),
          assignedTo: d.assigned_to,
          daysLeft: differenceInDays(new Date(toIso(d.expires_at)), now),
        })),
        ...activePhoneDocs.map((d) => ({
          id: d.id,
          type: "phone" as const,
          country: d.country as Country,
          expiresAt: toIso(d.expires_at),
          assignedTo: d.assigned_to,
          daysLeft: differenceInDays(new Date(toIso(d.expires_at)), now),
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

    const [proxyRes, phoneRes, pendingRes] = await Promise.all([
      supabaseAdmin()
        .from("proxies")
        .select("id, country, status, expires_at, assigned_to")
        .in("status", ["fresh", "available", "assigned", "flagged", "expired"])
        .limit(2000),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id, country, status, expires_at, assigned_to")
        .in("status", [
          "available",
          "active",
          "assigned",
          "expired",
          "flagged",
          "banned",
          "banned_with_balance",
        ])
        .limit(1500),
      supabaseAdmin()
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    const proxyDocs = proxyRes.data ?? [];
    const phoneDocs = phoneRes.data ?? [];
    const pendingRequests = pendingRes.count ?? 0;

    const proxyStats = countryStatsFromRows(
      proxyDocs,
      ["fresh", "available"],
      ["active", "assigned"],
      ["banned", "banned_with_balance", "flagged"]
    );
    const phoneStats = countryStatsFromRows(
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
          if (
            d.status !== "assigned" &&
            d.status !== "available" &&
            d.status !== "fresh"
          )
            return false;
          const exp = new Date(d.expires_at);
          return exp <= soonDate;
        })
        .map((d) => ({
          id: d.id,
          type: "proxy" as const,
          country: d.country as Country,
          expiresAt: toIso(d.expires_at),
          assignedTo: d.assigned_to ?? null,
          daysLeft: differenceInDays(new Date(toIso(d.expires_at)), now),
        })),
      ...phoneDocs
        .filter((d) => {
          if (
            d.status !== "assigned" &&
            d.status !== "available" &&
            d.status !== "active"
          )
            return false;
          const exp = new Date(d.expires_at);
          return exp <= soonDate;
        })
        .map((d) => ({
          id: d.id,
          type: "phone" as const,
          country: d.country as Country,
          expiresAt: toIso(d.expires_at),
          assignedTo: d.assigned_to ?? null,
          daysLeft: differenceInDays(new Date(toIso(d.expires_at)), now),
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
