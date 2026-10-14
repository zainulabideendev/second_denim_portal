/**
 * Undo auto-assigned backup-lane proxies:
 * - Unlink synced emails (and release email assignment)
 * - Set proxy status to fresh, clear user assignment / lane
 *
 * Run: npx tsx scripts/reset-backup-proxies-to-fresh.ts
 * Dry:  npx tsx scripts/reset-backup-proxies-to-fresh.ts --dry-run
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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
const dryRun = process.argv.includes("--dry-run");

function isBackupLane(lane: unknown): boolean {
  // Current model: anything not explicitly "active" is backup (incl. fresh/staging legacy)
  return lane !== "active";
}

async function main() {
  const snap = await db.collection("proxies").get();

  const targets = snap.docs.filter((doc) => {
    const d = doc.data();
    if (d.status !== "assigned") return false;
    if (!d.assignedTo) return false;
    return isBackupLane(d.lane);
  });

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Found ${targets.length} assigned backup-lane proxies to reset…`
  );

  let proxiesReset = 0;
  let emailsUnlinked = 0;
  let batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async (force = false) => {
    if (ops === 0) return;
    if (!force && ops < 400) return;
    if (!dryRun) await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const doc of targets) {
    const data = doc.data();
    const emailId =
      data.syncedEmailId != null ? String(data.syncedEmailId).trim() : "";

    if (emailId) {
      batch.update(db.collection("emails").doc(emailId), {
        syncedProxyId: null,
        syncedAt: null,
        assignedTo: null,
        assignedAt: null,
        status: "fresh",
      });
      ops += 1;
      emailsUnlinked += 1;
      await commitIfNeeded();
    }

    batch.update(doc.ref, {
      status: "fresh",
      assignedTo: null,
      assignedAt: null,
      lane: null,
      stagingDone: false,
      accountsCreated: false,
      restricted: false,
      syncedEmailId: null,
      syncedAt: null,
      notes: FieldValue.delete(),
    });
    ops += 1;
    proxiesReset += 1;
    await commitIfNeeded();

    if (proxiesReset % 25 === 0) {
      process.stdout.write(`\r  ${proxiesReset}/${targets.length}…`);
    }
  }

  await commitIfNeeded(true);

  console.log(
    `\r  ✓ Proxies reset to fresh: ${proxiesReset}` +
      `\n  ✓ Emails unlinked/released: ${emailsUnlinked}` +
      (dryRun ? "\n  (dry run — no writes)" : "")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
