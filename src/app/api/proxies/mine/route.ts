import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import type { Country, Proxy } from "@/lib/types";
import { POOL_LANES } from "@/lib/types";
import {
  enrichProxiesWithAcnStatus,
  enrichProxiesWithSyncedEmails,
  mapProxyDoc,
} from "@/lib/sync-enrich";
import { emptyCountryPoolLanes } from "@/lib/pool-config";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
  getAssignmentBackupLimit,
} from "@/lib/user-pools";
import {
  canPromoteToActive,
  canRestrictActive,
  getActiveLimit,
  getActivePoolCounts,
  getBackupLimit,
  getRestrictedLimit,
  getTotalPoolSlots,
  normalizeLane,
} from "@/lib/pool-utils";
import type { CountryPoolLanes } from "@/lib/types";

export interface PoolResponse {
  poolCountries: Country[];
  pools: Partial<Record<Country, CountryPoolLanes>>;
  banned: Proxy[];
  poolSize: number;
  totalSlots: number;
}

export async function GET() {
  try {
    const actor = await requireAuth();

    const [assignments, { data, error }] = await Promise.all([
      getUserPoolAssignments(actor.uid),
      supabaseAdmin()
        .from("proxies")
        .select("*")
        .eq("assigned_to", actor.uid),
    ]);

    if (error) throw new Error(error.message);

    const poolCountries = assignments.map((a) => a.country);
    const allProxies = (data ?? []).map(mapProxyDoc);
    const withEmail = await enrichProxiesWithSyncedEmails(allProxies);
    const enriched = await enrichProxiesWithAcnStatus(withEmail);

    const pools: Partial<Record<Country, CountryPoolLanes>> = {};
    for (const country of poolCountries) {
      const activePoolSize = getAssignmentSizePerLane(assignments, country) ?? 3;
      const backupLimit = getAssignmentBackupLimit(assignments, country);
      pools[country] = {
        ...emptyCountryPoolLanes(activePoolSize, backupLimit),
      };
    }

    const banned: Proxy[] = [];

    enriched.forEach((proxy) => {
      if (proxy.status === "flagged") {
        banned.push(proxy);
      } else if (proxy.status === "assigned") {
        const country = proxy.country as Country;
        const lane = normalizeLane(proxy.lane);
        if (!pools[country]) return;
        pools[country]![lane].push(proxy);
      }
    });

    let poolSize = 0;
    let totalSlots = 0;

    for (const country of poolCountries) {
      const pool = pools[country]!;
      const activePoolSize = pool.sizePerLane;
      const backupLimit =
        getAssignmentBackupLimit(assignments, country) ??
        getBackupLimit(activePoolSize);

      for (const lane of POOL_LANES) {
        pool[lane].sort((a, b) => {
          if (a.restricted !== b.restricted) {
            return a.restricted ? 1 : -1;
          }
          return (a.assignedAt ?? "").localeCompare(b.assignedAt ?? "");
        });
      }

      const counts = getActivePoolCounts(pool.active, country);

      pool.backupLimit = backupLimit;
      pool.activeLimit = getActiveLimit(activePoolSize);
      pool.restrictedLimit = getRestrictedLimit(activePoolSize);
      pool.activeWorkingCount = counts.working;
      pool.restrictedCount = counts.restricted;
      pool.canPromote = canPromoteToActive(counts, pool.activeLimit);
      pool.canRestrict = canRestrictActive(counts, pool.activeLimit);
      pool.poolSize = pool.backup.length + pool.active.length;
      pool.totalSlots = getTotalPoolSlots(activePoolSize, backupLimit);

      poolSize += pool.poolSize;
      totalSlots += pool.totalSlots;
    }

    return NextResponse.json({
      success: true,
      data: {
        poolCountries,
        pools,
        banned,
        poolSize,
        totalSlots,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
