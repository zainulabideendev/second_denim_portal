import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  COUNTRIES,
  COUNTRY_LABELS,
  type Country,
  type ProxyLane,
} from "@/lib/types";
import {
  getPoolConfig,
  getSizePerLaneForCountry,
  resolveUserPoolCountries,
} from "@/lib/pool-config";
import { getTotalPoolSlots, normalizeLane } from "@/lib/pool-utils";

export async function GET() {
  try {
    await requireAuth(["admin"]);

    const [config, { data: salesmen }, { data: proxies }] = await Promise.all([
      getPoolConfig(),
      supabaseAdmin()
        .from("profiles")
        .select("*")
        .eq("role", "salesman")
        .limit(150),
      supabaseAdmin()
        .from("proxies")
        .select("id, country, status, assigned_to, lane")
        .in("status", ["assigned", "fresh", "available"])
        .limit(1200),
    ]);

    const stockByCountry = Object.fromEntries(
      COUNTRIES.map((c) => [c, 0])
    ) as Record<Country, number>;

    (proxies ?? []).forEach((d) => {
      const country = d.country as Country;
      if (
        COUNTRIES.includes(country) &&
        (d.status === "fresh" || d.status === "available")
      ) {
        stockByCountry[country]++;
      }
    });

    const users = (salesmen ?? []).map((doc) => {
      const poolCountries = resolveUserPoolCountries({
        poolCountries: doc.pool_countries,
        country: doc.country ?? undefined,
      });
      const pools: Record<
        Country,
        {
          filled: number;
          total: number;
          byLane: Record<ProxyLane, number>;
        }
      > = {} as Record<
        Country,
        { filled: number; total: number; byLane: Record<ProxyLane, number> }
      >;

      for (const country of poolCountries) {
        const activePoolSize = getSizePerLaneForCountry(country, config);
        const byLane: Record<ProxyLane, number> = {
          backup: 0,
          active: 0,
        };

        (proxies ?? [])
          .filter(
            (p) =>
              p.assigned_to === doc.id &&
              p.status === "assigned" &&
              p.country === country
          )
          .forEach((p) => {
            const lane = normalizeLane(p.lane);
            byLane[lane]++;
          });

        const filled = byLane.backup + byLane.active;
        pools[country] = {
          filled,
          total: getTotalPoolSlots(activePoolSize),
          byLane,
        };
      }

      return {
        uid: doc.id,
        name: doc.name,
        email: doc.email,
        status: doc.status,
        poolCountries,
        pools,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        config,
        countryLabels: COUNTRY_LABELS,
        stockByCountry,
        users,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
