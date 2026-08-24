/**
 * Seed script — populates Firestore with realistic fake data for dev/testing.
 * Run with: npx tsx scripts/seed.ts
 * Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth();

const COUNTRIES = ["FR", "BE", "UK", "DE"] as const;
type Country = (typeof COUNTRIES)[number];

const PROVIDERS = ["Bright Data", "Oxylabs", "Smartproxy", "IPRoyal", "Webshare"];
const PHONE_PROVIDERS = ["SMSPVA", "OnlineSIM", "VirtualPhone", "Twilio"];

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function createUser(
  email: string,
  password: string,
  name: string,
  role: "admin" | "manager" | "salesman",
  country?: Country
) {
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`  ↳ Auth user already exists: ${email}`);
  } catch {
    const authUser = await auth.createUser({ email, password, displayName: name });
    uid = authUser.uid;
    console.log(`  ↳ Created auth user: ${email}`);
  }

  await db.collection("users").doc(uid).set(
    {
      name,
      email,
      role,
      ...(country ? { country } : {}),
      activeProxyLimit: role === "salesman" ? 4 : 20,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return uid;
}

async function seed() {
  console.log("🌱 Seeding Firestore...\n");

  // ── Users ────────────────────────────────────────────────────────────────────
  console.log("Creating users...");
  const adminUid = await createUser(
    "admin@secondchance.test",
    "Admin123!",
    "Admin User",
    "admin"
  );
  const managerUid = await createUser(
    "manager@secondchance.test",
    "Manager123!",
    "Sophie Martin",
    "manager"
  );
  const salesman1Uid = await createUser(
    "salesman1@secondchance.test",
    "Sales123!",
    "Omar Khalid",
    "salesman"
  );
  const salesman2Uid = await createUser(
    "salesman2@secondchance.test",
    "Sales123!",
    "Laila Dubois",
    "salesman"
  );

  const userUids = [adminUid, managerUid, salesman1Uid, salesman2Uid];
  console.log(`  ✓ ${userUids.length} users ready\n`);

  // ── Import batch references ───────────────────────────────────────────────
  const proxyBatchRef = db.collection("importBatches").doc();
  const phoneBatchRef = db.collection("importBatches").doc();

  // ── Proxies ───────────────────────────────────────────────────────────────
  console.log("Creating proxies...");
  const proxyBatch = db.batch();

  proxyBatch.set(proxyBatchRef, {
    type: "proxy",
    importedBy: managerUid,
    importedAt: FieldValue.serverTimestamp(),
    count: 24,
    rawFileName: "seed-proxies.csv",
    createdAt: FieldValue.serverTimestamp(),
  });

  const proxiesToCreate: Array<{
    country: Country;
    status: string;
    assignedTo: string | null;
    daysLeft: number;
    purchasedDaysAgo: number;
  }> = [];

  // 4 per country, mix of statuses
  for (const country of COUNTRIES) {
    proxiesToCreate.push(
      { country, status: "available", assignedTo: null, daysLeft: 25, purchasedDaysAgo: 5 },
      { country, status: "available", assignedTo: null, daysLeft: 15, purchasedDaysAgo: 15 },
      { country, status: "assigned", assignedTo: salesman1Uid, daysLeft: 5, purchasedDaysAgo: 25 },
      { country, status: "assigned", assignedTo: salesman2Uid, daysLeft: 3, purchasedDaysAgo: 27 },
      { country, status: "expired", assignedTo: null, daysLeft: -5, purchasedDaysAgo: 35 },
      { country, status: "flagged", assignedTo: salesman1Uid, daysLeft: 8, purchasedDaysAgo: 22 }
    );
  }

  const proxyIds: string[] = [];
  for (const p of proxiesToCreate) {
    const ref = db.collection("proxies").doc();
    proxyIds.push(ref.id);
    const octet = () => Math.floor(Math.random() * 254) + 1;
    proxyBatch.set(ref, {
      country: p.country,
      host: `${octet()}.${octet()}.${octet()}.${octet()}`,
      port: String(10000 + Math.floor(Math.random() * 50000)),
      username: `user_${Math.random().toString(36).slice(2, 8)}`,
      password: `pass_${Math.random().toString(36).slice(2, 12)}`,
      provider: randItem(PROVIDERS),
      purchasedAt: daysAgo(p.purchasedDaysAgo),
      expiresAt: p.daysLeft >= 0 ? daysFromNow(p.daysLeft) : daysAgo(Math.abs(p.daysLeft)),
      status: p.status,
      assignedTo: p.assignedTo,
      assignedAt: p.assignedTo ? daysAgo(p.purchasedDaysAgo - 1) : null,
      batchId: proxyBatchRef.id,
      notes: p.status === "flagged" ? "[FLAGGED] Proxy not responding" : "",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await proxyBatch.commit();
  console.log(`  ✓ ${proxiesToCreate.length} proxies created\n`);

  // ── Phone Numbers ─────────────────────────────────────────────────────────
  console.log("Creating phone numbers...");
  const phoneBatch = db.batch();

  phoneBatch.set(phoneBatchRef, {
    type: "phone",
    importedBy: managerUid,
    importedAt: FieldValue.serverTimestamp(),
    count: 16,
    rawFileName: "seed-phones.csv",
    createdAt: FieldValue.serverTimestamp(),
  });

  const countryPrefixes: Record<Country, string> = {
    FR: "+33",
    BE: "+32",
    UK: "+44",
    DE: "+49",
  };

  for (const country of COUNTRIES) {
    for (let i = 0; i < 4; i++) {
      const ref = db.collection("phoneNumbers").doc();
      const isAssigned = i < 2;
      const assignedTo = i === 0 ? salesman1Uid : i === 1 ? salesman2Uid : null;
      const daysLeft = isAssigned ? 10 - i * 3 : 20 + i * 5;
      phoneBatch.set(ref, {
        country,
        number: `${countryPrefixes[country]}6${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, "0")}`,
        provider: randItem(PHONE_PROVIDERS),
        purchasedAt: daysAgo(30 - daysLeft),
        expiresAt: daysFromNow(daysLeft),
        status: isAssigned ? "assigned" : "available",
        assignedTo,
        assignedAt: isAssigned ? daysAgo(28 - daysLeft) : null,
        batchId: phoneBatchRef.id,
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await phoneBatch.commit();
  console.log("  ✓ 16 phone numbers created\n");

  // ── Requests ──────────────────────────────────────────────────────────────
  console.log("Creating sample requests...");
  const reqBatch = db.batch();

  // Pending request from salesman1 (already at limit)
  const pendingReqRef = db.collection("requests").doc();
  reqBatch.set(pendingReqRef, {
    type: "proxy",
    requestedBy: salesman1Uid,
    country: "FR",
    reason: "Need an additional proxy for the new product launch campaign.",
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    fulfilledItemId: null,
    createdAt: daysAgo(1),
  });

  // Fulfilled request for salesman2
  const fulfilledReqRef = db.collection("requests").doc();
  reqBatch.set(fulfilledReqRef, {
    type: "phone",
    requestedBy: salesman2Uid,
    country: "DE",
    reason: "DE account verification requires extra number.",
    status: "fulfilled",
    reviewedBy: managerUid,
    reviewedAt: daysAgo(5),
    fulfilledItemId: proxyIds[0],
    createdAt: daysAgo(6),
  });

  await reqBatch.commit();
  console.log("  ✓ 2 sample requests created\n");

  console.log("✅ Seed complete!\n");
  console.log("Test accounts:");
  console.log("  admin@secondchance.test   / Admin123!   (Admin)");
  console.log("  manager@secondchance.test / Manager123! (Manager)");
  console.log("  salesman1@secondchance.test / Sales123! (Salesman — Omar)");
  console.log("  salesman2@secondchance.test / Sales123! (Salesman — Laila)");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
