import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  assignAvailableProxy,
  assignAvailablePhone,
  createNotification,
  toIso,
} from "@/lib/utils-server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
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

    const { country, requestedBy, type } = reqData;
    const now = new Date();

    // Try to find an available item
    let fulfilledItemId: string | null = null;

    if (type === "proxy") {
      const proxy = await assignAvailableProxy(country, requestedBy, actor.uid);
      fulfilledItemId = proxy?.id ?? null;
    } else {
      const phone = await assignAvailablePhone(country, requestedBy, actor.uid);
      fulfilledItemId = phone?.id ?? null;
    }

    const newStatus = fulfilledItemId ? "fulfilled" : "approved";

    await reqDoc.ref.update({
      status: newStatus,
      reviewedBy: actor.uid,
      reviewedAt: now,
      fulfilledItemId,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "request.approved",
      targetType: "request",
      targetId: id,
      metadata: { fulfilledItemId, type, country, newStatus },
    });

    await createNotification({
      uid: requestedBy,
      type: "request_reviewed",
      message: fulfilledItemId
        ? `Your ${type} request for ${country} has been approved and assigned!`
        : `Your ${type} request for ${country} has been approved, but no stock is available yet.`,
      relatedId: id,
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: newStatus,
        fulfilledItemId,
        reviewedAt: toIso(now),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
