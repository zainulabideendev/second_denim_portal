import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit";

/** Link a proxy and email (1:1). Clears any prior links on either side. */
export async function linkProxyToEmail(
  proxyId: string,
  emailId: string,
  actorUid: string,
  options?: { skipAudit?: boolean }
): Promise<void> {
  const db = adminDb();
  const proxyRef = db.collection("proxies").doc(proxyId);
  const emailRef = db.collection("emails").doc(emailId);

  const [proxyDoc, emailDoc] = await Promise.all([proxyRef.get(), emailRef.get()]);

  if (!proxyDoc.exists) throw new Error("Proxy not found");
  if (!emailDoc.exists) throw new Error("Email not found");

  const proxyData = proxyDoc.data()!;
  const emailData = emailDoc.data()!;

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  if (proxyData.syncedEmailId && proxyData.syncedEmailId !== emailId) {
    const oldEmailRef = db.collection("emails").doc(proxyData.syncedEmailId);
    batch.update(oldEmailRef, { syncedProxyId: null, syncedAt: null });
  }

  if (emailData.syncedProxyId && emailData.syncedProxyId !== proxyId) {
    const oldProxyRef = db.collection("proxies").doc(emailData.syncedProxyId);
    batch.update(oldProxyRef, { syncedEmailId: null, syncedAt: null });
  }

  batch.update(proxyRef, { syncedEmailId: emailId, syncedAt: now });
  batch.update(emailRef, { syncedProxyId: proxyId, syncedAt: now });

  await batch.commit();

  if (!options?.skipAudit) {
    await writeAuditLog({
      actorUid,
      action: "proxy.email_synced",
      targetType: "proxy",
      targetId: proxyId,
      metadata: { emailId, email: emailData.email },
    });
  }
}

/** Remove sync link from proxy (and paired email). */
export async function unlinkProxyEmail(
  proxyId: string,
  actorUid: string
): Promise<void> {
  const db = adminDb();
  const proxyRef = db.collection("proxies").doc(proxyId);
  const proxyDoc = await proxyRef.get();

  if (!proxyDoc.exists) throw new Error("Proxy not found");

  const emailId = proxyDoc.data()?.syncedEmailId as string | undefined;
  if (!emailId) throw new Error("Proxy is not synced to an email");

  const batch = db.batch();
  batch.update(proxyRef, { syncedEmailId: null, syncedAt: null });
  batch.update(db.collection("emails").doc(emailId), {
    syncedProxyId: null,
    syncedAt: null,
  });

  await batch.commit();

  await writeAuditLog({
    actorUid,
    action: "proxy.email_unsynced",
    targetType: "proxy",
    targetId: proxyId,
    metadata: { emailId },
  });
}

function sortByCreated(
  a: FirebaseFirestore.QueryDocumentSnapshot,
  b: FirebaseFirestore.QueryDocumentSnapshot
) {
  const aAt =
    a.data().createdAt?.toDate?.() ??
    a.data().purchasedAt?.toDate?.() ??
    new Date(0);
  const bAt =
    b.data().createdAt?.toDate?.() ??
    b.data().purchasedAt?.toDate?.() ??
    new Date(0);
  return aAt.getTime() - bAt.getTime();
}

/** Pair unsynced fresh proxies with unsynced fresh emails (1:1, FIFO). */
export async function autoSyncFreshPairs(actorUid: string): Promise<{
  paired: number;
  freshProxies: number;
  freshEmails: number;
  pairs: Array<{ proxyId: string; emailId: string }>;
}> {
  const db = adminDb();

  const [proxySnap, emailSnap] = await Promise.all([
    db.collection("proxies").limit(500).get(),
    db.collection("emails").limit(500).get(),
  ]);

  const freshProxies = proxySnap.docs
    .filter((d) => {
      const data = d.data();
      return data.status === "fresh" && !data.syncedEmailId;
    })
    .sort(sortByCreated);

  const freshEmails = emailSnap.docs
    .filter((d) => {
      const data = d.data();
      return data.status === "fresh" && !data.syncedProxyId;
    })
    .sort(sortByCreated);

  const pairs: Array<{ proxyId: string; emailId: string }> = [];
  const count = Math.min(freshProxies.length, freshEmails.length);

  for (let i = 0; i < count; i++) {
    const proxyId = freshProxies[i].id;
    const emailId = freshEmails[i].id;
    await linkProxyToEmail(proxyId, emailId, actorUid, { skipAudit: true });
    pairs.push({ proxyId, emailId });
  }

  if (pairs.length > 0) {
    await writeAuditLog({
      actorUid,
      action: "proxy.email_auto_synced",
      targetType: "proxy",
      targetId: "bulk",
      metadata: {
        paired: pairs.length,
        freshProxies: freshProxies.length,
        freshEmails: freshEmails.length,
        pairs,
      },
    });
  }

  return {
    paired: pairs.length,
    freshProxies: freshProxies.length,
    freshEmails: freshEmails.length,
    pairs,
  };
}
