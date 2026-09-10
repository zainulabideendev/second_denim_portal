/**
 * Match IPs from data/F.R ACCOUNTS .xlsx and assign Account User.
 * Faizan → Faizan shah, Ammar → Rana Ammar.
 *
 * Run: npx tsx scripts/sync-fr-sheet.ts
 */
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
const XLSX_PATH = resolve(process.cwd(), "data/F.R ACCOUNTS .xlsx");

const ALIASES: Record<string, string> = {
  faizan: "faizan shah",
  ammar: "rana ammar",
  abdullah: "abdullah malik",
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractHost(raw: string): string | null {
  const match = String(raw)
    .replace(/\(.*?\)/g, " ")
    .match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match ? match[1] : null;
}

type UserRec = { uid: string; name: string };

function resolveUser(sheetUser: string, users: UserRec[]): UserRec | null {
  const key = norm(sheetUser);
  if (!key) return null;
  const target = ALIASES[key] ?? key;
  return users.find((u) => norm(u.name) === target) ?? null;
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName =
    wb.SheetNames.find((n) => norm(n) === "accounts data") ||
    wb.SheetNames.find((n) => n.toLowerCase().includes("detail")) ||
    wb.SheetNames.find((n) => n.toLowerCase().includes("account")) ||
    wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  });
  console.log(`Using sheet: ${sheetName}`);

  const header = raw[0]?.map((c) => norm(String(c))) ?? [];
  const userIdx = header.findIndex((h) => h.includes("account user") || h.includes("account holder"));
  const ipIdx = header.findIndex((h) => h.includes("ip"));
  const nameIdx = 0;

  const colUser = userIdx >= 0 ? userIdx : 3;
  const colIp = ipIdx >= 0 ? ipIdx : 4;

  const usersSnap = await db.collection("users").get();
  const users: UserRec[] = usersSnap.docs.map((d) => ({
    uid: d.id,
    name: String(d.data().name ?? ""),
  }));

  const proxySnap = await db.collection("proxies").get();
  const frByHost = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of proxySnap.docs) {
    if (doc.data().country !== "FR") continue;
    const host = String(doc.data().host ?? "").trim();
    if (!host) continue;
    const list = frByHost.get(host) ?? [];
    list.push(doc);
    frByHost.set(host, list);
  }

  console.log(`France proxies in DB: ${[...frByHost.values()].flat().length}\n`);

  const stats = { assigned: 0, unmatchedIp: [] as string[], unmatchedUser: [] as string[] };

  for (const cols of raw.slice(1)) {
    const accountName = String(cols[nameIdx] ?? "").trim();
    const holder = String(cols[colUser] ?? "").trim();
    const host = extractHost(String(cols[colIp] ?? ""));
    if (!host) continue;

    const user = resolveUser(holder, users);
    if (!user) {
      stats.unmatchedUser.push(`${holder} (${accountName} / ${host})`);
      continue;
    }

    const proxies = frByHost.get(host);
    if (!proxies?.length) {
      stats.unmatchedIp.push(`${host} (${accountName} / ${holder})`);
      continue;
    }

    for (const proxy of proxies) {
      await proxy.ref.update({
        assignedTo: user.uid,
        assignedAt: new Date(),
        status: "assigned",
        lane: "active",
      });
      stats.assigned += 1;
      console.log(`  ${host} ${accountName} → ${user.name}`);
    }
  }

  console.log("\nDone");
  console.log(`  assigned: ${stats.assigned}`);
  if (stats.unmatchedUser.length) {
    console.log("  Account User not found:");
    for (const line of stats.unmatchedUser) console.log(`    - ${line}`);
  }
  if (stats.unmatchedIp.length) {
    console.log("  IPs not found as France proxies:");
    for (const line of stats.unmatchedIp) console.log(`    - ${line}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
