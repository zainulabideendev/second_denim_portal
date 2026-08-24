"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    return null;
  }

  return { apiKey, authDomain, projectId };
}

/** True when NEXT_PUBLIC_FIREBASE_* vars are present (baked in at build time). */
export function isFirebaseClientConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getClientAuth(): Auth {
  if (auth) return auth;

  const config = getFirebaseConfig();
  if (!config) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID on Vercel, then redeploy."
    );
  }

  app = getApps().length ? getApps()[0]! : initializeApp(config);
  auth = getAuth(app);
  return auth;
}
