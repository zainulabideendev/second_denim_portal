import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const notes = typeof body?.notes === "string" ? body.notes : "";

    const db = adminDb();
    const doc = await db.collection("emails").doc(id).get();
    if (!doc.exists) return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });

    await doc.ref.update({ status: "flagged", notes: notes ? `[FLAGGED] ${notes}` : "[FLAGGED]" });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.flagged",
      targetType: "user",
      targetId: id,
      metadata: { notes },
    });

    return NextResponse.json({ success: true, data: { id, status: "flagged" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
