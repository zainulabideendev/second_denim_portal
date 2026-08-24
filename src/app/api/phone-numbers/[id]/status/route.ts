import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isPhoneAssignedStatus } from "@/lib/phone-utils";

const statusSchema = z.object({
  status: z.enum(["active", "banned", "banned_with_balance"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    const { id } = await params;

    const body = await request.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const db = adminDb();
    const doc = await db.collection("phoneNumbers").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Phone number not found" }, { status: 404 });
    }

    const data = doc.data()!;
    if (!data.assignedTo) {
      return NextResponse.json(
        { success: false, error: "Only assigned numbers can have account status updated." },
        { status: 422 }
      );
    }

    if (data.assignedTo !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "Only the assigned user can update this number's status." },
        { status: 403 }
      );
    }

    if (!isPhoneAssignedStatus(data.status) && data.status !== "available") {
      return NextResponse.json(
        { success: false, error: "This phone number cannot be updated." },
        { status: 422 }
      );
    }

    const { status } = parsed.data;
    await doc.ref.update({ status });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.flagged",
      targetType: "phone",
      targetId: id,
      metadata: { status, previousStatus: data.status },
    });

    return NextResponse.json({ success: true, data: { id, status } });
  } catch (err) {
    return handleAuthError(err);
  }
}
