import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";

export async function GET() {
  try {
    const actor = await requireAuth();
    const db = adminDb();

    // Single where clause — sort in JS to avoid composite index
    const snapshot = await db
      .collection("requests")
      .where("requestedBy", "==", actor.uid)
      .limit(100)
      .get();

    const requests = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          type: d.type,
          requestedBy: d.requestedBy,
          country: d.country,
          reason: d.reason,
          status: d.status,
          reviewedBy: d.reviewedBy ?? null,
          reviewedAt: d.reviewedAt ? toIso(d.reviewedAt) : null,
          fulfilledItemId: d.fulfilledItemId ?? null,
          createdAt: toIso(d.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    return handleAuthError(err);
  }
}
