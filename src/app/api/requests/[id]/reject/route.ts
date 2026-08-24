import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createNotification, toIso } from "@/lib/utils-server";

const rejectSchema = z.object({
  reason: z.string().max(500).optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = rejectSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : "";

    const db = adminDb();
    const reqDoc = await db.collection("requests").doc(id).get();

    if (!reqDoc.exists) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    const reqData = reqDoc.data()!;
    if (reqData.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Request is not in pending state" },
        { status: 409 }
      );
    }

    const now = new Date();
    await reqDoc.ref.update({
      status: "rejected",
      reviewedBy: actor.uid,
      reviewedAt: now,
      rejectionReason: reason,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "request.rejected",
      targetType: "request",
      targetId: id,
      metadata: { reason, type: reqData.type, country: reqData.country },
    });

    await createNotification({
      uid: reqData.requestedBy,
      type: "request_reviewed",
      message: `Your ${reqData.type} request for ${reqData.country} was rejected.${reason ? ` Reason: ${reason}` : ""}`,
      relatedId: id,
    });

    return NextResponse.json({
      success: true,
      data: { id, status: "rejected", reviewedAt: toIso(now) },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
