/**
 * Import any Proxy-Cheap DE-account proxies that are missing from Firestore
 * (previously skipped when API countryCode was BE/IT/etc.).
 *
 * Run: npx tsx scripts/import-missing-de-proxies.ts
 */
import { config } from "dotenv";

config({ path: ".env" });

async function main() {
  const { syncProxyCheapFromApi } = await import("../src/lib/proxy-cheap-sync");
  const result = await syncProxyCheapFromApi({ actorUid: "manual-import-de" });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
