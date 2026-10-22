import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth();
    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 20)
      : 10;

    const snapshot = await db
      .collection("notifications")
      .where("uid", "==", actor.uid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const notifications = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        uid: d.uid,
        type: d.type,
        message: d.message,
        read: d.read,
        createdAt: toIso(d.createdAt),
        relatedId: d.relatedId ?? null,
      };
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH() {
  try {
    const actor = await requireAuth();
    const db = adminDb();

    // Mark all notifications as read for this user
    const snapshot = await db
      .collection("notifications")
      .where("uid", "==", actor.uid)
      .where("read", "==", false)
      .get();

    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach((doc) => batch.update(doc.ref, { read: true }));
      await batch.commit();
    }

    return NextResponse.json({ success: true, data: { markedRead: snapshot.size } });
  } catch (err) {
    return handleAuthError(err);
  }
}
