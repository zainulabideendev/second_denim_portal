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
  /** Already in DB with matching proxyCheapId — left untouched. */
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

/** Load existing Proxy-Cheap proxy ids — never update those docs. */
async function loadExistingProxyCheapIds(): Promise<Set<string>> {
  const db = adminDb();
  const snap = await db.collection("proxies").select("proxyCheapId").get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const id = doc.data().proxyCheapId;
    if (id != null && String(id).trim() !== "") {
      ids.add(String(id).trim());
    }
  }
  return ids;
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

export interface SyncProxyCheapOptions {
  actorUid?: string;
  /** When true: fetch + compare only — never write to Firestore. */
  dryRun?: boolean;
}

/**
 * Fetch from UK/BE/FR accounts.
 * Match on proxyCheapId: existing → skip (no update); new → insert.
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

  const existingIds = await loadExistingProxyCheapIds();
  const fresh: MappedProxyCheapProxy[] = [];
  let skippedExisting = 0;

  for (const row of fetched) {
    if (existingIds.has(row.proxyCheapId)) {
      skippedExisting += 1;
      continue;
    }
    existingIds.add(row.proxyCheapId);
    fresh.push(row);
  }

  if (dryRun) {
    return {
      dryRun: true,
      fetched: fetched.length,
      created: 0,
      wouldCreate: fresh.length,
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

  if (fresh.length === 0) {
    return {
      dryRun: false,
      fetched: fetched.length,
      created: 0,
      wouldCreate: 0,
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
      accountsUsed,
      byAccount,
    },
  });

  return {
    dryRun: false,
    fetched: fetched.length,
    created: count,
    wouldCreate: 0,
    skippedExisting,
    skippedOther,
    skippedWrongCountry,
    accountsUsed,
    byAccount,
    batchId,
    runAt,
  };
}
