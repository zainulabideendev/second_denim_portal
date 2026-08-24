import { adminDb } from "@/lib/firebase-admin";
import type { AuditAction } from "@/lib/types";

export async function writeAuditLog({
  actorUid,
  action,
  targetType,
  targetId,
  metadata = {},
}: {
  actorUid: string;
  action: AuditAction;
  targetType: "proxy" | "phone" | "request" | "user";
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const db = adminDb();
  await db.collection("auditLog").add({
    actorUid,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date(),
  });
}
