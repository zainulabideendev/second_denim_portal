import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Country, PhoneNumber } from "@/lib/types";
import { writeAuditLog } from "@/lib/audit";

// ─── Ban cascade ─────────────────────────────────────────────────────────────
// Triggered when a salesman reports a ban on an active proxy.
// Flags the banned proxy only — admin assigns a replacement manually.

export async function handleBanCascade(
  bannedProxyId: string,
  _uid: string,
  _country: Country,
  _actorUid: string,
  notes: string,
  _activePoolSize?: number,
  _backupLimit?: number | null
): Promise<{ promoted: string[]; refilled: boolean }> {
  const db = adminDb();

  await db.collection("proxies").doc(bannedProxyId).update({
    status: "flagged",
    lane: "active",
    notes: notes ? `[BANNED] ${notes}` : "[BANNED] Account got banned",
  });

  return { promoted: [], refilled: false };
}

// ─── FIFO phone assignment ────────────────────────────────────────────────────

export async function assignAvailablePhone(
  country: Country,
  assignedTo: string,
  actorUid: string
): Promise<PhoneNumber | null> {
  const db = adminDb();

  const snapshot = await db
    .collection("phoneNumbers")
    .where("country", "==", country)
    .limit(50)
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
