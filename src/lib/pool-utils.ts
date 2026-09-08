import type { Country, ProxyLane } from "@/lib/types";

export const BACKUP_MULTIPLIER = 2;
export const POOL_TOTAL_MULTIPLIER = 3;

/**
 * Max proxies in the backup column.
 * Uses explicit backupLimit when set; otherwise falls back to active × 2 (legacy).
 */
export function getBackupLimit(
  activePoolSize: number,
  backupLimit?: number | null
): number {
  if (backupLimit != null && Number.isFinite(backupLimit) && backupLimit >= 0) {
    return Math.floor(backupLimit);
  }
  return activePoolSize * BACKUP_MULTIPLIER;
}

/** Max proxies in the active column (= admin active limit). */
export function getActiveLimit(activePoolSize: number): number {
  return activePoolSize;
}

/** Total proxy slots per country pool (backup + active). */
export function getTotalPoolSlots(
  activePoolSize: number,
  backupLimit?: number | null
): number {
  return getActiveLimit(activePoolSize) + getBackupLimit(activePoolSize, backupLimit);
}

/** Map legacy lane values to the current backup/active model. */
export function normalizeLane(lane?: string): ProxyLane {
  if (lane === "active") return "active";
  return "backup";
}

export interface ActivePoolCounts {
  working: number;
  restricted: number;
  total: number;
}

export function getActivePoolCounts(
  proxies: Array<{ country: Country | string; lane?: string; restricted?: boolean }>,
  country: Country
): ActivePoolCounts {
  const active = proxies.filter(
    (p) => p.country === country && normalizeLane(p.lane) === "active"
  );
  const restricted = active.filter((p) => p.restricted).length;
  return {
    working: active.length - restricted,
    restricted,
    total: active.length,
  };
}

/** Max restricted actives allowed beyond the working pool limit (= pool size). */
export function getRestrictedLimit(activePoolSize: number): number {
  return getActiveLimit(activePoolSize);
}

export function canPromoteToActive(
  counts: ActivePoolCounts,
  activeLimit: number
): boolean {
  return counts.working < activeLimit;
}

export function canRestrictActive(
  counts: ActivePoolCounts,
  activeLimit: number
): boolean {
  return counts.restricted < getRestrictedLimit(activeLimit);
}

/** Allow restoring restricted → working until one above pool size (e.g. 4/3 when pool is 3). */
export function canUnrestrictActive(
  counts: ActivePoolCounts,
  activeLimit: number
): boolean {
  return counts.working < activeLimit + 1;
}
