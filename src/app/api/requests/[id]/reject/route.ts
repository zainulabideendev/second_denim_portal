import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
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

    const now = new Date();
    const { error: updateError } = await supabaseAdmin()
      .from("requests")
      .update({
        status: "rejected",
        reviewed_by: actor.uid,
        reviewed_by_name: actor.name,
        reviewed_by_email: actor.email,
        reviewed_at: now.toISOString(),
        rejection_reason: reason,
      })
      .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "request.rejected",
      targetType: "request",
      targetId: id,
      metadata: { reason, type: reqData.type, country: reqData.country },
    });

    await createNotification({
      uid: reqData.requested_by,
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
