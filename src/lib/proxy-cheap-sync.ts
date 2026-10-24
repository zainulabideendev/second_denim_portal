import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import {
  PROXY_CHEAP_PROVIDER,
  fetchProxyCheapProxies,
  type AccountFetchStats,
  type MappedProxyCheapProxy,
} from "@/lib/proxy-cheap";

const SYSTEM_UID = "cron-system";
const INSERT_CHUNK = 100;

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
 */
async function loadExistingProxyCheapEntries(): Promise<
  Map<string, ExistingProxyEntry>
> {
  const { data, error } = await supabaseAdmin()
    .from("proxies")
    .select("id, proxy_cheap_id, expires_at")
    .not("proxy_cheap_id", "is", null);

  if (error) throw new Error(error.message);

  const map = new Map<string, ExistingProxyEntry>();
  for (const row of data ?? []) {
    const id =
      row.proxy_cheap_id != null ? String(row.proxy_cheap_id).trim() : "";
    if (id === "") continue;
    map.set(id, {
      docId: row.id,
      expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    });
  }
  return map;
}

async function writeNewProxies(
  rows: MappedProxyCheapProxy[],
  actorUid: string
): Promise<{ batchId: string; count: number; proxyIds: string[] }> {
  const { data: batch, error: batchError } = await supabaseAdmin()
    .from("import_batches")
    .insert({
      type: "proxy",
      imported_by: actorUid,
      count: rows.length,
      raw_file_name: "proxy-cheap-sync",
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? "Failed to create import batch");
  }

  const batchId = batch.id;
  const proxyIds: string[] = [];

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { data: inserted, error } = await supabaseAdmin()
      .from("proxies")
      .insert(
        chunk.map((row) => ({
          proxy_cheap_id: row.proxyCheapId,
          host: row.host,
          port: row.port,
          username: row.username,
          password: row.password,
          status: row.status as "fresh",
          country: row.country,
          provider: row.provider || PROXY_CHEAP_PROVIDER,
          purchased_at: row.purchasedAt.toISOString(),
          expires_at: row.expiresAt.toISOString(),
          assigned_to: null,
          assigned_at: null,
          batch_id: batchId,
          notes: row.notes ?? "",
          synced_email_id: null,
          synced_at: null,
        }))
      )
      .select("id");

    if (error) throw new Error(error.message);
    for (const p of inserted ?? []) proxyIds.push(p.id);
  }

  return { batchId, count: rows.length, proxyIds };
}

/**
 * Update expiresAt on existing Proxy-Cheap proxy rows whose expiry has changed.
 */
async function updateExpiryDates(
  updates: Array<{ docId: string; expiresAt: Date }>
): Promise<void> {
  if (updates.length === 0) return;

  for (let i = 0; i < updates.length; i += INSERT_CHUNK) {
    const chunk = updates.slice(i, i + INSERT_CHUNK);
    await Promise.all(
      chunk.map(({ docId, expiresAt }) =>
        supabaseAdmin()
          .from("proxies")
          .update({ expires_at: expiresAt.toISOString() })
          .eq("id", docId)
      )
    );
  }
}

export interface SyncProxyCheapOptions {
  actorUid?: string;
  /** When true: fetch + compare only — never write. */
  dryRun?: boolean;
}

/**
 * Fetch from UK/BE/FR/DE accounts.
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
      const apiExpiry = row.expiresAt.toISOString();
      const storedExpiry = existing.expiresAt ?? "";
      if (apiExpiry !== storedExpiry) {
        expiryUpdates.push({
          docId: existing.docId,
          expiresAt: row.expiresAt,
        });
      } else {
        skippedExisting += 1;
      }
      continue;
    }
    existingEntries.set(row.proxyCheapId, {
      docId: "",
      expiresAt: row.expiresAt.toISOString(),
    });
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
