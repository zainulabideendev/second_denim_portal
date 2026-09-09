/**
 * Sets every proxy document status to "active".
 *
 * Run: npx tsx scripts/set-proxies-active.ts
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

async function main() {
  const snap = await db.collection("proxies").get();
  console.log(`Updating ${snap.size} proxies to status=active…`);

  let updated = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: "active" });
    ops += 1;
    updated += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
      process.stdout.write(`\r  ${updated} updated…`);
    }
  }

  if (ops > 0) await batch.commit();
  console.log(`\r  ✓ ${updated} proxies set to active`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
