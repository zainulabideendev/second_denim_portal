/**
 * Push .env.local keys to Vercel (Production + Preview).
 *
 * Usage:
 *   npx vercel login
 *   npx vercel link
 *   node scripts/push-vercel-env.mjs
 *
 * Requires: vercel CLI logged in and project linked (.vercel/project.json).
 */
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

const KEYS = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "AUTH_COOKIE_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_BASE_URL",
];

if (!existsSync(ENV_PATH)) {
  console.error("Missing .env.local");
  process.exit(1);
}

if (!existsSync(resolve(ROOT, ".vercel/project.json"))) {
  console.error("Project not linked. Run: npx vercel link");
  process.exit(1);
}

const raw = readFileSync(ENV_PATH, "utf8");
const values = {};
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  values[key] = val;
}

const environments = ["production", "preview", "development"];

for (const key of KEYS) {
  if (!(key in values)) {
    console.warn(`skip ${key} (not in .env.local)`);
    continue;
  }

  let value = values[key];
  if (key === "NEXT_PUBLIC_BASE_URL" && value.includes("localhost")) {
    console.warn(
      `NOTE: ${key} is still localhost (${value}). Update it on Vercel to your production URL after push.`
    );
  }

  for (const env of environments) {
    console.log(`Adding ${key} → ${env}...`);
    const result = spawnSync(
      "npx",
      ["vercel", "env", "add", key, env, "--force"],
      {
        cwd: ROOT,
        input: value,
        encoding: "utf8",
        shell: true,
      }
    );
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout || `Failed: ${key} (${env})`);
      process.exit(result.status ?? 1);
    }
  }
}

console.log("\nDone. Redeploy so NEXT_PUBLIC_* vars are baked into the build:");
console.log("  npx vercel --prod");
