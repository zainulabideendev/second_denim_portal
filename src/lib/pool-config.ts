import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Json } from "@/lib/database.types";
import type { Country, PoolConfig, ProxyLane } from "@/lib/types";
import {
  COUNTRIES,
  DEFAULT_POOL_CONFIG,
  MAX_POOL_COUNTRIES,
} from "@/lib/types";
import { getBackupLimit, getTotalPoolSlots } from "@/lib/pool-utils";

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
  const { data } = await supabaseAdmin()
    .from("pool_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (!data) {
    return { ...DEFAULT_POOL_CONFIG };
  }

  const rawByCountry =
    data.by_country && typeof data.by_country === "object"
      ? (data.by_country as Record<string, { sizePerLane?: number }>)
      : {};

  const byCountry = { ...DEFAULT_POOL_CONFIG.byCountry };
  for (const country of COUNTRIES) {
    const size = rawByCountry[country]?.sizePerLane;
    if (typeof size === "number" && size > 0) {
      byCountry[country] = { sizePerLane: size };
    }
  }

  return {
    defaultSizePerLane:
      data.default_size_per_lane ?? DEFAULT_POOL_CONFIG.defaultSizePerLane,
    byCountry,
    updatedAt: data.updated_at ?? undefined,
    updatedBy: data.updated_by ?? undefined,
  };
}

export async function savePoolConfig(
  config: Pick<PoolConfig, "defaultSizePerLane" | "byCountry">,
  actorUid: string
): Promise<PoolConfig> {
  const { error } = await supabaseAdmin().from("pool_config").upsert({
    id: "default",
    default_size_per_lane: config.defaultSizePerLane,
    by_country: config.byCountry as unknown as Json,
    updated_at: new Date().toISOString(),
    updated_by: actorUid,
  });

  if (error) throw new Error(error.message);
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
