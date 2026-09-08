import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Country, Proxy, PhoneNumber, ProxyLane } from "@/lib/types";
import { getBackupLimit, normalizeLane } from "@/lib/pool-utils";
import { writeAuditLog } from "@/lib/audit";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
  getAssignmentBackupLimit,
} from "@/lib/user-pools";
import { getPoolConfig } from "@/lib/pool-config";

// ─── FIFO proxy assignment ────────────────────────────────────────────────────

export async function assignAvailableProxy(
  country: Country,
  assignedTo: string,
  actorUid: string,
  lane: ProxyLane = "backup"
): Promise<Proxy | null> {
  const db = adminDb();

  // Single where clause — filter status + sort in JS to avoid composite index
  const snapshot = await db
    .collection("proxies")
    .where("country", "==", country)
    .limit(200)
    .get();

  const available = snapshot.docs
    .filter((d) => {
      const status = d.data().status;
      return status === "fresh" || status === "available";
    })
    .sort((a, b) => {
      const aAt = a.data().purchasedAt?.toDate?.() ?? new Date(a.data().purchasedAt);
      const bAt = b.data().purchasedAt?.toDate?.() ?? new Date(b.data().purchasedAt);
      return aAt.getTime() - bAt.getTime(); // oldest first (FIFO)
    });

  if (available.length === 0) return null;

  const doc = available[0];
  const now = new Date();

  await doc.ref.update({
    status: "assigned",
    assignedTo,
    assignedAt: now,
    lane,
    stagingDone: false,
    accountsCreated: false,
    restricted: false,
  });

  await writeAuditLog({
    actorUid,
    action: "proxy.assigned",
    targetType: "proxy",
    targetId: doc.id,
    metadata: { assignedTo, country, lane },
  });

  return { id: doc.id, ...doc.data(), lane, stagingDone: false, accountsCreated: false, restricted: false } as Proxy;
}

// ─── Pool refill ──────────────────────────────────────────────────────────────
// Only auto-fills backup slots from the global pool. Active is manual (promote button).

export async function autoRefillUserPoolForCountry(
  uid: string,
  country: Country,
  actorUid: string,
  activePoolSize: number,
  backupLimitOverride?: number | null
): Promise<number> {
  const db = adminDb();
  let filled = 0;

  const backupLimit = getBackupLimit(activePoolSize, backupLimitOverride);

  const poolSnap = await db
    .collection("proxies")
    .where("assignedTo", "==", uid)
    .where("status", "==", "assigned")
    .get();

  let backupCount = 0;
  poolSnap.docs
    .filter((d) => d.data().country === country)
    .forEach((d) => {
      if (normalizeLane(d.data().lane) === "backup") backupCount++;
    });

  while (backupCount < backupLimit) {
    const proxy = await assignAvailableProxy(country, uid, actorUid, "backup");
    if (!proxy) break;
    backupCount++;
    filled++;
  }

  return filled;
}

/** Refill all configured country pools for a user. */
export async function autoRefillUserPools(
  uid: string,
  actorUid: string
): Promise<number> {
  const assignments = await getUserPoolAssignments(uid);
  let filled = 0;

  for (const assignment of assignments) {
    filled += await autoRefillUserPoolForCountry(
      uid,
      assignment.country,
      actorUid,
      assignment.sizePerLane,
      assignment.backupLimit
    );
  }

  return filled;
}

/** @deprecated Use autoRefillUserPoolForCountry or autoRefillUserPools */
export async function autoRefillUserPool(
  uid: string,
  country: Country,
  actorUid: string
): Promise<number> {
  const config = await getPoolConfig();
  const assignments = await getUserPoolAssignments(uid);
  return autoRefillUserPoolForCountry(
    uid,
    country,
    actorUid,
    getAssignmentSizePerLane(assignments, country) ??
      config.byCountry[country]?.sizePerLane ??
      config.defaultSizePerLane,
    getAssignmentBackupLimit(assignments, country)
  );
}

// ─── Ban cascade ─────────────────────────────────────────────────────────────
// Triggered when a salesman reports a ban on an active proxy.
// 1. Flag the banned proxy
// 2. Refill backup from global pool (user promotes to active manually)

export async function handleBanCascade(
  bannedProxyId: string,
  uid: string,
  country: Country,
  actorUid: string,
  notes: string,
  activePoolSize: number,
  backupLimit?: number | null
): Promise<{ promoted: string[]; refilled: boolean }> {
  const db = adminDb();

  await db.collection("proxies").doc(bannedProxyId).update({
    status: "flagged",
    lane: "active",
    notes: notes ? `[BANNED] ${notes}` : "[BANNED] Account got banned",
  });

  const filled = await autoRefillUserPoolForCountry(
    uid,
    country,
    actorUid,
    activePoolSize,
    backupLimit
  );

  return { promoted: [], refilled: filled > 0 };
}

// ─── FIFO phone assignment ────────────────────────────────────────────────────

export async function assignAvailablePhone(
  country: Country,
  assignedTo: string,
  actorUid: string
): Promise<PhoneNumber | null> {
  const db = adminDb();

  // Single where clause — filter + sort in JS to avoid composite index
  const snapshot = await db
    .collection("phoneNumbers")
    .where("country", "==", country)
    .limit(200)
    .get();

  const available = snapshot.docs
    .filter((d) => {
      const status = d.data().status;
      return status === "fresh" || status === "available";
    })
    .sort((a, b) => {
      const aAt = a.data().purchasedAt?.toDate?.() ?? new Date(a.data().purchasedAt);
      const bAt = b.data().purchasedAt?.toDate?.() ?? new Date(b.data().purchasedAt);
      return aAt.getTime() - bAt.getTime();
    });

  if (available.length === 0) return null;

  const doc = available[0];
  const now = new Date();

  await doc.ref.update({
    status: "active",
    assignedTo,
    assignedAt: now,
  });

  await writeAuditLog({
    actorUid,
    action: "phone.assigned",
    targetType: "phone",
    targetId: doc.id,
    metadata: { assignedTo, country },
  });

  return { id: doc.id, ...doc.data() } as PhoneNumber;
}

// ─── Count active proxies for a user ─────────────────────────────────────────

export async function countActiveProxies(uid: string): Promise<number> {
  const db = adminDb();
  const snap = await db
    .collection("proxies")
    .where("assignedTo", "==", uid)
    .where("status", "==", "assigned")
    .count()
    .get();
  return snap.data().count;
}

export async function countActivePhones(uid: string): Promise<number> {
  const db = adminDb();
  const snap = await db.collection("phoneNumbers").where("assignedTo", "==", uid).get();
  return snap.docs.filter((d) => {
    const status = d.data().status;
    return status === "active" || status === "assigned";
  }).length;
}

// ─── Firestore timestamp to ISO string ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toIso(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

// ─── Notify (write in-app notification) ──────────────────────────────────────

export async function createNotification({
  uid,
  type,
  message,
  relatedId,
}: {
  uid: string;
  type: string;
  message: string;
  relatedId?: string;
}) {
  const db = adminDb();
  await db.collection("notifications").add({
    uid,
    type,
    message,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    ...(relatedId ? { relatedId } : {}),
  });
}

// ─── Notify all managers/admins ──────────────────────────────────────────────

export async function notifyManagers({
  type,
  message,
  relatedId,
}: {
  type: string;
  message: string;
  relatedId?: string;
}) {
  const db = adminDb();
  const managers = await db
    .collection("users")
    .where("role", "in", ["manager", "admin"])
    .where("status", "==", "active")
    .get();

  const batch = db.batch();
  managers.forEach((doc) => {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      uid: doc.id,
      type,
      message,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      ...(relatedId ? { relatedId } : {}),
    });
  });

  await batch.commit();
}
