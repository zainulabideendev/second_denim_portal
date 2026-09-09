/**
 * Sets unsynced proxies (no synced email) to status "flagged" (Banned).
 *
 * Run: npx tsx scripts/set-unsynced-proxies-banned.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";

config({ path: ".env" });

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

function isSynced(data: FirebaseFirestore.DocumentData): boolean {
  const id = data.syncedEmailId;
  return typeof id === "string" && id.trim() !== "";
}

async function main() {
  const snap = await db.collection("proxies").get();
  const unsynced = snap.docs.filter((d) => !isSynced(d.data()));
  console.log(
    `Found ${snap.size} proxies, ${unsynced.length} unsynced → status=flagged`
  );

  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of unsynced) {
    batch.update(doc.ref, { status: "flagged" });
    ops += 1;
    updated += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  console.log(`✓ ${updated} unsynced proxies set to flagged (Banned)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
