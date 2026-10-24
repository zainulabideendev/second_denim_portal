import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isPhoneAssignedStatus } from "@/lib/phone-utils";

const statusSchema = z.object({
  status: z.enum(["active", "inactive", "banned", "banned_with_balance"]),
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
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data } = await supabaseAdmin()
      .from("phone_numbers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Phone number not found" },
        { status: 404 }
      );
    }

    if (!data.assigned_to) {
      return NextResponse.json(
        {
          success: false,
          error: "Only assigned numbers can have account status updated.",
        },
        { status: 422 }
      );
    }

    if (data.assigned_to !== actor.uid) {
      return NextResponse.json(
        {
          success: false,
          error: "Only the assigned user can update this number's status.",
        },
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
    const { error } = await supabaseAdmin()
      .from("phone_numbers")
      .update({ status })
      .eq("id", id);

    if (error) throw new Error(error.message);

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
