import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import { isPhoneAssignedStatus } from "@/lib/phone-utils";
import { enrichPhonesWithProxies } from "@/lib/sync-enrich";

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
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          country: d.country,
          number: d.number,
          provider: d.provider,
          purchasedAt: toIso(d.purchasedAt),
          expiresAt: toIso(d.expiresAt),
          status: d.status,
          assignedTo: d.assignedTo ?? null,
          assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
          batchId: d.batchId ?? "",
          notes: d.notes ?? "",
          proxyId: d.proxyId ?? null,
        };
      })
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""));

    const enriched = await enrichPhonesWithProxies(phones);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
