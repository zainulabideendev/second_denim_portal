import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";

const assignSchema = z.object({ assignedTo: z.string().min(1) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;

    const body = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const { assignedTo } = parsed.data;
    const db = adminDb();

    const doc = await db.collection("phoneNumbers").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Phone number not found" }, { status: 404 });
    }

    const userDoc = await db.collection("users").doc(assignedTo).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: "Target user not found" }, { status: 404 });
    }

    const prev = doc.data()!;
    const now = new Date();

    await doc.ref.update({ status: "active", assignedTo, assignedAt: now });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: id,
      metadata: { assignedTo, previousAssignedTo: prev.assignedTo, manualOverride: true },
    });

    return NextResponse.json({ success: true, data: { id, status: "active", assignedTo, assignedAt: toIso(now) } });
  } catch (err) {
    return handleAuthError(err);
  }
}
