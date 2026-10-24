import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const notes = typeof body?.notes === "string" ? body.notes : "";

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

    const { error } = await supabaseAdmin()
      .from("emails")
      .update({
        status: "flagged",
        notes: notes ? `[FLAGGED] ${notes}` : "[FLAGGED]",
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.flagged",
      targetType: "user",
      targetId: id,
      metadata: { notes },
    });

    return NextResponse.json({ success: true, data: { id, status: "flagged" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
