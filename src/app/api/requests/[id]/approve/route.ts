import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
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

    const { data: reqData, error } = await supabaseAdmin()
      .from("requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!reqData) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 }
      );
    }

    if (reqData.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Request is not in pending state" },
        { status: 409 }
      );
    }

    const { country, requested_by: requestedBy, type } = reqData;
    const now = new Date();

    let fulfilledItemId: string | null = null;

    if (type === "phone") {
      const phone = await assignAvailablePhone(country, requestedBy, actor.uid);
      fulfilledItemId = phone?.id ?? null;
    }

    const newStatus =
      type === "proxy" ? "approved" : fulfilledItemId ? "fulfilled" : "approved";

    const { error: updateError } = await supabaseAdmin()
      .from("requests")
      .update({
        status: newStatus,
        reviewed_by: actor.uid,
        reviewed_by_name: actor.name,
        reviewed_by_email: actor.email,
        reviewed_at: now.toISOString(),
        fulfilled_item_id: fulfilledItemId,
      })
      .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "request.approved",
      targetType: "request",
      targetId: id,
      metadata: { fulfilledItemId, type, country, newStatus },
    });

    const message =
      type === "proxy"
        ? `Your proxy request for ${country} was approved. An admin will assign a proxy manually.`
        : fulfilledItemId
          ? `Your phone request for ${country} has been approved and assigned!`
          : `Your phone request for ${country} has been approved, but no stock is available yet.`;

    await createNotification({
      uid: requestedBy,
      type: "request_reviewed",
      message,
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
