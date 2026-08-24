import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let app: App;
let db: Firestore;
let auth: Auth;

function assertAdminEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");

  if (missing.length) {
    throw new Error(
      `Firebase Admin is not configured. Missing: ${missing.join(", ")}. Add them in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }

  return { projectId, clientEmail, privateKey };
}

function getFirebaseAdmin() {
  if (!getApps().length) {
    const { projectId, clientEmail, privateKey } = assertAdminEnv();

    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    app = getApps()[0];
  }

  db = getFirestore(app);
  auth = getAuth(app);

  return { app, db, auth };
}

export function adminDb(): Firestore {
  return getFirebaseAdmin().db;
}

export function adminAuth(): Auth {
  return getFirebaseAdmin().auth;
}
