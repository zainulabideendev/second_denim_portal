/**
 * Match IPs from data/ammar_sheet.xlsx (UK / FR / BE) to existing proxies.
 * Only updates assignedTo → Rana Ammar. Does not create proxies or change emails.
 *
 * Run: npx tsx scripts/sync-ammar-sheet.ts
 */
import { resolve } from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";
import * as XLSX from "xlsx";

type Country = "UK" | "BE" | "FR";

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
const XLSX_PATH = resolve(process.cwd(), "data/ammar_sheet.xlsx");
const OWNER_NAME = "rana ammar";
const COUNTRIES = new Set<Country>(["UK", "BE", "FR"]);

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractHost(raw: string): string | null {
  const cleaned = String(raw).replace(/\(.*?\)/g, " ").trim();
  const match = cleaned.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  if (!match) return null;
  const ip = match[1];
  if (ip.startsWith("0.0.0.") || ip.startsWith("00.")) return null;
  return ip;
}

function detectSection(cell: string): Country | null {
  const v = norm(cell);
  if (v === "uk account" || v.startsWith("uk account ")) return "UK";
  if (v === "france account" || v.startsWith("france account ")) return "FR";
  if (v === "belgium account" || v.startsWith("belgium account ")) return "BE";
  return null;
}

function isHeaderRow(cols: unknown[]): boolean {
  return norm(String(cols[1] ?? "")) === "name" && norm(String(cols[2] ?? "")).startsWith("ip");
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const sheetHosts = new Map<string, Country>();
  let section: Country | null = null;

  for (const cols of raw) {
    const first = String(cols[0] ?? "");
    const maybe = detectSection(first);
    if (maybe) {
      section = maybe;
      continue;
    }
    if (isHeaderRow(cols)) continue;
    if (!section) continue;

    const host = extractHost(String(cols[2] ?? ""));
    if (!host) continue;
    sheetHosts.set(host, section);
  }

  const usersSnap = await db.collection("users").get();
  const owner = usersSnap.docs
    .map((d) => ({ uid: d.id, name: String(d.data().name ?? "") }))
    .find((u) => norm(u.name) === OWNER_NAME);
  if (!owner) throw new Error('User "Rana Ammar" not found');

  const proxySnap = await db.collection("proxies").get();
  const ukBeFr = proxySnap.docs.filter((d) => COUNTRIES.has(d.data().country as Country));

  console.log(`Sheet IPs: ${sheetHosts.size}`);
  console.log(`UK/BE/FR proxies in DB: ${ukBeFr.length}`);
  console.log(`Assign matches to ${owner.name} (${owner.uid})\n`);

  let matched = 0;
  let already = 0;
  const unmatched: string[] = [];

  for (const [host, country] of sheetHosts) {
    const docs = ukBeFr.filter((d) => String(d.data().host ?? "").trim() === host);
    if (!docs.length) {
      unmatched.push(`${country} ${host}`);
      continue;
    }
    for (const doc of docs) {
      const data = doc.data();
      if (data.assignedTo === owner.uid && data.status === "assigned") {
        already += 1;
        console.log(`  ${data.country} ${host} already assigned to Rana Ammar`);
        continue;
      }
      await doc.ref.update({
        assignedTo: owner.uid,
        assignedAt: new Date(),
        status: "assigned",
        lane: "active",
      });
      matched += 1;
      console.log(
        `  ${data.country} ${host} → Rana Ammar (was ${data.assignedTo ?? "unassigned"} / ${data.status})`
      );
    }
  }

  console.log("\nDone");
  console.log(`  newly assigned: ${matched}`);
  console.log(`  already assigned: ${already}`);
  if (unmatched.length) {
    console.log("  sheet IPs not in DB (skipped, not created):");
    for (const line of unmatched) console.log(`    - ${line}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
