import { adminDb } from "@/lib/firebase-admin";
import { toIso } from "@/lib/utils-server";

type ProxyWithOptionalSync = {
  id: string;
  syncedEmailId?: string | null;
  syncedEmail?: { id: string; email: string; password: string } | null;
};

/**
 * Attach synced email details. Prefer denormalized fields already on the proxy
 * (syncedEmailEmail / syncedEmailPassword) to avoid N+1 Firestore reads.
 */
export async function enrichProxiesWithSyncedEmails<T extends ProxyWithOptionalSync>(
  proxies: T[]
) {
  const needFetch = proxies.filter(
    (p) => p.syncedEmailId && !p.syncedEmail?.email
  );
  const emailIds = [
    ...new Set(
      needFetch.map((p) => p.syncedEmailId).filter((id): id is string => !!id)
    ),
  ];

  if (!emailIds.length) {
    return proxies.map((p) => ({
      ...p,
      syncedEmail: p.syncedEmailId
        ? p.syncedEmail ?? null
        : null,
    }));
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

  // Backfill denormalized fields so future list calls skip these reads
  const backfills = needFetch
    .map((p) => {
      const snap = p.syncedEmailId ? emailMap.get(p.syncedEmailId) : null;
      if (!snap) return null;
      return db.collection("proxies").doc(p.id).update({
        syncedEmailEmail: snap.email,
        syncedEmailPassword: snap.password,
      });
    })
    .filter(Boolean);
  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return proxies.map((p) => ({
    ...p,
    syncedEmail: p.syncedEmailId
      ? p.syncedEmail ?? emailMap.get(p.syncedEmailId) ?? null
      : null,
  }));
}

type SyncedProxySnap = {
  id: string;
  host: string;
  port: string;
  country: string;
};

export async function enrichEmailsWithSyncedProxies<
  T extends {
    id: string;
    syncedProxyId?: string | null;
    syncedProxy?: SyncedProxySnap | null;
  }
>(emails: T[]) {
  const needFetch = emails.filter(
    (e) => e.syncedProxyId && !e.syncedProxy?.host
  );
  const proxyIds = [
    ...new Set(
      needFetch.map((e) => e.syncedProxyId).filter((id): id is string => !!id)
    ),
  ];
  if (!proxyIds.length) {
    return emails.map((e) => ({
      ...e,
      syncedProxy: e.syncedProxyId ? e.syncedProxy ?? null : null,
    }));
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

  const backfills = needFetch
    .map((e) => {
      const snap = e.syncedProxyId ? proxyMap.get(e.syncedProxyId) : null;
      if (!snap) return null;
      return db.collection("emails").doc(e.id).update({
        syncedProxyHost: snap.host,
        syncedProxyPort: snap.port,
        syncedProxyCountry: snap.country,
      });
    })
    .filter(Boolean);
  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return emails.map((e) => ({
    ...e,
    syncedProxy: e.syncedProxyId
      ? e.syncedProxy ?? proxyMap.get(e.syncedProxyId) ?? null
      : null,
  }));
}

export async function enrichPhonesWithProxies<
  T extends {
    id: string;
    proxyId?: string | null;
    proxy?: SyncedProxySnap | null;
  }
>(phones: T[]) {
  const needFetch = phones.filter((p) => p.proxyId && !p.proxy?.host);
  const proxyIds = [
    ...new Set(
      needFetch.map((p) => p.proxyId).filter((id): id is string => !!id)
    ),
  ];
  if (!proxyIds.length) {
    return phones.map((p) => ({
      ...p,
      proxy: p.proxyId ? p.proxy ?? null : null,
    }));
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

  const backfills = needFetch
    .map((p) => {
      const snap = p.proxyId ? proxyMap.get(p.proxyId) : null;
      if (!snap) return null;
      return db.collection("phoneNumbers").doc(p.id).update({
        proxyHost: snap.host,
        proxyPort: snap.port,
        proxyCountry: snap.country,
      });
    })
    .filter(Boolean);
  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return phones.map((p) => ({
    ...p,
    proxy: p.proxyId ? p.proxy ?? proxyMap.get(p.proxyId) ?? null : null,
  }));
}

export function emailProxySnapshotFields(
  proxy: { host?: string; port?: string; country?: string } | null
) {
  if (!proxy) {
    return {
      syncedProxyHost: null,
      syncedProxyPort: null,
      syncedProxyCountry: null,
    };
  }
  return {
    syncedProxyHost: proxy.host ?? "",
    syncedProxyPort: proxy.port ?? "",
    syncedProxyCountry: proxy.country ?? "",
  };
}

export function phoneProxySnapshotFields(
  proxy: { host?: string; port?: string; country?: string } | null
) {
  if (!proxy) {
    return { proxyHost: null, proxyPort: null, proxyCountry: null };
  }
  return {
    proxyHost: proxy.host ?? "",
    proxyPort: proxy.port ?? "",
    proxyCountry: proxy.country ?? "",
  };
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
    // Denormalized sync snapshot (avoids email doc reads on list endpoints)
    syncedEmail:
      d.syncedEmailId && d.syncedEmailEmail
        ? {
            id: String(d.syncedEmailId),
            email: String(d.syncedEmailEmail),
            password: String(d.syncedEmailPassword ?? ""),
          }
        : null,
    vintedUsername: d.vintedUsername ?? "",
    vintedPassword: d.vintedPassword ?? "",
    phoneId: d.phoneId ?? null,
    phoneNumber: d.phoneNumber ?? null,
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
    syncedProxy:
      d.syncedProxyId && d.syncedProxyHost
        ? {
            id: String(d.syncedProxyId),
            host: String(d.syncedProxyHost),
            port: String(d.syncedProxyPort ?? ""),
            country: d.syncedProxyCountry,
          }
        : null,
  };
}

export function mapPhoneDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot
) {
  const d = doc.data()!;
  return {
    id: doc.id,
    country: d.country,
    number: d.number,
    provider: d.provider,
    purchasedAt: toIso(d.purchasedAt),
    expiresAt: toIso(d.expiresAt),
    status: d.status,
    numberType: d.numberType ?? "temporary",
    assignedTo: d.assignedTo ?? null,
    assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
    batchId: d.batchId ?? "",
    notes: d.notes ?? "",
    lane: d.lane ?? null,
    proxyId: d.proxyId ?? null,
    proxy:
      d.proxyId && d.proxyHost
        ? {
            id: String(d.proxyId),
            host: String(d.proxyHost),
            port: String(d.proxyPort ?? ""),
            country: d.proxyCountry,
          }
        : null,
  };
}
