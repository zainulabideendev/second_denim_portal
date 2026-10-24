import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleBanCascade, notifyManagers } from "@/lib/utils-server";
import type { Country } from "@/lib/types";

const flagSchema = z.object({
  notes: z
    .string()
    .min(10, "Please describe the ban in at least 10 characters")
    .max(500),
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
      const msg = parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { data: proxyData } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!proxyData) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    if (actor.role === "salesman" && proxyData.assigned_to !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "You can only flag your own proxies" },
        { status: 403 }
      );
    }

    const notes = parsed.data.notes;
    const ownerUid = proxyData.assigned_to;
    const country = proxyData.country as Country;

    const cascadeResult = ownerUid
      ? await handleBanCascade(id, ownerUid, country, actor.uid, notes)
      : { promoted: [], refilled: false };

    if (!ownerUid) {
      await supabaseAdmin()
        .from("proxies")
        .update({
          status: "flagged",
          notes: notes ? `[FLAGGED] ${notes}` : "[FLAGGED] Not working",
        })
        .eq("id", id);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.flagged",
      targetType: "proxy",
      targetId: id,
      metadata: {
        notes,
        previousStatus: proxyData.status,
        previousLane: proxyData.lane,
        promoted: cascadeResult.promoted,
        refilled: false,
      },
    });

    await notifyManagers({
      type: "proxy_flagged",
      message: `${actor.name} reported a ban on a ${country} proxy. Assign a replacement manually if needed.`,
      relatedId: id,
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: "flagged",
        cascade: cascadeResult,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
