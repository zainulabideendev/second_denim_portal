import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { isPhoneAssignedStatus } from "@/lib/phone-utils";
import { enrichPhonesWithProxies, mapPhoneDoc } from "@/lib/sync-enrich";

export async function GET() {
  try {
    const actor = await requireAuth();
    const db = adminDb();

    // Single where clause — filter status and sort in JS to avoid composite indexes.
    const snapshot = await db
      .collection("phoneNumbers")
      .where("assignedTo", "==", actor.uid)
      .get();

    const phones = snapshot.docs
      .filter((doc) => isPhoneAssignedStatus(doc.data().status))
      .map(mapPhoneDoc)
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""));

    const enriched = await enrichPhonesWithProxies(phones);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
