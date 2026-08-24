import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin"]);
    void actor;

    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType");
    const action = searchParams.get("action");

    let query = db.collection("auditLog").orderBy("createdAt", "desc") as FirebaseFirestore.Query;

    if (targetType) query = query.where("targetType", "==", targetType);
    if (action) query = query.where("action", "==", action);

    const snapshot = await query.limit(200).get();

    // Enrich with actor names
    const uids = new Set(snapshot.docs.map((d) => d.data().actorUid));
    const userDocs = await Promise.all(
      Array.from(uids).map((uid) => db.collection("users").doc(uid).get())
    );
    const userMap = new Map(
      userDocs.map((doc) => [doc.id, doc.exists ? doc.data()?.name : "Unknown"])
    );

    const logs = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        actorUid: d.actorUid,
        actorName: userMap.get(d.actorUid) ?? "Unknown",
        action: d.action,
        targetType: d.targetType,
        targetId: d.targetId,
        metadata: d.metadata ?? {},
        createdAt: toIso(d.createdAt),
      };
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (err) {
    return handleAuthError(err);
  }
}
