import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";
import { normalizeLane } from "@/lib/pool-utils";

const assignSchema = z.object({
  assignedTo: z.string().min(1, "User ID is required"),
  lane: z
    .enum(["backup", "active", "fresh", "staging"])
    .optional()
    .default("backup"),
});

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

    const { assignedTo, lane: rawLane } = parsed.data;
    const lane = normalizeLane(rawLane);

    const { data: proxyDoc } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!proxyDoc) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
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
      .from("proxies")
      .update({
        status: "assigned",
        assigned_to: assignedTo,
        assigned_at: now.toISOString(),
        lane,
        staging_done: false,
        accounts_created: false,
        restricted: false,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.assigned",
      targetType: "proxy",
      targetId: id,
      metadata: {
        assignedTo,
        lane,
        previousAssignedTo: proxyDoc.assigned_to,
        manualOverride: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: "assigned",
        assignedTo,
        lane,
        assignedAt: toIso(now),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
