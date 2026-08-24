/**
 * Seed script — adds realistic proxy + phone data for all existing Firestore users.
 * Run with: npx tsx scripts/seed-proxies.ts
 *
 * What it does:
 *  - Reads all users from Firestore
 *  - Gives every salesman a full 9-proxy pool (3 fresh · 3 staging · 3 active)
 *  - Fills the global pool with 30 available UK proxies + 10 per other country
 *  - Adds a handful of flagged + expired proxies for realism
 *  - Mirrors the same logic for phone numbers
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, WriteBatch } from "firebase-admin/firestore";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COUNTRIES = ["UK", "FR", "BE", "DE"] as const;
type Country = (typeof COUNTRIES)[number];

const PROXY_PROVIDERS = [
  "Bright Data",
  "Oxylabs",
  "Smartproxy",
  "IPRoyal",
  "Webshare",
  "PacketStream",
];
const PHONE_PROVIDERS = ["SMSPVA", "OnlineSIM", "VirtualPhone", "Twilio", "SMSActivate"];

const COUNTRY_PHONE_PREFIX: Record<Country, string> = {
  UK: "+44",
  FR: "+33",
  BE: "+32",
  DE: "+49",
};

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ip(): string {
  const o = () => Math.floor(Math.random() * 254) + 1;
  return `${o()}.${o()}.${o()}.${o()}`;
}

function port(): string {
  return String(10000 + Math.floor(Math.random() * 50000));
}

function creds() {
  const id = Math.random().toString(36).slice(2, 9);
  return { username: `sc_${id}`, password: `Px${Math.random().toString(36).slice(2, 12)}!` };
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 864e5);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 864e5);
}

function phoneNumber(country: Country): string {
  const prefix = COUNTRY_PHONE_PREFIX[country];
  const body = Math.floor(Math.random() * 1e9).toString().padStart(9, "0");
  return `${prefix}${body}`;
}

// Firestore batch auto-flushes every 490 ops (limit is 500)
class SafeBatch {
  private batches: WriteBatch[] = [];
  private current: WriteBatch;
  private opCount = 0;
  private total = 0;

  constructor() {
    this.current = db.batch();
    this.batches.push(this.current);
  }

  private bump() {
    this.opCount++;
    this.total++;
    if (this.opCount >= 490) {
      this.current = db.batch();
      this.batches.push(this.current);
      this.opCount = 0;
    }
  }

  set(ref: FirebaseFirestore.DocumentReference, data: object) {
    this.current.set(ref, data);
    this.bump();
  }

  get count() {
    return this.total;
  }

  async commit() {
    for (const b of this.batches) await b.commit();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding proxy + phone data…\n");

  // Fetch all existing users
  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    console.error("❌  No users found in Firestore. Run the create-users script first.");
    process.exit(1);
  }

  const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() } as Record<string, string> & { uid: string }));
  const salesmen = allUsers.filter((u) => u.role === "salesman");
  const admins = allUsers.filter((u) => u.role === "admin" || u.role === "manager");
  const batchImporterId = admins[0]?.uid ?? allUsers[0].uid;

  console.log(`Found ${allUsers.length} users (${salesmen.length} salesmen)`);
  salesmen.forEach((s) => console.log(`  · ${s.name ?? s.email} [${s.uid}]`));
  console.log();

  const batch = new SafeBatch();

  // ── Import batch reference ─────────────────────────────────────────────────
  const batchRef = db.collection("importBatches").doc();
  batch.set(batchRef, {
    type: "proxy",
    importedBy: batchImporterId,
    importedAt: FieldValue.serverTimestamp(),
    rawFileName: "seed-proxies-bulk.csv",
    createdAt: FieldValue.serverTimestamp(),
  });

  const phoneBatchRef = db.collection("importBatches").doc();
  batch.set(phoneBatchRef, {
    type: "phone",
    importedBy: batchImporterId,
    importedAt: FieldValue.serverTimestamp(),
    rawFileName: "seed-phones-bulk.csv",
    createdAt: FieldValue.serverTimestamp(),
  });

  let proxyCount = 0;
  let phoneCount = 0;

  // ── Per-salesman: full 9-proxy pool ───────────────────────────────────────
  console.log("Building 9-proxy pools for salesmen…");

  const POOL_LANES = [
    {
      lane: "active",
      stagingDone: false,
      notes: "",
      // 1 of the 3 active proxies will be a recently-banned one
    },
    { lane: "staging", stagingDone: true, notes: "" },   // accounts ready
    { lane: "staging", stagingDone: false, notes: "" },  // still setting up
    { lane: "staging", stagingDone: false, notes: "" },  // still setting up
    { lane: "fresh", stagingDone: false, notes: "" },
    { lane: "fresh", stagingDone: false, notes: "" },
    { lane: "fresh", stagingDone: false, notes: "" },
  ];

  // Active proxies for each salesman (3 active)
  const ACTIVE_SLOTS = [
    { lane: "active", stagingDone: false, notes: "", daysLeft: 18, ago: 12 },
    { lane: "active", stagingDone: false, notes: "", daysLeft: 9, ago: 21 },
    { lane: "active", stagingDone: false, notes: "", daysLeft: 5, ago: 25 },
  ];
  const STAGING_SLOTS = [
    { lane: "staging", stagingDone: true, notes: "", daysLeft: 22, ago: 8 },
    { lane: "staging", stagingDone: false, notes: "", daysLeft: 26, ago: 4 },
    { lane: "staging", stagingDone: false, notes: "", daysLeft: 28, ago: 2 },
  ];
  const FRESH_SLOTS = [
    { lane: "fresh", stagingDone: false, notes: "", daysLeft: 29, ago: 1 },
    { lane: "fresh", stagingDone: false, notes: "", daysLeft: 30, ago: 0 },
    { lane: "fresh", stagingDone: false, notes: "", daysLeft: 30, ago: 0 },
  ];

  // One banned proxy per salesman (flagged, in active lane)
  const BANNED_SLOT = {
    lane: "active", status: "flagged",
    notes: "[BANNED] Vinted account was flagged by the platform",
    daysLeft: 12, ago: 18,
  };

  for (const salesman of salesmen) {
    const country: Country = "UK"; // UK pool as requested

    // Active
    for (const slot of ACTIVE_SLOTS) {
      const ref = db.collection("proxies").doc();
      batch.set(ref, {
        ...creds(),
        country,
        host: ip(),
        port: port(),
        provider: rand(PROXY_PROVIDERS),
        purchasedAt: daysAgo(slot.ago + 3),
        expiresAt: daysFromNow(slot.daysLeft),
        status: "assigned",
        assignedTo: salesman.uid,
        assignedAt: daysAgo(slot.ago),
        lane: slot.lane,
        stagingDone: slot.stagingDone,
        batchId: batchRef.id,
        notes: slot.notes,
        createdAt: FieldValue.serverTimestamp(),
      });
      proxyCount++;
    }

    // Staging
    for (const slot of STAGING_SLOTS) {
      const ref = db.collection("proxies").doc();
      batch.set(ref, {
        ...creds(),
        country,
        host: ip(),
        port: port(),
        provider: rand(PROXY_PROVIDERS),
        purchasedAt: daysAgo(slot.ago + 3),
        expiresAt: daysFromNow(slot.daysLeft),
        status: "assigned",
        assignedTo: salesman.uid,
        assignedAt: daysAgo(slot.ago),
        lane: slot.lane,
        stagingDone: slot.stagingDone,
        batchId: batchRef.id,
        notes: slot.notes,
        createdAt: FieldValue.serverTimestamp(),
      });
      proxyCount++;
    }

    // Fresh
    for (const slot of FRESH_SLOTS) {
      const ref = db.collection("proxies").doc();
      batch.set(ref, {
        ...creds(),
        country,
        host: ip(),
        port: port(),
        provider: rand(PROXY_PROVIDERS),
        purchasedAt: daysAgo(slot.ago + 1),
        expiresAt: daysFromNow(slot.daysLeft),
        status: "assigned",
        assignedTo: salesman.uid,
        assignedAt: daysAgo(slot.ago),
        lane: slot.lane,
        stagingDone: slot.stagingDone,
        batchId: batchRef.id,
        notes: slot.notes,
        createdAt: FieldValue.serverTimestamp(),
      });
      proxyCount++;
    }

    // Banned proxy (flagged but still visible)
    const bannedRef = db.collection("proxies").doc();
    batch.set(bannedRef, {
      ...creds(),
      country,
      host: ip(),
      port: port(),
      provider: rand(PROXY_PROVIDERS),
      purchasedAt: daysAgo(BANNED_SLOT.ago + 3),
      expiresAt: daysFromNow(BANNED_SLOT.daysLeft),
      status: BANNED_SLOT.status,
      assignedTo: salesman.uid,
      assignedAt: daysAgo(BANNED_SLOT.ago),
      lane: BANNED_SLOT.lane,
      stagingDone: false,
      batchId: batchRef.id,
      notes: BANNED_SLOT.notes,
      createdAt: FieldValue.serverTimestamp(),
    });
    proxyCount++;

    console.log(`  ✓ ${salesman.name ?? salesman.email}: 9 pool proxies + 1 banned`);

    // Phone pool: 3 active, 3 staging, 3 fresh for the salesman
    const phoneSlots = [
      { lane: "active", daysLeft: 15 },
      { lane: "active", daysLeft: 7 },
      { lane: "active", daysLeft: 20 },
      { lane: "staging", daysLeft: 25 },
      { lane: "staging", daysLeft: 28 },
      { lane: "staging", daysLeft: 30 },
      { lane: "fresh", daysLeft: 30 },
      { lane: "fresh", daysLeft: 30 },
      { lane: "fresh", daysLeft: 29 },
    ];
    for (const slot of phoneSlots) {
      const pRef = db.collection("phoneNumbers").doc();
      const ago = 30 - slot.daysLeft;
      batch.set(pRef, {
        country,
        number: phoneNumber(country),
        provider: rand(PHONE_PROVIDERS),
        purchasedAt: daysAgo(ago + 2),
        expiresAt: daysFromNow(slot.daysLeft),
        status: "assigned",
        assignedTo: salesman.uid,
        assignedAt: daysAgo(ago),
        lane: slot.lane,
        batchId: phoneBatchRef.id,
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      phoneCount++;
    }
  }

  // ── Global pool: available proxies (unassigned) ────────────────────────────
  console.log("\nFilling global available pool…");

  const INVENTORY: Array<{ country: Country; count: number; daysLeft: number }> = [
    // Big UK pool (as the user mentioned 100 UK proxies)
    { country: "UK", count: 35, daysLeft: 30 },
    { country: "UK", count: 20, daysLeft: 20 },
    { country: "UK", count: 10, daysLeft: 10 },
    // Other countries
    { country: "FR", count: 12, daysLeft: 30 },
    { country: "FR", count: 8, daysLeft: 15 },
    { country: "BE", count: 10, daysLeft: 30 },
    { country: "BE", count: 5, daysLeft: 12 },
    { country: "DE", count: 10, daysLeft: 30 },
    { country: "DE", count: 5, daysLeft: 8 },
  ];

  for (const group of INVENTORY) {
    for (let i = 0; i < group.count; i++) {
      const purchasedAgo = (30 - group.daysLeft) + Math.floor(Math.random() * 3);
      const ref = db.collection("proxies").doc();
      batch.set(ref, {
        ...creds(),
        country: group.country,
        host: ip(),
        port: port(),
        provider: rand(PROXY_PROVIDERS),
        purchasedAt: daysAgo(purchasedAgo),
        expiresAt: daysFromNow(group.daysLeft - Math.floor(Math.random() * 3)),
        status: "available",
        assignedTo: null,
        assignedAt: null,
        lane: null,
        stagingDone: false,
        batchId: batchRef.id,
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      proxyCount++;
    }
  }
  console.log(`  ✓ ${INVENTORY.reduce((a, g) => a + g.count, 0)} available proxies added`);

  // ── Available phone numbers (global pool) ─────────────────────────────────
  const PHONE_INVENTORY: Array<{ country: Country; count: number; daysLeft: number }> = [
    { country: "UK", count: 20, daysLeft: 30 },
    { country: "UK", count: 10, daysLeft: 15 },
    { country: "FR", count: 10, daysLeft: 30 },
    { country: "BE", count: 8, daysLeft: 30 },
    { country: "DE", count: 8, daysLeft: 30 },
  ];

  for (const group of PHONE_INVENTORY) {
    for (let i = 0; i < group.count; i++) {
      const purchasedAgo = (30 - group.daysLeft) + Math.floor(Math.random() * 3);
      const pRef = db.collection("phoneNumbers").doc();
      batch.set(pRef, {
        country: group.country,
        number: phoneNumber(group.country),
        provider: rand(PHONE_PROVIDERS),
        purchasedAt: daysAgo(purchasedAgo),
        expiresAt: daysFromNow(group.daysLeft),
        status: "available",
        assignedTo: null,
        assignedAt: null,
        lane: null,
        batchId: phoneBatchRef.id,
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      phoneCount++;
    }
  }
  console.log(`  ✓ ${PHONE_INVENTORY.reduce((a, g) => a + g.count, 0)} available phone numbers added`);

  // ── Expired proxies (for realism) ─────────────────────────────────────────
  for (const country of COUNTRIES) {
    for (let i = 0; i < 3; i++) {
      const ref = db.collection("proxies").doc();
      batch.set(ref, {
        ...creds(),
        country,
        host: ip(),
        port: port(),
        provider: rand(PROXY_PROVIDERS),
        purchasedAt: daysAgo(35),
        expiresAt: daysAgo(5 + i * 2),
        status: "expired",
        assignedTo: salesmen[0]?.uid ?? null,
        assignedAt: daysAgo(33),
        lane: "active",
        stagingDone: false,
        batchId: batchRef.id,
        notes: "",
        createdAt: FieldValue.serverTimestamp(),
      });
      proxyCount++;
    }
  }
  console.log(`  ✓ ${COUNTRIES.length * 3} expired proxies added`);

  // ── Commit everything ──────────────────────────────────────────────────────
  console.log(`\nCommitting ${batch.count} Firestore operations…`);
  await batch.commit();

  console.log(`
✅  Done!

  Proxies created : ${proxyCount}
  Phones created  : ${phoneCount}

  Each salesman now has:
    • 3 Active proxies  (live accounts)
    • 3 Staging proxies (1 marked done ✓, 2 still setting up)
    • 3 Fresh proxies   (brand new, no accounts yet)
    • 1 Banned proxy    (flagged — visible in pool for reference)

  Global pool:
    • ~65 available UK proxies ready to be assigned
    • ~40 available FR/BE/DE proxies
    • ~56 available phone numbers
`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
