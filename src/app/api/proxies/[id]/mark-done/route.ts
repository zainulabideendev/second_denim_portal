import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { normalizeLane } from "@/lib/pool-utils";

/**
 * POST /api/proxies/[id]/mark-done
 * Salesman marks a backup proxy as "accounts created".
 * Required before the proxy can be moved to active.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth();
    const { id } = await params;

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
        { success: false, error: "Not your proxy" },
        { status: 403 }
      );
    }

    if (normalizeLane(proxyData.lane) !== "backup") {
      return NextResponse.json(
        {
          success: false,
          error: "Only backup proxies can be marked as account created",
        },
        { status: 400 }
      );
    }

    if (proxyData.accounts_created || proxyData.staging_done) {
      return NextResponse.json(
        { success: false, error: "Accounts already marked as created" },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("proxies")
      .update({ accounts_created: true, staging_done: true })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.accounts_created",
      targetType: "proxy",
      targetId: id,
      metadata: { country: proxyData.country },
    });

    return NextResponse.json({
      success: true,
      data: { id, accountsCreated: true },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
