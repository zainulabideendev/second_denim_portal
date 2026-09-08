import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Country, PoolConfig, ProxyLane } from "@/lib/types";
import {
  COUNTRIES,
  DEFAULT_POOL_CONFIG,
  MAX_POOL_COUNTRIES,
} from "@/lib/types";
import { getBackupLimit, getTotalPoolSlots } from "@/lib/pool-utils";
import { toIso } from "@/lib/utils-server";

const CONFIG_DOC = "settings/poolConfig";

export function getSizePerLaneForCountry(
  country: Country,
  config: PoolConfig
): number {
  return config.byCountry[country]?.sizePerLane ?? config.defaultSizePerLane;
}

export function computePoolLimit(
  poolCountries: Country[],
  config: PoolConfig
): number {
  return poolCountries.reduce(
    (sum, country) =>
      sum + getTotalPoolSlots(getSizePerLaneForCountry(country, config)),
    0
  );
}

export function resolveUserPoolCountries(data: {
  poolCountries?: Country[];
  country?: Country;
}): Country[] {
  if (data.poolCountries?.length) {
    return data.poolCountries.slice(0, MAX_POOL_COUNTRIES);
  }
  if (data.country) return [data.country];
  return ["UK"];
}

export async function getPoolConfig(): Promise<PoolConfig> {
  const db = adminDb();
  const doc = await db.doc(CONFIG_DOC).get();

  if (!doc.exists) {
    return { ...DEFAULT_POOL_CONFIG };
  }

  const d = doc.data()!;
  const byCountry = { ...DEFAULT_POOL_CONFIG.byCountry };
  for (const country of COUNTRIES) {
    const size = d.byCountry?.[country]?.sizePerLane;
    if (typeof size === "number" && size > 0) {
      byCountry[country] = { sizePerLane: size };
    }
  }

  return {
    defaultSizePerLane: d.defaultSizePerLane ?? DEFAULT_POOL_CONFIG.defaultSizePerLane,
    byCountry,
    updatedAt: d.updatedAt ? toIso(d.updatedAt) : undefined,
    updatedBy: d.updatedBy ?? undefined,
  };
}

export async function savePoolConfig(
  config: Pick<PoolConfig, "defaultSizePerLane" | "byCountry">,
  actorUid: string
): Promise<PoolConfig> {
  const db = adminDb();
  const payload = {
    defaultSizePerLane: config.defaultSizePerLane,
    byCountry: config.byCountry,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  };

  await db.doc(CONFIG_DOC).set(payload, { merge: true });
  return getPoolConfig();
}

export function emptyCountryPoolLanes(
  activePoolSize: number,
  backupLimitOverride?: number | null
) {
  const lanes: Record<ProxyLane, never[]> = {
    backup: [],
    active: [],
  };
  const backupLimit = getBackupLimit(activePoolSize, backupLimitOverride);
  const activeLimit = activePoolSize;
  return {
    ...lanes,
    poolSize: 0,
    totalSlots: getTotalPoolSlots(activePoolSize, backupLimit),
    activeLimit,
    backupLimit,
    sizePerLane: activePoolSize,
    canPromote: true,
    activeWorkingCount: 0,
    restrictedCount: 0,
    restrictedLimit: activePoolSize,
    canRestrict: true,
  };
}
