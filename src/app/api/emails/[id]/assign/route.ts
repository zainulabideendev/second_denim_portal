import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";

const schema = z.object({ assignedTo: z.string().min(1) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    const { data: doc } = await supabaseAdmin()
      .from("emails")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Email not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const { error } = await supabaseAdmin()
      .from("emails")
      .update({
        status: "assigned",
        assigned_to: parsed.data.assignedTo,
        assigned_at: now.toISOString(),
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.assigned",
      targetType: "user",
      targetId: id,
      metadata: { assignedTo: parsed.data.assignedTo },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: "assigned", assignedAt: toIso(now) },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
