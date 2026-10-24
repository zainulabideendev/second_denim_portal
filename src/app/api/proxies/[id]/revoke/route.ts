import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const revokeSchema = z.object({
  retire: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    const retire = parsed.success ? parsed.data.retire : false;

    const { data: previousData } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!previousData) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const newStatus = retire ? "retired" : "fresh";

    const { error } = await supabaseAdmin()
      .from("proxies")
      .update({
        status: newStatus,
        assigned_to: null,
        assigned_at: null,
        lane: null,
        staging_done: false,
        accounts_created: false,
        restricted: false,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.revoked",
      targetType: "proxy",
      targetId: id,
      metadata: {
        previousAssignedTo: previousData.assigned_to,
        newStatus,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: newStatus },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
