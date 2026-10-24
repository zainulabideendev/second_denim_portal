import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const revokeSchema = z.object({ retire: z.boolean().optional().default(false) });

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

    const { data: prev } = await supabaseAdmin()
      .from("phone_numbers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!prev) {
      return NextResponse.json(
        { success: false, error: "Phone number not found" },
        { status: 404 }
      );
    }

    const newStatus = retire ? "retired" : "available";

    const { error } = await supabaseAdmin()
      .from("phone_numbers")
      .update({
        status: newStatus,
        assigned_to: null,
        assigned_at: null,
        proxy_id: null,
        proxy_host: null,
        proxy_port: null,
        proxy_country: null,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    if (prev.proxy_id) {
      const { data: proxy } = await supabaseAdmin()
        .from("proxies")
        .select("id, phone_id")
        .eq("id", prev.proxy_id)
        .maybeSingle();

      if (proxy?.phone_id === id) {
        await supabaseAdmin()
          .from("proxies")
          .update({ phone_id: null, phone_number: null })
          .eq("id", prev.proxy_id);
      }
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.revoked",
      targetType: "phone",
      targetId: id,
      metadata: { previousAssignedTo: prev.assigned_to, newStatus },
    });

    return NextResponse.json({ success: true, data: { id, status: newStatus } });
  } catch (err) {
    return handleAuthError(err);
  }
}
