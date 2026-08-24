import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    void actor;

    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    // No orderBy + where combos — fetch all, filter + sort in JS.
    const snapshot = await db.collection("requests").limit(500).get();

    // Collect unique UIDs for user lookup
    const uids = new Set<string>();
    snapshot.docs.forEach((doc) => {
      const d = doc.data();
      uids.add(d.requestedBy);
      if (d.reviewedBy) uids.add(d.reviewedBy);
    });

    const userDocs = await Promise.all(
      Array.from(uids).map((uid) => db.collection("users").doc(uid).get())
    );
    const userMap = new Map(
      userDocs.map((doc) => [doc.id, doc.exists ? doc.data() : null])
    );

    let requests = snapshot.docs.map((doc) => {
      const d = doc.data();
      const reqUser = userMap.get(d.requestedBy);
      const revUser = d.reviewedBy ? userMap.get(d.reviewedBy) : null;
      return {
        id: doc.id,
        type: d.type,
        requestedBy: d.requestedBy,
        requestedByUser: reqUser
          ? { uid: d.requestedBy, name: reqUser.name, email: reqUser.email }
          : null,
        country: d.country,
        reason: d.reason,
        status: d.status,
        reviewedBy: d.reviewedBy ?? null,
        reviewedByUser: revUser
          ? { uid: d.reviewedBy, name: revUser.name, email: revUser.email }
          : null,
        reviewedAt: d.reviewedAt ? toIso(d.reviewedAt) : null,
        fulfilledItemId: d.fulfilledItemId ?? null,
        createdAt: toIso(d.createdAt),
      };
    });

    // Filter in JS
    if (status) requests = requests.filter((r) => r.status === status);
    if (type) requests = requests.filter((r) => r.type === type);

    // Sort newest first
    requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    return handleAuthError(err);
  }
}
