/**
 * Creates the initial admin and salesman users.
 * Run with: npx tsx scripts/create-users.ts
 */

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { config } from "dotenv";

config({ path: ".env.local" });

// ─── Validate env ─────────────────────────────────────────────────────────────

const missing = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"].filter(
  (k) => !process.env[k] || process.env[k]!.startsWith("REPLACE_WITH")
);
if (missing.length) {
  console.error("❌  Missing env vars:", missing.join(", "));
  process.exit(1);
}

// ─── Init Admin SDK ───────────────────────────────────────────────────────────

let app: App;
if (!getApps().length) {
  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
} else {
  app = getApps()[0];
}

const db = getFirestore(app);
const auth = getAuth(app);

// ─── Users ────────────────────────────────────────────────────────────────────

const USERS = [
  {
    email: "junaidhassan.thedev@gmail.com",
    password: "secondchance@3344",
    name: "Junaid Hassan",
    role: "admin" as const,
    activeProxyLimit: 20,
  },
  {
    email: "abdullah@secondchance.com",
    password: "secondchance@3344",
    name: "Abdullah",
    role: "salesman" as const,
    activeProxyLimit: 4,
  },
  {
    email: "amar@secondchance.com",
    password: "secondchance@3344",
    name: "Amar",
    role: "salesman" as const,
    activeProxyLimit: 4,
  },
  {
    email: "faizan.imran@secondchance.com",
    password: "secondchance@3344",
    name: "Faizan Imran",
    role: "salesman" as const,
    activeProxyLimit: 4,
  },
  {
    email: "imran@secondchance.com",
    password: "secondchance@3344",
    name: "Imran",
    role: "salesman" as const,
    activeProxyLimit: 4,
  },
  {
    email: "abdullah.khan@secondchance.com",
    password: "secondchance@3344",
    name: "Abdullah Khan",
    role: "salesman" as const,
    activeProxyLimit: 4,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function upsertUser(u: (typeof USERS)[number]) {
  const { email, password, name, role, activeProxyLimit } = u;
  let uid: string;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`  ✓ Auth user exists — ${email} (uid: ${uid.slice(0, 8)}…)`);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found") {
      const created = await auth.createUser({ email, password, displayName: name });
      uid = created.uid;
      console.log(`  ✓ Auth user created — ${email} (uid: ${uid.slice(0, 8)}…)`);
    } else {
      // Provide a clear hint for the most common setup error
      if (code === "auth/configuration-not-found") {
        console.error(`
  ❌  Firebase Auth is not enabled for project "${process.env.FIREBASE_PROJECT_ID}".

  Fix:
    1. Open https://console.firebase.google.com/project/${process.env.FIREBASE_PROJECT_ID}/authentication/providers
    2. Click "Get started" (or "Sign-in method")
    3. Enable "Email/Password"
    4. Re-run this script
`);
        process.exit(1);
      }
      throw err;
    }
  }

  await db.collection("users").doc(uid).set(
    {
      name,
      email,
      role,
      activeProxyLimit,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`  ✓ Firestore doc written — role: ${role}`);
  return uid;
}

async function main() {
  console.log("\n🔧  Creating SecondChance users…\n");
  for (const u of USERS) {
    console.log(`👤  ${u.name} <${u.email}>`);
    await upsertUser(u);
    console.log();
  }
  console.log("✅  All done!\n");
  console.log("Login at http://localhost:3000/login with:");
  USERS.forEach((u) =>
    console.log(`   ${u.role.padEnd(9)} │ ${u.email}  /  ${u.password}`)
  );
  console.log();
}

main().catch((err) => {
  console.error("❌  Unexpected error:", err.code ?? "", err.message ?? err);
  process.exit(1);
});
