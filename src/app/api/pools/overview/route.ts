import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
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
import {
  getTotalPoolSlots,
  normalizeLane,
} from "@/lib/pool-utils";

export async function GET() {
  try {
    await requireAuth(["admin"]);

    const db = adminDb();
    const [config, usersSnap, proxiesSnap] = await Promise.all([
      getPoolConfig(),
      db.collection("users").where("role", "==", "salesman").get(),
      db.collection("proxies").limit(500).get(),
    ]);

    const stockByCountry = Object.fromEntries(
      COUNTRIES.map((c) => [c, 0])
    ) as Record<Country, number>;

    proxiesSnap.docs.forEach((d) => {
      const data = d.data();
      const country = data.country as Country;
      const status = data.status;
      if (
        COUNTRIES.includes(country) &&
        (status === "fresh" || status === "available")
      ) {
        stockByCountry[country]++;
      }
    });

    const users = usersSnap.docs.map((doc) => {
      const data = doc.data();
      const poolCountries = resolveUserPoolCountries(data);
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

        proxiesSnap.docs
          .filter(
            (p) =>
              p.data().assignedTo === doc.id &&
              p.data().status === "assigned" &&
              p.data().country === country
          )
          .forEach((p) => {
            const lane = normalizeLane(p.data().lane);
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
        name: data.name,
        email: data.email,
        status: data.status,
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
