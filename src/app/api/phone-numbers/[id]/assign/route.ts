import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { assignedTo } = parsed.data;

    const { data: doc } = await supabaseAdmin()
      .from("phone_numbers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Phone number not found" },
        { status: 404 }
      );
    }

    const { data: userDoc } = await supabaseAdmin()
      .from("profiles")
      .select("id")
      .eq("id", assignedTo)
      .maybeSingle();

    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "Target user not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const { error } = await supabaseAdmin()
      .from("phone_numbers")
      .update({
        status: "active",
        assigned_to: assignedTo,
        assigned_at: now.toISOString(),
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: id,
      metadata: {
        assignedTo,
        previousAssignedTo: doc.assigned_to,
        manualOverride: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: "active", assignedTo, assignedAt: toIso(now) },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
