/**
 * One-time migration: Firestore → Supabase.
 *
 * Prerequisites:
 * 1. Run supabase/migrations/001_init_schema.sql in the Supabase SQL Editor
 * 2. Set SUPABASE_SERVICE_ROLE_KEY in .env
 * 3. Firebase Admin env vars still present (read-only export)
 *
 * Usage:
 *   npx tsx scripts/migrate-firebase-to-supabase.ts
 *   npx tsx scripts/migrate-firebase-to-supabase.ts --dry-run
 *
 * Notes:
 * - Creates Supabase Auth users for each Firebase profile (temp password).
 * - Remaps all assigned_to / user FKs from Firebase UIDs → Supabase UUIDs.
 * - Entity IDs (proxies, emails, phones, …) keep their Firestore document IDs.
 * - Users must reset passwords after migration (or set MIGRATE_TEMP_PASSWORD).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const TEMP_PASSWORD =
  process.env.MIGRATE_TEMP_PASSWORD || "ChangeMe-Temp-123!";

function toIso(val: unknown): string | null {
  if (!val) return null;
  if (typeof (val as { toDate?: () => Date }).toDate === "function") {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return String(val);
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const PROXY_STATUSES = new Set([
  "fresh",
  "available",
  "active",
  "assigned",
  "expired",
  "flagged",
  "retired",
]);
const EMAIL_STATUSES = new Set([
  "fresh",
  "available",
  "assigned",
  "flagged",
  "retired",
]);
const PHONE_STATUSES = new Set([
  "available",
  "active",
  "inactive",
  "expired",
  "retired",
  "assigned",
  "flagged",
  "banned",
  "banned_with_balance",
]);
const REQUEST_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "fulfilled",
]);
const COUNTRIES = new Set(["FR", "BE", "UK", "DE"]);
const LANES = new Set(["backup", "active"]);

function normalizeProxyStatus(raw: unknown): {
  status: string;
  restricted: boolean;
} {
  const s = String(raw ?? "fresh");
  if (s === "restricted") return { status: "assigned", restricted: true };
  if (s === "banned" || s === "banned_with_balance")
    return { status: "flagged", restricted: false };
  if (PROXY_STATUSES.has(s)) return { status: s, restricted: false };
  return { status: "fresh", restricted: false };
}

function normalizeEmailStatus(raw: unknown): string {
  const s = String(raw ?? "fresh");
  if (EMAIL_STATUSES.has(s)) return s;
  if (s === "active") return "assigned";
  return "fresh";
}

function normalizePhoneStatus(raw: unknown): string {
  const s = String(raw ?? "available");
  if (s === "fresh") return "available";
  if (PHONE_STATUSES.has(s)) return s;
  return "available";
}

function normalizeRequestStatus(raw: unknown): string {
  const s = String(raw ?? "pending");
  return REQUEST_STATUSES.has(s) ? s : "pending";
}

function normalizeCountry(raw: unknown): string {
  const s = String(raw ?? "UK").toUpperCase();
  return COUNTRIES.has(s) ? s : "UK";
}

function normalizeLane(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw);
  return LANES.has(s) ? s : "backup";
}

async function upsertChunks(
  sb: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize: number
): Promise<{ ok: number; failed: string[] }> {
  let ok = 0;
  const failed: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from(table).upsert(chunk as never[]);
    if (!error) {
      ok += chunk.length;
      continue;
    }
    // Fall back to per-row so one bad record doesn't drop the whole chunk
    console.warn(`${table} chunk failed (${error.message}) — retrying row-by-row`);
    for (const row of chunk) {
      const { error: rowErr } = await sb.from(table).upsert(row as never);
      if (rowErr) {
        failed.push(`${row.id ?? "?"}: ${rowErr.message}`);
        console.error(`${table} row ${row.id}:`, rowErr.message);
      } else {
        ok += 1;
      }
    }
  }
  return { ok, failed };
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: requireEnv("FIREBASE_PROJECT_ID"),
        clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    });
  }

  const fs = getFirestore();
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(dryRun ? "=== DRY RUN ===" : "=== LIVE MIGRATION ===");

  // Fail fast if schema was never applied (avoids creating orphan Auth users)
  if (!dryRun) {
    const { error: schemaErr } = await sb.from("profiles").select("id").limit(1);
    if (schemaErr?.message?.includes("schema cache") || schemaErr?.code === "PGRST205") {
      console.error(`
Schema is missing in Supabase (no public.profiles table).

Do this first:
  1. Open Supabase → SQL Editor
  2. Paste and run: supabase/migrations/001_init_schema.sql
  OR set SUPABASE_DB_PASSWORD / DATABASE_URL and run:
     npx tsx scripts/apply-supabase-schema.ts

Then re-run: npm run migrate:supabase
`);
      process.exit(1);
    }
  }

  // ── Users → Auth + profiles ───────────────────────────────────────────────
  const usersSnap = await fs.collection("users").get();
  const uidMap = new Map<string, string>(); // firebaseUid → supabaseUuid

  console.log(`Users: ${usersSnap.size}`);

  for (const doc of usersSnap.docs) {
    const d = doc.data();
    const email = String(d.email || "").trim().toLowerCase();
    if (!email) {
      console.warn(`  skip user ${doc.id} — no email`);
      continue;
    }

    if (dryRun) {
      console.log(`  would create auth user ${email} (${d.role})`);
      uidMap.set(doc.id, `dry-run-${doc.id}`);
      continue;
    }

    const { data: listed } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const existing = listed?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );

    let supabaseId = existing?.id;
    if (!supabaseId) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: d.name ?? email,
          role: d.role ?? "salesman",
        },
      });
      if (error || !created.user) {
        console.error(`  FAIL create ${email}:`, error?.message);
        continue;
      }
      supabaseId = created.user.id;
    }

    uidMap.set(doc.id, supabaseId);

    const { error: profileErr } = await sb.from("profiles").upsert({
      id: supabaseId,
      name: d.name ?? email,
      email,
      role: d.role ?? "salesman",
      country: d.country ?? null,
      pool_countries: d.poolCountries ?? [],
      active_proxy_limit: d.activeProxyLimit ?? 4,
      status: d.status === "disabled" ? "disabled" : "active",
      created_at: toIso(d.createdAt) ?? new Date().toISOString(),
    });
    if (profileErr) console.error(`  profile ${email}:`, profileErr.message);
    else console.log(`  ✓ ${email} → ${supabaseId}`);
  }

  const mapUid = (firebaseUid: string | null | undefined): string | null => {
    if (!firebaseUid) return null;
    return uidMap.get(firebaseUid) ?? null;
  };

  // ── Import batches ────────────────────────────────────────────────────────
  const batchesSnap = await fs.collection("importBatches").get();
  console.log(`Import batches: ${batchesSnap.size}`);
  const batchIds = new Set(batchesSnap.docs.map((d) => d.id));
  if (!dryRun && batchesSnap.size) {
    const rows = batchesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        type: (d.type === "email" ? "email" : d.type === "phone" ? "phone" : "proxy") as
          | "proxy"
          | "phone"
          | "email",
        imported_by: mapUid(d.importedBy),
        imported_at: toIso(d.importedAt) ?? new Date().toISOString(),
        country: d.country ? normalizeCountry(d.country) : null,
        count: d.count ?? 0,
        raw_file_name: d.rawFileName ?? "",
      };
    });
    const result = await upsertChunks(sb, "import_batches", rows, 100);
    console.log(`  import_batches upserted: ${result.ok}/${rows.length}`);
  }

  // ── Emails (before proxies for FK optional) ───────────────────────────────
  const emailsSnap = await fs.collection("emails").get();
  console.log(`Emails: ${emailsSnap.size}`);
  if (!dryRun) {
    const rows = emailsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        email: d.email,
        password: d.password ?? "",
        status: normalizeEmailStatus(d.status),
        assigned_to: mapUid(d.assignedTo),
        assigned_at: toIso(d.assignedAt),
        notes: d.notes ?? "",
        created_at: toIso(d.createdAt) ?? new Date().toISOString(),
        synced_proxy_id: null as string | null,
        synced_at: toIso(d.syncedAt),
        synced_proxy_host: d.syncedProxyHost ?? null,
        synced_proxy_port: d.syncedProxyPort ?? null,
        synced_proxy_country: d.syncedProxyCountry
          ? normalizeCountry(d.syncedProxyCountry)
          : null,
      };
    });
    const result = await upsertChunks(sb, "emails", rows, 100);
    console.log(`  emails upserted: ${result.ok}/${rows.length}`);
  }

  // ── Proxies ───────────────────────────────────────────────────────────────
  const proxiesSnap = await fs.collection("proxies").get();
  console.log(`Proxies: ${proxiesSnap.size}`);
  if (!dryRun) {
    const rows = proxiesSnap.docs.map((doc) => {
      const d = doc.data();
      const { status, restricted: restrictedFromStatus } = normalizeProxyStatus(
        d.status
      );
      return {
        id: doc.id,
        country: normalizeCountry(d.country),
        host: d.host,
        port: String(d.port ?? ""),
        username: d.username ?? "",
        password: d.password ?? "",
        provider: d.provider ?? "",
        purchased_at: toIso(d.purchasedAt) ?? new Date().toISOString(),
        expires_at: toIso(d.expiresAt) ?? new Date().toISOString(),
        status,
        assigned_to: mapUid(d.assignedTo),
        assigned_at: toIso(d.assignedAt),
        batch_id:
          d.batchId && batchIds.has(String(d.batchId))
            ? String(d.batchId)
            : null,
        notes: d.notes ?? "",
        proxy_cheap_id: d.proxyCheapId ?? null,
        lane: normalizeLane(d.lane),
        accounts_created: Boolean(d.accountsCreated ?? d.stagingDone),
        staging_done: Boolean(d.stagingDone),
        restricted: Boolean(d.restricted) || restrictedFromStatus,
        synced_email_id: d.syncedEmailId ?? null,
        synced_at: toIso(d.syncedAt),
        synced_email_email: d.syncedEmailEmail ?? null,
        synced_email_password: d.syncedEmailPassword ?? null,
        vinted_username: d.vintedUsername ?? "",
        vinted_password: d.vintedPassword ?? "",
        phone_id: null as string | null,
        phone_number: d.phoneNumber ?? null,
        created_at: toIso(d.createdAt) ?? new Date().toISOString(),
      };
    });
    const result = await upsertChunks(sb, "proxies", rows, 50);
    console.log(`  proxies upserted: ${result.ok}/${rows.length}`);
  }

  // Link emails → proxies
  if (!dryRun) {
    for (const doc of emailsSnap.docs) {
      const d = doc.data();
      if (!d.syncedProxyId) continue;
      await sb
        .from("emails")
        .update({
          synced_proxy_id: d.syncedProxyId,
          synced_at: toIso(d.syncedAt),
          synced_proxy_host: d.syncedProxyHost ?? null,
          synced_proxy_port: d.syncedProxyPort ?? null,
          synced_proxy_country: d.syncedProxyCountry
            ? normalizeCountry(d.syncedProxyCountry)
            : null,
        })
        .eq("id", doc.id);
    }
  }

  // ── Phones ────────────────────────────────────────────────────────────────
  const phonesSnap = await fs.collection("phoneNumbers").get();
  console.log(`Phones: ${phonesSnap.size}`);
  if (!dryRun) {
    const rows = phonesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        country: normalizeCountry(d.country),
        number: d.number,
        provider: d.provider ?? "",
        purchased_at: toIso(d.purchasedAt) ?? new Date().toISOString(),
        expires_at: toIso(d.expiresAt) ?? new Date().toISOString(),
        status: normalizePhoneStatus(d.status),
        number_type:
          d.numberType === "permanent" ? "permanent" : "temporary",
        assigned_to: mapUid(d.assignedTo),
        assigned_at: toIso(d.assignedAt),
        batch_id:
          d.batchId && batchIds.has(String(d.batchId))
            ? String(d.batchId)
            : null,
        notes: d.notes ?? "",
        lane: normalizeLane(d.lane),
        proxy_id: d.proxyId ?? null,
        proxy_host: d.proxyHost ?? null,
        proxy_port: d.proxyPort ?? null,
        proxy_country: d.proxyCountry
          ? normalizeCountry(d.proxyCountry)
          : null,
        created_at: toIso(d.createdAt) ?? new Date().toISOString(),
      };
    });
    const result = await upsertChunks(sb, "phone_numbers", rows, 100);
    console.log(`  phones upserted: ${result.ok}/${rows.length}`);

    // Link proxy.phone_id
    for (const doc of proxiesSnap.docs) {
      const d = doc.data();
      if (!d.phoneId) continue;
      await sb
        .from("proxies")
        .update({ phone_id: d.phoneId, phone_number: d.phoneNumber ?? null })
        .eq("id", doc.id);
    }
  }

  // ── User pools ────────────────────────────────────────────────────────────
  const poolsSnap = await fs.collection("userPools").get();
  console.log(`User pools: ${poolsSnap.size}`);
  if (!dryRun) {
    const rows = poolsSnap.docs
      .map((doc) => {
        const d = doc.data();
        const userId = mapUid(d.userId);
        if (!userId) return null;
        return {
          id: doc.id,
          user_id: userId,
          user_name: d.userName ?? "",
          user_email: d.userEmail ?? "",
          country: normalizeCountry(d.country),
          size_per_lane: d.sizePerLane ?? 3,
          backup_limit: d.backupLimit ?? null,
          created_at: toIso(d.createdAt) ?? new Date().toISOString(),
          created_by: mapUid(d.createdBy),
        };
      })
      .filter(Boolean);
    if (rows.length) {
      const result = await upsertChunks(
        sb,
        "user_pools",
        rows as Record<string, unknown>[],
        100
      );
      console.log(`  user_pools upserted: ${result.ok}/${rows.length}`);
    }
  }

  // ── Requests ──────────────────────────────────────────────────────────────
  const reqSnap = await fs.collection("requests").get();
  console.log(`Requests: ${reqSnap.size}`);
  if (!dryRun) {
    const rows = reqSnap.docs
      .map((doc) => {
        const d = doc.data();
        const requestedBy = mapUid(d.requestedBy);
        if (!requestedBy) return null;
        return {
          id: doc.id,
          type: d.type,
          requested_by: requestedBy,
          requested_by_name: d.requestedByName ?? "",
          requested_by_email: d.requestedByEmail ?? "",
          country: normalizeCountry(d.country),
          reason: d.reason ?? "",
          status: normalizeRequestStatus(d.status),
          reviewed_by: mapUid(d.reviewedBy),
          reviewed_by_name: d.reviewedByName ?? null,
          reviewed_by_email: d.reviewedByEmail ?? null,
          reviewed_at: toIso(d.reviewedAt),
          fulfilled_item_id: d.fulfilledItemId ?? null,
          rejection_reason: d.rejectionReason ?? null,
          created_at: toIso(d.createdAt) ?? new Date().toISOString(),
        };
      })
      .filter(Boolean);
    if (rows.length) {
      const result = await upsertChunks(
        sb,
        "requests",
        rows as Record<string, unknown>[],
        100
      );
      console.log(`  requests upserted: ${result.ok}/${rows.length}`);
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const notifSnap = await fs.collection("notifications").get();
  console.log(`Notifications: ${notifSnap.size}`);
  if (!dryRun) {
    const rows = notifSnap.docs
      .map((doc) => {
        const d = doc.data();
        const uid = mapUid(d.uid);
        if (!uid) return null;
        return {
          id: doc.id,
          uid,
          type: d.type,
          message: d.message,
          read: Boolean(d.read),
          related_id: d.relatedId ?? null,
          created_at: toIso(d.createdAt) ?? new Date().toISOString(),
        };
      })
      .filter(Boolean);
    if (rows.length) {
      const result = await upsertChunks(
        sb,
        "notifications",
        rows as Record<string, unknown>[],
        100
      );
      console.log(`  notifications upserted: ${result.ok}/${rows.length}`);
    }
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditSnap = await fs.collection("auditLog").get();
  console.log(`Audit logs: ${auditSnap.size}`);
  if (!dryRun) {
    const rows = auditSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        actor_uid: mapUid(d.actorUid),
        action: d.action,
        target_type: d.targetType,
        target_id: d.targetId,
        metadata: d.metadata ?? {},
        created_at: toIso(d.createdAt) ?? new Date().toISOString(),
      };
    });
    const result = await upsertChunks(sb, "audit_logs", rows, 100);
    console.log(`  audit_logs upserted: ${result.ok}/${rows.length}`);
  }

  // ── Pool config ───────────────────────────────────────────────────────────
  const configDoc = await fs.doc("settings/poolConfig").get();
  if (configDoc.exists && !dryRun) {
    const d = configDoc.data()!;
    await sb.from("pool_config").upsert({
      id: "default",
      default_size_per_lane: d.defaultSizePerLane ?? 3,
      by_country: d.byCountry ?? {},
      updated_at: toIso(d.updatedAt),
      updated_by: mapUid(d.updatedBy),
    });
    console.log("Pool config migrated");
  }

  // ── Verification: Firebase counts vs Supabase counts ───────────────────────
  if (!dryRun) {
    console.log("\n=== VERIFICATION (Firebase → Supabase) ===");
    const checks: Array<{
      name: string;
      firebase: number;
      supabaseTable: string;
    }> = [
      { name: "users/profiles", firebase: usersSnap.size, supabaseTable: "profiles" },
      {
        name: "importBatches",
        firebase: batchesSnap.size,
        supabaseTable: "import_batches",
      },
      { name: "emails", firebase: emailsSnap.size, supabaseTable: "emails" },
      { name: "proxies", firebase: proxiesSnap.size, supabaseTable: "proxies" },
      {
        name: "phoneNumbers",
        firebase: phonesSnap.size,
        supabaseTable: "phone_numbers",
      },
      {
        name: "userPools",
        firebase: poolsSnap.size,
        supabaseTable: "user_pools",
      },
      { name: "requests", firebase: reqSnap.size, supabaseTable: "requests" },
      {
        name: "notifications",
        firebase: notifSnap.size,
        supabaseTable: "notifications",
      },
      {
        name: "auditLog",
        firebase: auditSnap.size,
        supabaseTable: "audit_logs",
      },
    ];

    let allMatch = true;
    for (const c of checks) {
      const { count, error } = await sb
        .from(c.supabaseTable)
        .select("*", { count: "exact", head: true });
      const sbCount = error ? -1 : (count ?? 0);
      const match = sbCount === c.firebase;
      if (!match) allMatch = false;
      console.log(
        `${match ? "✓" : "✗"} ${c.name}: firebase=${c.firebase} supabase=${sbCount}${
          error ? ` (${error.message})` : ""
        }`
      );
    }

    async function fetchAllIds(table: string): Promise<string[]> {
      const ids: string[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb
          .from(table)
          .select("id")
          .range(from, from + page - 1);
        if (error) {
          console.error(`fetch ${table} ids:`, error.message);
          break;
        }
        if (!data?.length) break;
        ids.push(...data.map((r) => r.id as string));
        if (data.length < page) break;
      }
      return ids;
    }

    const sbProxySet = new Set(await fetchAllIds("proxies"));
    const missingProxies = proxiesSnap.docs
      .map((d) => d.id)
      .filter((id) => !sbProxySet.has(id));
    if (missingProxies.length) {
      allMatch = false;
      console.log(
        `✗ Missing proxy IDs (${missingProxies.length}):`,
        missingProxies.slice(0, 10).join(", "),
        missingProxies.length > 10 ? "…" : ""
      );
    } else {
      console.log("✓ All Firebase proxy IDs present in Supabase");
    }

    const sbEmailSet = new Set(await fetchAllIds("emails"));
    const missingEmails = emailsSnap.docs
      .map((d) => d.id)
      .filter((id) => !sbEmailSet.has(id));
    if (missingEmails.length) {
      allMatch = false;
      console.log(`✗ Missing email IDs (${missingEmails.length})`);
    } else {
      console.log("✓ All Firebase email IDs present in Supabase");
    }

    const sbPhoneSet = new Set(await fetchAllIds("phone_numbers"));
    const missingPhones = phonesSnap.docs
      .map((d) => d.id)
      .filter((id) => !sbPhoneSet.has(id));
    if (missingPhones.length) {
      allMatch = false;
      console.log(`✗ Missing phone IDs (${missingPhones.length})`);
    } else {
      console.log("✓ All Firebase phone IDs present in Supabase");
    }

    const sbAuditSet = new Set(await fetchAllIds("audit_logs"));
    const missingAudit = auditSnap.docs
      .map((d) => d.id)
      .filter((id) => !sbAuditSet.has(id));
    if (missingAudit.length) {
      allMatch = false;
      console.log(`✗ Missing audit IDs (${missingAudit.length})`);
    } else {
      console.log("✓ All Firebase audit IDs present in Supabase");
    }

    const { count: profileCount } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });
    if ((profileCount ?? 0) !== usersSnap.size) {
      allMatch = false;
    } else {
      console.log("✓ All users have profiles");
    }

    if (!allMatch) {
      console.error("\nMigration completed with MISMATCHES — review above.");
      process.exitCode = 1;
    } else {
      console.log("\nAll counts match. Migration complete.");
    }
  }

  console.log("\nDone.");
  if (!dryRun) {
    console.log(
      `\nTemp password for new auth users: ${TEMP_PASSWORD}\nHave everyone reset passwords after login.`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
