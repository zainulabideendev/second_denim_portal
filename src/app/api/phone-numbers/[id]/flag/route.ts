import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { notifyManagers } from "@/lib/utils-server";

const flagSchema = z.object({
  notes: z.string().max(500).optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const parsed = flagSchema.safeParse(body);

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

    if (data.assigned_to !== actor.uid) {
      return NextResponse.json(
        {
          success: false,
          error: "Only the assigned user can update this number's status.",
        },
        { status: 403 }
      );
    }

    const notes = parsed.data.notes;
    const { error } = await supabaseAdmin()
      .from("phone_numbers")
      .update({
        status: "banned",
        notes: notes ? `[BANNED] ${notes}` : "[BANNED] Not working",
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.flagged",
      targetType: "phone",
      targetId: id,
      metadata: { notes, previousStatus: data.status },
    });

    await notifyManagers({
      type: "proxy_flagged",
      message: `Phone number flagged as not working by ${actor.name} (${data.country}).`,
      relatedId: id,
    });

    return NextResponse.json({ success: true, data: { id, status: "banned" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
