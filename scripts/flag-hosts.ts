/**
 * Flag specific proxy hosts as banned.
 *
 * Run: npx tsx scripts/flag-hosts.ts
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

const HOSTS = [
  "92.113.76.82",
  "92.113.76.17",
  "81.18.63.23",
  "81.18.63.116",
  "92.113.178.89",
];

async function main() {
  const snap = await db.collection("proxies").get();
  const matches = snap.docs.filter((d) => HOSTS.includes(String(d.data().host)));

  console.log("Requested hosts:", HOSTS.join(", "));
  console.log(`Matched ${matches.length} document(s):`);

  const found = new Set(matches.map((d) => String(d.data().host)));
  for (const host of HOSTS) {
    const docs = matches.filter((d) => String(d.data().host) === host);
    if (docs.length === 0) {
      console.log(`  ✗ ${host} — not found`);
    } else {
      for (const d of docs) {
        const data = d.data();
        console.log(
          `  • ${host}  country=${data.country}  status=${data.status}  id=${d.id}`
        );
      }
    }
  }

  if (matches.length === 0) return;

  let batch = db.batch();
  let ops = 0;
  for (const doc of matches) {
    batch.update(doc.ref, { status: "flagged" });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  for (const host of HOSTS) {
    if (!found.has(host)) {
      // already logged
    }
  }

  console.log(`\n✓ ${matches.length} proxy(ies) set to flagged (Banned)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
