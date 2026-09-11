import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/audit";
import {
  PROXY_CHEAP_PROVIDER,
  fetchProxyCheapProxies,
  type AccountFetchStats,
  type MappedProxyCheapProxy,
} from "@/lib/proxy-cheap";

const SYSTEM_UID = "cron-system";
const FIRESTORE_BATCH_LIMIT = 450; // leave room for importBatches doc

export interface SyncProxyCheapResult {
  dryRun: boolean;
  fetched: number;
  /** New proxies written (0 when dryRun). */
  created: number;
  /** Proxies that would be written when dryRun is true. */
  wouldCreate: number;
  /** Existing proxies whose expiresAt was updated from Proxy-Cheap (0 when dryRun). */
  updatedExpiry: number;
  /** Existing proxies whose expiresAt would be updated when dryRun is true. */
  wouldUpdateExpiry: number;
  /** Already in DB with matching proxyCheapId AND matching expiresAt — left untouched. */
  skippedExisting: number;
  skippedOther: number;
  skippedWrongCountry: number;
  accountsUsed: string[];
  byAccount: AccountFetchStats[];
  batchId: string | null;
  runAt: string;
  preview?: Array<{
    proxyCheapId: string;
    host: string;
    port: string;
    username: string;
    password: string;
    status: string;
    country: string;
    provider: string;
    accountId: string;
    purchasedAt: string;
    expiresAt: string;
    notes: string;
  }>;
}

interface ExistingProxyEntry {
  docId: string;
  expiresAt: string | null;
}

/**
 * Load existing Proxy-Cheap proxies — keyed by proxyCheapId.
 * We store the Firestore doc id and expiresAt so we can detect stale expiry dates.
 */
async function loadExistingProxyCheapEntries(): Promise<Map<string, ExistingProxyEntry>> {
  const db = adminDb();
  const snap = await db.collection("proxies").select("proxyCheapId", "expiresAt").get();
  const map = new Map<string, ExistingProxyEntry>();
  for (const doc of snap.docs) {
    const { proxyCheapId, expiresAt } = doc.data();
    const id = proxyCheapId != null ? String(proxyCheapId).trim() : "";
    if (id === "") continue;
    map.set(id, {
      docId: doc.id,
      expiresAt: expiresAt != null ? String(expiresAt) : null,
    });
  }
  return map;
}

async function writeNewProxies(
  rows: MappedProxyCheapProxy[],
  actorUid: string
): Promise<{ batchId: string; count: number; proxyIds: string[] }> {
  const db = adminDb();
  const batchRef = db.collection("importBatches").doc();
  const batchId = batchRef.id;
  const proxyIds: string[] = [];

  let writeBatch = db.batch();
  let opsInBatch = 0;

  writeBatch.set(batchRef, {
    type: "proxy",
    importedBy: actorUid,
    importedAt: FieldValue.serverTimestamp(),
    count: rows.length,
    rawFileName: "proxy-cheap-sync",
    createdAt: FieldValue.serverTimestamp(),
  });
  opsInBatch += 1;

  const commitIfNeeded = async (force = false) => {
    if (opsInBatch === 0) return;
    if (!force && opsInBatch < FIRESTORE_BATCH_LIMIT) return;
    await writeBatch.commit();
    writeBatch = db.batch();
    opsInBatch = 0;
  };

  for (const row of rows) {
    const proxyRef = db.collection("proxies").doc();
    proxyIds.push(proxyRef.id);
    // Insert only — never update existing docs matched by proxyCheapId.
    writeBatch.set(proxyRef, {
      proxyCheapId: row.proxyCheapId,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      status: row.status, // "fresh"
      country: row.country,
      provider: row.provider || PROXY_CHEAP_PROVIDER,
      purchasedAt: row.purchasedAt,
      expiresAt: row.expiresAt,
      assignedTo: null,
      assignedAt: null,
      batchId,
      notes: row.notes ?? "",
      syncedEmailId: null,
      syncedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    opsInBatch += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);

  return { batchId, count: rows.length, proxyIds };
}

/**
 * Update expiresAt on existing Proxy-Cheap proxy docs whose expiry has changed.
 */
async function updateExpiryDates(
  updates: Array<{ docId: string; expiresAt: Date }>
): Promise<void> {
  if (updates.length === 0) return;
  const db = adminDb();
  let writeBatch = db.batch();
  let opsInBatch = 0;

  const commitIfNeeded = async (force = false) => {
    if (opsInBatch === 0) return;
    if (!force && opsInBatch < FIRESTORE_BATCH_LIMIT) return;
    await writeBatch.commit();
    writeBatch = db.batch();
    opsInBatch = 0;
  };

  for (const { docId, expiresAt } of updates) {
    const ref = db.collection("proxies").doc(docId);
    writeBatch.update(ref, { expiresAt: expiresAt.toISOString() });
    opsInBatch += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);
}

export interface SyncProxyCheapOptions {
  actorUid?: string;
  /** When true: fetch + compare only — never write to Firestore. */
  dryRun?: boolean;
}

/**
 * Fetch from UK/BE/FR accounts.
 * Match on proxyCheapId:
 *   - new → insert;
 *   - existing + same expiresAt → skip;
 *   - existing + different expiresAt → update expiresAt from Proxy-Cheap.
 */
export async function syncProxyCheapFromApi(
  options: SyncProxyCheapOptions = {}
): Promise<SyncProxyCheapResult> {
  const actorUid = options.actorUid ?? SYSTEM_UID;
  const dryRun = options.dryRun === true;
  const runAt = new Date().toISOString();
  const {
    proxies: fetched,
    byAccount,
    skippedOther,
    skippedWrongCountry,
    accountsUsed,
  } = await fetchProxyCheapProxies();

  const existingEntries = await loadExistingProxyCheapEntries();
  const fresh: MappedProxyCheapProxy[] = [];
  const expiryUpdates: Array<{ docId: string; expiresAt: Date }> = [];
  let skippedExisting = 0;

  for (const row of fetched) {
    const existing = existingEntries.get(row.proxyCheapId);
    if (existing) {
      // Compare expiresAt — update if the API reports a different date
      const apiExpiry = row.expiresAt.toISOString();
      const storedExpiry = existing.expiresAt ?? "";
      if (apiExpiry !== storedExpiry) {
        expiryUpdates.push({ docId: existing.docId, expiresAt: row.expiresAt });
      } else {
        skippedExisting += 1;
      }
      continue;
    }
    // Track newly seen ids so duplicates within the same fetch are deduplicated
    existingEntries.set(row.proxyCheapId, { docId: "", expiresAt: row.expiresAt.toISOString() });
    fresh.push(row);
  }

  if (dryRun) {
    return {
      dryRun: true,
      fetched: fetched.length,
      created: 0,
      wouldCreate: fresh.length,
      updatedExpiry: 0,
      wouldUpdateExpiry: expiryUpdates.length,
      skippedExisting,
      skippedOther,
      skippedWrongCountry,
      accountsUsed,
      byAccount,
      batchId: null,
      runAt,
      preview: fresh.map((row) => ({
        proxyCheapId: row.proxyCheapId,
        host: row.host,
        port: row.port,
        username: row.username,
        password: row.password,
        status: row.status,
        country: row.country,
        provider: row.provider,
        accountId: row.accountId,
        purchasedAt: row.purchasedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        notes: row.notes,
      })),
    };
  }

  // Apply expiry updates even when there are no new proxies to insert
  await updateExpiryDates(expiryUpdates);

  if (fresh.length === 0) {
    return {
      dryRun: false,
      fetched: fetched.length,
      created: 0,
      wouldCreate: 0,
      updatedExpiry: expiryUpdates.length,
      wouldUpdateExpiry: 0,
      skippedExisting,
      skippedOther,
      skippedWrongCountry,
      accountsUsed,
      byAccount,
      batchId: null,
      runAt,
    };
  }

  const { batchId, count } = await writeNewProxies(fresh, actorUid);

  await writeAuditLog({
    actorUid,
    action: "proxy.imported",
    targetType: "proxy",
    targetId: batchId,
    metadata: {
      count,
      rawFileName: "proxy-cheap-sync",
      batchId,
      source: PROXY_CHEAP_PROVIDER,
      fetched: fetched.length,
      skippedExisting,
      skippedOther,
      skippedWrongCountry,
      updatedExpiry: expiryUpdates.length,
      accountsUsed,
      byAccount,
    },
  });

  return {
    dryRun: false,
    fetched: fetched.length,
    created: count,
    wouldCreate: 0,
    updatedExpiry: expiryUpdates.length,
    wouldUpdateExpiry: 0,
    skippedExisting,
    skippedOther,
    skippedWrongCountry,
    accountsUsed,
    byAccount,
    batchId,
    runAt,
  };
}
