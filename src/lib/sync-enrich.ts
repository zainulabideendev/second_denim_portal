import { adminDb } from "@/lib/firebase-admin";
import { toIso } from "@/lib/utils-server";

export async function enrichProxiesWithSyncedEmails<
  T extends { id: string; syncedEmailId?: string | null }
>(proxies: T[]) {
  const emailIds = [
    ...new Set(
      proxies.map((p) => p.syncedEmailId).filter((id): id is string => !!id)
    ),
  ];
  if (!emailIds.length) {
    return proxies.map((p) => ({ ...p, syncedEmail: null }));
  }

  const db = adminDb();
  const emailDocs = await Promise.all(
    emailIds.map((id) => db.collection("emails").doc(id).get())
  );
  const emailMap = new Map(
    emailDocs
      .filter((d) => d.exists)
      .map((d) => {
        const data = d.data()!;
        return [
          d.id,
          { id: d.id, email: data.email, password: data.password },
        ] as const;
      })
  );

  return proxies.map((p) => ({
    ...p,
    syncedEmail: p.syncedEmailId ? emailMap.get(p.syncedEmailId) ?? null : null,
  }));
}

export async function enrichEmailsWithSyncedProxies<
  T extends { id: string; syncedProxyId?: string | null }
>(emails: T[]) {
  const proxyIds = [
    ...new Set(
      emails.map((e) => e.syncedProxyId).filter((id): id is string => !!id)
    ),
  ];
  if (!proxyIds.length) {
    return emails.map((e) => ({ ...e, syncedProxy: null }));
  }

  const db = adminDb();
  const proxyDocs = await Promise.all(
    proxyIds.map((id) => db.collection("proxies").doc(id).get())
  );
  const proxyMap = new Map(
    proxyDocs
      .filter((d) => d.exists)
      .map((d) => {
        const data = d.data()!;
        return [
          d.id,
          {
            id: d.id,
            host: data.host,
            port: data.port,
            country: data.country,
          },
        ] as const;
      })
  );

  return emails.map((e) => ({
    ...e,
    syncedProxy: e.syncedProxyId ? proxyMap.get(e.syncedProxyId) ?? null : null,
  }));
}

export function mapProxyDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
) {
  const d = doc.data()!;
  return {
    id: doc.id,
    country: d.country,
    host: d.host,
    port: d.port,
    username: d.username,
    password: d.password,
    provider: d.provider,
    purchasedAt: toIso(d.purchasedAt),
    expiresAt: toIso(d.expiresAt),
    status: d.status,
    assignedTo: d.assignedTo ?? null,
    assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
    batchId: d.batchId ?? "",
    notes: d.notes ?? "",
    lane: d.lane ?? null,
    accountsCreated: d.accountsCreated ?? d.stagingDone ?? false,
    stagingDone: d.stagingDone ?? false,
    restricted: d.restricted ?? false,
    syncedEmailId: d.syncedEmailId ?? null,
    syncedAt: d.syncedAt ? toIso(d.syncedAt) : null,
  };
}

export function mapEmailDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
) {
  const d = doc.data()!;
  return {
    id: doc.id,
    email: d.email,
    password: d.password,
    status: d.status,
    assignedTo: d.assignedTo ?? null,
    assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
    notes: d.notes ?? "",
    createdAt: toIso(d.createdAt),
    syncedProxyId: d.syncedProxyId ?? null,
    syncedAt: d.syncedAt ? toIso(d.syncedAt) : null,
  };
}
