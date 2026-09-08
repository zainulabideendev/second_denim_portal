import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Country, UserCountryPool, UserCountryPoolRow } from "@/lib/types";
import { type ProxyLane } from "@/lib/types";
import {
  getBackupLimit,
  getTotalPoolSlots,
  normalizeLane,
} from "@/lib/pool-utils";
import { toIso } from "@/lib/utils-server";

const COLLECTION = "userPools";

function mapDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): UserCountryPool {
  const d = doc.data();
  return {
    id: doc.id,
    userId: d.userId,
    userName: d.userName,
    userEmail: d.userEmail,
    country: d.country,
    sizePerLane: d.sizePerLane,
    backupLimit:
      d.backupLimit != null ? Number(d.backupLimit) : getBackupLimit(d.sizePerLane),
    createdAt: toIso(d.createdAt),
    createdBy: d.createdBy,
  };
}

export async function getUserPoolAssignments(
  userId: string
): Promise<UserCountryPool[]> {
  const db = adminDb();
  const snap = await db.collection(COLLECTION).where("userId", "==", userId).get();
  return snap.docs.map(mapDoc).sort((a, b) => a.country.localeCompare(b.country));
}

export async function getAllUserPoolAssignments(): Promise<UserCountryPool[]> {
  const db = adminDb();
  const snap = await db.collection(COLLECTION).limit(500).get();
  return snap.docs
    .map(mapDoc)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function syncUserPoolMeta(userId: string): Promise<void> {
  const assignments = await getUserPoolAssignments(userId);
  const poolCountries = assignments.map((a) => a.country);
  const activeProxyLimit = assignments.reduce(
    (sum, a) => sum + getTotalPoolSlots(a.sizePerLane, a.backupLimit),
    0
  );

  await adminDb()
    .collection("users")
    .doc(userId)
    .update({
      poolCountries,
      activeProxyLimit: activeProxyLimit || 0,
    });
}

export async function enrichPoolRows(
  assignments: UserCountryPool[]
): Promise<UserCountryPoolRow[]> {
  if (!assignments.length) return [];

  const db = adminDb();
  const userIds = [...new Set(assignments.map((a) => a.userId))];
  const proxySnaps = await Promise.all(
    userIds.map((uid) =>
      db.collection("proxies").where("assignedTo", "==", uid).get()
    )
  );

  const proxiesByUser = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  userIds.forEach((uid, i) => {
    proxiesByUser.set(uid, proxySnaps[i].docs);
  });

  return assignments.map((assignment) => {
    const docs =
      proxiesByUser.get(assignment.userId)?.filter(
        (d) =>
          d.data().status === "assigned" &&
          d.data().country === assignment.country
      ) ?? [];

    const byLane: Record<ProxyLane, number> = {
      backup: 0,
      active: 0,
    };
    docs.forEach((d) => {
      const lane = normalizeLane(d.data().lane);
      byLane[lane]++;
    });

    const filled = byLane.backup + byLane.active;
    const total = getTotalPoolSlots(assignment.sizePerLane, assignment.backupLimit);

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
  const db = adminDb();

  const conflicts: string[] = [];
  const existingByUser = new Map<string, Set<Country>>();

  for (const userId of userIds) {
    const snap = await db.collection(COLLECTION).where("userId", "==", userId).get();
    existingByUser.set(
      userId,
      new Set(snap.docs.map((d) => d.data().country as Country))
    );
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
        conflicts.push(
          `${user.name} already has a ${country} pool`
        );
      }
    }
  }

  if (conflicts.length) {
    throw new Error(conflicts.join(". "));
  }

  const now = FieldValue.serverTimestamp();
  let created = 0;

  for (const userId of userIds) {
    const user = usersById.get(userId)!;

    for (const { country, sizePerLane, backupLimit } of countrySizes) {
      const ref = db.collection(COLLECTION).doc();
      await ref.set({
        userId,
        userName: user.name,
        userEmail: user.email,
        country,
        sizePerLane,
        backupLimit,
        createdAt: now,
        createdBy: actorUid,
      });
      created++;
    }

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
