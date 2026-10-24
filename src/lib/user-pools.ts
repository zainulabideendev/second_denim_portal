import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Country, UserCountryPool, UserCountryPoolRow } from "@/lib/types";
import { type ProxyLane } from "@/lib/types";
import {
  getBackupLimit,
  getTotalPoolSlots,
  normalizeLane,
} from "@/lib/pool-utils";
import { invalidateUserCache } from "@/lib/auth";

function mapRow(row: {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  country: Country;
  size_per_lane: number;
  backup_limit: number | null;
  created_at: string;
  created_by: string | null;
}): UserCountryPool {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    country: row.country,
    sizePerLane: row.size_per_lane,
    backupLimit:
      row.backup_limit != null
        ? Number(row.backup_limit)
        : getBackupLimit(row.size_per_lane),
    createdAt: row.created_at,
    createdBy: row.created_by ?? "",
  };
}

export async function getUserPoolAssignments(
  userId: string
): Promise<UserCountryPool[]> {
  const { data, error } = await supabaseAdmin()
    .from("user_pools")
    .select("*")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data
    .map(mapRow)
    .sort((a, b) => a.country.localeCompare(b.country));
}

export async function getAllUserPoolAssignments(): Promise<UserCountryPool[]> {
  const { data, error } = await supabaseAdmin()
    .from("user_pools")
    .select("*")
    .limit(500);

  if (error || !data) return [];
  return data
    .map(mapRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function syncUserPoolMeta(userId: string): Promise<void> {
  const assignments = await getUserPoolAssignments(userId);
  const poolCountries = assignments.map((a) => a.country);
  const activeProxyLimit = assignments.reduce(
    (sum, a) => sum + getTotalPoolSlots(a.sizePerLane, a.backupLimit),
    0
  );

  await supabaseAdmin()
    .from("profiles")
    .update({
      pool_countries: poolCountries,
      active_proxy_limit: activeProxyLimit || 0,
    })
    .eq("id", userId);

  invalidateUserCache(userId);
}

export async function enrichPoolRows(
  assignments: UserCountryPool[]
): Promise<UserCountryPoolRow[]> {
  if (!assignments.length) return [];

  const userIds = new Set(assignments.map((a) => a.userId));
  const { data: assigned } = await supabaseAdmin()
    .from("proxies")
    .select("assigned_to, country, lane, status")
    .eq("status", "assigned")
    .limit(500);

  const proxiesByUser = new Map<
    string,
    Array<{ country: string; lane: string | null }>
  >();

  (assigned ?? []).forEach((doc) => {
    const uid = doc.assigned_to;
    if (!uid || !userIds.has(uid)) return;
    const list = proxiesByUser.get(uid) ?? [];
    list.push({ country: doc.country, lane: doc.lane });
    proxiesByUser.set(uid, list);
  });

  return assignments.map((assignment) => {
    const docs =
      proxiesByUser
        .get(assignment.userId)
        ?.filter((d) => d.country === assignment.country) ?? [];

    const byLane: Record<ProxyLane, number> = { backup: 0, active: 0 };
    docs.forEach((d) => {
      const lane = normalizeLane(d.lane);
      byLane[lane]++;
    });

    const filled = byLane.backup + byLane.active;
    const total = getTotalPoolSlots(
      assignment.sizePerLane,
      assignment.backupLimit
    );

    return { ...assignment, filled, total, byLane };
  });
}

export interface CreatePoolsInput {
  userIds: string[];
  countrySizes: Array<{
    country: Country;
    sizePerLane: number;
    backupLimit: number;
  }>;
  actorUid: string;
  usersById: Map<string, { name: string; email: string; role: string }>;
}

export async function createUserCountryPools(
  input: CreatePoolsInput
): Promise<{ created: number }> {
  const { userIds, countrySizes, actorUid, usersById } = input;
  const conflicts: string[] = [];
  const existingByUser = new Map<string, Set<Country>>();

  for (const userId of userIds) {
    const existing = await getUserPoolAssignments(userId);
    existingByUser.set(userId, new Set(existing.map((a) => a.country)));
  }

  for (const userId of userIds) {
    const user = usersById.get(userId);
    if (!user || user.role !== "salesman") {
      conflicts.push(`${user?.name ?? userId} is not a salesman`);
      continue;
    }
    const existing = existingByUser.get(userId) ?? new Set();
    for (const { country } of countrySizes) {
      if (existing.has(country)) {
        conflicts.push(`${user.name} already has a ${country} pool`);
      }
    }
  }

  if (conflicts.length) {
    throw new Error(conflicts.join(". "));
  }

  let created = 0;
  const rows = [];

  for (const userId of userIds) {
    const user = usersById.get(userId)!;
    for (const { country, sizePerLane, backupLimit } of countrySizes) {
      rows.push({
        user_id: userId,
        user_name: user.name,
        user_email: user.email,
        country,
        size_per_lane: sizePerLane,
        backup_limit: backupLimit,
        created_by: actorUid,
      });
      created++;
    }
  }

  if (rows.length) {
    const { error } = await supabaseAdmin().from("user_pools").insert(rows);
    if (error) throw new Error(error.message);
  }

  for (const userId of userIds) {
    await syncUserPoolMeta(userId);
  }

  return { created };
}

export function getAssignmentSizePerLane(
  assignments: UserCountryPool[],
  country: Country
): number | null {
  const match = assignments.find((a) => a.country === country);
  return match?.sizePerLane ?? null;
}

export function getAssignmentBackupLimit(
  assignments: UserCountryPool[],
  country: Country
): number | null {
  const match = assignments.find((a) => a.country === country);
  if (!match) return null;
  return getBackupLimit(match.sizePerLane, match.backupLimit);
}
