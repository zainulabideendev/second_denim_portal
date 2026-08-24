import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  enrichProxiesWithSyncedEmails,
  mapProxyDoc,
} from "@/lib/sync-enrich";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    void actor;

    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    // Use at most ONE where clause — Firestore requires composite indexes for more.
    // Pick the most selective filter, then narrow in JS.
    let snapshot: FirebaseFirestore.QuerySnapshot;
    if (assignedTo) {
      snapshot = await db.collection("proxies").where("assignedTo", "==", assignedTo).limit(500).get();
    } else if (country) {
      snapshot = await db.collection("proxies").where("country", "==", country).limit(500).get();
    } else {
      snapshot = await db.collection("proxies").limit(500).get();
    }

    let proxies = snapshot.docs.map(mapProxyDoc);

    // Apply remaining filters in JS
    if (country && assignedTo) proxies = proxies.filter((p) => p.country === country);
    if (status) proxies = proxies.filter((p) => p.status === status);

    proxies.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

    const enriched = await enrichProxiesWithSyncedEmails(proxies);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
