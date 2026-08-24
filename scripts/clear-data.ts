/**
 * Deletes all Firestore data except users.
 *
 * Run: npx tsx scripts/clear-data.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";

config({ path: ".env.local" });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

const COLLECTIONS_TO_CLEAR = [
  "proxies",
  "emails",
  "phoneNumbers",
  "userPools",
  "importBatches",
  "requests",
  "notifications",
  "auditLog",
] as const;

async function deleteCollection(name: string) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`\r  ${name}: ${deleted} deleted…`);
  }
  console.log(`\r  ✓ ${name}: ${deleted} documents deleted`);
}

async function main() {
  console.log("🗑️  Clearing Firestore (keeping users only)…\n");
  for (const name of COLLECTIONS_TO_CLEAR) {
    await deleteCollection(name);
  }
  console.log("\n✅  Done. Only the users collection was kept.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
