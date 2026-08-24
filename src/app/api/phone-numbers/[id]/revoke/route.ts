import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const revokeSchema = z.object({ retire: z.boolean().optional().default(false) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    const retire = parsed.success ? parsed.data.retire : false;

    const db = adminDb();
    const doc = await db.collection("phoneNumbers").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Phone number not found" }, { status: 404 });
    }

    const prev = doc.data()!;
    const newStatus = retire ? "retired" : "available";

    await doc.ref.update({ status: newStatus, assignedTo: null, assignedAt: null });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.revoked",
      targetType: "phone",
      targetId: id,
      metadata: { previousAssignedTo: prev.assignedTo, newStatus },
    });

    return NextResponse.json({ success: true, data: { id, status: newStatus } });
  } catch (err) {
    return handleAuthError(err);
  }
}
