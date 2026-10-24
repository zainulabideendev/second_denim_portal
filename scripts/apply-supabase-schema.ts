/**
 * Apply supabase/migrations/001_init_schema.sql via Postgres connection.
 *
 * Needs one of:
 *   DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
 *   SUPABASE_DB_PASSWORD=...  (uses project ref from NEXT_PUBLIC_SUPABASE_URL)
 *
 * Usage: npx tsx scripts/apply-supabase-schema.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function buildConnectionString(): string {
  if (process.env.DATABASE_URL?.trim()) {
    // Replace [YOUR-PASSWORD] placeholder if present
    const password = process.env.SUPABASE_DB_PASSWORD?.trim() ?? "";
    return process.env.DATABASE_URL.trim().replace(
      /\[YOUR-PASSWORD\]|YOUR_PASSWORD/g,
      encodeURIComponent(password)
    );
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "Set DATABASE_URL (from Dashboard → Connect → Session/Transaction pooler) or SUPABASE_DB_PASSWORD."
    );
  }

  const poolerHost = process.env.SUPABASE_POOLER_HOST?.trim();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const ref = new URL(url).hostname.split(".")[0];

  if (poolerHost) {
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}/postgres`;
  }

  // Direct connection (may fail on IPv6-only free projects)
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  const sqlPath = resolve("supabase/migrations/001_init_schema.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const connectionString = buildConnectionString();

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to Postgres…");
  await client.connect();
  console.log("Applying schema…");
  await client.query(sql);
  console.log("Schema applied successfully.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
