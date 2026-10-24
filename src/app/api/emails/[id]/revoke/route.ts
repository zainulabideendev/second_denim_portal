import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ retire: z.boolean().optional().default(false) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const { retire } = schema.parse(body);

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
      .update(
        retire
          ? { status: "retired", assigned_to: null, assigned_at: null }
          : { status: "fresh", assigned_to: null, assigned_at: null }
      )
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: retire ? "email.retired" : "email.revoked",
      targetType: "user",
      targetId: id,
      metadata: { retire },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: retire ? "retired" : "fresh" },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
