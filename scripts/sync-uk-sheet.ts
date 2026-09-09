/**
 * UK Accounts Data (.xlsx) → match proxies, activate Rest/Active,
 * save/sync emails, auto-create mobile IPs, assign sheet Account User.
 *
 * Run: npx tsx scripts/sync-uk-sheet.ts
 */
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";
import * as XLSX from "xlsx";

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

const XLSX_PATH = resolve(process.cwd(), "data/Inventory UK-London updated.xlsx");
const SHEET_NAME = "Accounts Data";
const ACTIVATE_STATUSES = new Set(["rest", "active"]);
const DEFAULT_PASSWORD = "00000";

/** Sheet Account User → users.name */
const ACCOUNT_USER_ALIASES: Record<string, string> = {
  faizan: "faizan shah",
  ammar: "rana ammar",
  umar: "umer imran",
  aali: "saif ulllah",
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractHost(raw: string): string | null {
  const cleaned = raw.replace(/\(.*?\)/g, " ").trim();
  const match = cleaned.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  if (!match) return null;
  const ip = match[1];
  if (ip.startsWith("0.0.0.") || ip.startsWith("00.")) return null;
  return ip;
}

function isMobileIp(raw: string): boolean {
  return raw.trim().toLowerCase() === "mobile";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "mobile";
}

function nextAutoHost(used: Set<string>): string {
  for (let i = 1; i < 250; i++) {
    const host = `10.20.30.${i}`;
    if (!used.has(host)) {
      used.add(host);
      return host;
    }
  }
  throw new Error("No auto IP left in 10.20.30.x");
}

type UserRec = { uid: string; name: string };

function resolveUser(sheetUser: string, users: UserRec[]): UserRec | null {
  const key = norm(sheetUser);
  if (!key) return null;
  const target = ACCOUNT_USER_ALIASES[key] ?? key;
  return users.find((u) => norm(u.name) === target) ?? null;
}

async function findEmailDoc(email: string) {
  const snap = await db.collection("emails").where("email", "==", email).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function upsertEmailAndSync(opts: {
  proxyId: string;
  email: string;
  password: string;
  notes: string;
  assignedTo: string | null;
}) {
  const now = FieldValue.serverTimestamp();
  const assignedAt = opts.assignedTo ? new Date() : null;
  let emailId: string;
  const existing = await findEmailDoc(opts.email);

  if (existing) {
    emailId = existing.id;
    await existing.ref.update({
      password: opts.password,
      notes: opts.notes || existing.data().notes || "",
      ...(opts.assignedTo
        ? { assignedTo: opts.assignedTo, assignedAt, status: "assigned" }
        : {}),
    });
  } else {
    const emailRef = db.collection("emails").doc();
    emailId = emailRef.id;
    await emailRef.set({
      email: opts.email,
      password: opts.password,
      status: opts.assignedTo ? "assigned" : "fresh",
      assignedTo: opts.assignedTo,
      assignedAt,
      notes: opts.notes,
      batchId: null,
      syncedProxyId: null,
      syncedAt: null,
      createdAt: now,
    });
  }

  const proxyRef = db.collection("proxies").doc(opts.proxyId);
  const emailRef = db.collection("emails").doc(emailId);
  const [proxyDoc, emailDoc] = await Promise.all([proxyRef.get(), emailRef.get()]);
  const proxyData = proxyDoc.data()!;
  const emailData = emailDoc.data()!;
  const batch = db.batch();

  if (proxyData.syncedEmailId && proxyData.syncedEmailId !== emailId) {
    batch.update(db.collection("emails").doc(proxyData.syncedEmailId), {
      syncedProxyId: null,
      syncedAt: null,
    });
  }
  if (emailData.syncedProxyId && emailData.syncedProxyId !== opts.proxyId) {
    batch.update(db.collection("proxies").doc(emailData.syncedProxyId), {
      syncedEmailId: null,
      syncedAt: null,
    });
  }

  batch.update(proxyRef, { syncedEmailId: emailId, syncedAt: now });
  batch.update(emailRef, { syncedProxyId: opts.proxyId, syncedAt: now });
  await batch.commit();

  return { emailId, created: !existing };
}

async function createMobileProxy(opts: { host: string; name: string }) {
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ref = db.collection("proxies").doc();
  await ref.set({
    country: "UK",
    host: opts.host,
    port: "8080",
    username: "mobile",
    password: DEFAULT_PASSWORD,
    provider: "uk-sheet-mobile",
    purchasedAt: now,
    expiresAt: expires,
    status: "active",
    assignedTo: null,
    assignedAt: null,
    batchId: null,
    notes: `UK sheet mobile: ${opts.name}`,
    syncedEmailId: null,
    syncedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function assignProxy(proxyId: string, user: UserRec | null) {
  const now = new Date();
  if (user) {
    await db.collection("proxies").doc(proxyId).update({
      status: "assigned",
      assignedTo: user.uid,
      assignedAt: now,
      lane: "active",
    });
  } else {
    await db.collection("proxies").doc(proxyId).update({
      status: "active",
    });
  }
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

  type SheetRow = {
    name: string;
    status: string;
    accountUser: string;
    ipRaw: string;
    host: string | null;
    mobile: boolean;
    email: string;
    password: string;
  };

  const sheetRows: SheetRow[] = [];
  for (const cols of raw.slice(1)) {
    const name = String(cols[0] ?? "").trim();
    const status = String(cols[1] ?? "").trim();
    const accountUser = String(cols[2] ?? "").trim();
    const ipRaw = String(cols[3] ?? "").trim();
    const email = String(cols[4] ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const password = String(cols[5] ?? "").trim();
    if (!status && !accountUser && !ipRaw && !email) continue;
    const mobile = isMobileIp(ipRaw);
    const host = mobile ? null : extractHost(ipRaw);
    if (!mobile && !host) continue;
    sheetRows.push({ name, status, accountUser, ipRaw, host, mobile, email, password });
  }

  const usersSnap = await db.collection("users").get();
  const users: UserRec[] = usersSnap.docs.map((d) => ({
    uid: d.id,
    name: String(d.data().name ?? ""),
  }));

  const proxySnap = await db.collection("proxies").get();
  const usedHosts = new Set<string>();
  const ukByHost = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();

  for (const doc of proxySnap.docs) {
    const data = doc.data();
    const host = String(data.host ?? "").trim();
    if (host) usedHosts.add(host);
    if (data.country !== "UK" || !host) continue;
    const list = ukByHost.get(host) ?? [];
    list.push(doc);
    ukByHost.set(host, list);
  }

  console.log(`Sheet Rest/Active-capable rows: ${sheetRows.length}`);
  console.log(`UK proxies in DB: ${[...ukByHost.values()].flat().length}`);

  const stats = {
    assigned: 0,
    activated: 0,
    emailsCreated: 0,
    emailsUpdated: 0,
    mobileCreated: 0,
    userMissing: [] as string[],
    unmatchedIps: [] as string[],
  };

  for (const row of sheetRows) {
    if (!ACTIVATE_STATUSES.has(row.status.toLowerCase())) continue;

    const user = resolveUser(row.accountUser, users);
    if (row.accountUser && !user) {
      stats.userMissing.push(`${row.accountUser} (${row.name || row.host})`);
    }

    const password = row.password || DEFAULT_PASSWORD;
    const hasEmail = isValidEmail(row.email);
    const emailAddr = hasEmail
      ? row.email
      : `${slug(row.name)}.${Date.now().toString().slice(-4)}@uk-mobile.local`;

    let proxyId: string | null = null;

    if (row.mobile) {
      if (hasEmail) {
        const existingEmail = await findEmailDoc(row.email);
        const syncedId = existingEmail?.data()?.syncedProxyId as string | undefined;
        if (syncedId) proxyId = syncedId;
      }
      if (!proxyId) {
        const host = nextAutoHost(usedHosts);
        proxyId = await createMobileProxy({ host, name: row.name || emailAddr });
        stats.mobileCreated += 1;
        console.log(`  mobile create ${row.name || "(blank)"} → ${host}`);
      }
    } else {
      const proxies = ukByHost.get(row.host!) ?? [];
      if (!proxies.length) {
        stats.unmatchedIps.push(`${row.host} (${row.status} / ${row.name} / ${row.accountUser})`);
        continue;
      }
      proxyId = proxies[0].id;
    }

    await assignProxy(proxyId, user);
    if (user) stats.assigned += 1;
    else stats.activated += 1;

    if (hasEmail || row.mobile) {
      const result = await upsertEmailAndSync({
        proxyId,
        email: hasEmail ? row.email : emailAddr,
        password,
        notes: `UK sheet: ${row.name}`,
        assignedTo: user?.uid ?? null,
      });
      if (result.created) stats.emailsCreated += 1;
      else stats.emailsUpdated += 1;
    }

    console.log(
      `  ${row.host ?? "mobile"} → ${user ? `assigned ${user.name}` : "active (no user)"}` +
        (hasEmail || row.mobile ? ` + ${hasEmail ? row.email : emailAddr}` : " (no email)")
    );
  }

  console.log("\nDone");
  console.log(`  assigned to users: ${stats.assigned}`);
  console.log(`  set active (no user match): ${stats.activated}`);
  console.log(`  mobile proxies created: ${stats.mobileCreated}`);
  console.log(`  emails created: ${stats.emailsCreated}`);
  console.log(`  emails updated: ${stats.emailsUpdated}`);
  if (stats.userMissing.length) {
    console.log("  unmatched Account User names:");
    for (const line of [...new Set(stats.userMissing)]) console.log(`    - ${line}`);
  }
  if (stats.unmatchedIps.length) {
    console.log("  Rest/Active IPs not in UK proxies:");
    for (const line of stats.unmatchedIps) console.log(`    - ${line}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
