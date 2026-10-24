import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
} from "@/lib/user-pools";
import {
  canPromoteToActive,
  getActiveLimit,
  getActivePoolCounts,
  normalizeLane,
} from "@/lib/pool-utils";
import type { Country } from "@/lib/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["salesman", "admin", "manager"]);
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
        { success: false, error: "You can only promote your own proxies" },
        { status: 403 }
      );
    }

    if (proxyData.status !== "assigned") {
      return NextResponse.json(
        { success: false, error: "Only assigned proxies can be promoted" },
        { status: 400 }
      );
    }

    const lane = normalizeLane(proxyData.lane);
    if (lane !== "backup") {
      return NextResponse.json(
        { success: false, error: "Only backup proxies can be moved to active" },
        { status: 400 }
      );
    }

    if (!proxyData.accounts_created && !proxyData.staging_done) {
      return NextResponse.json(
        {
          success: false,
          error: "Mark accounts as created before moving to active",
        },
        { status: 400 }
      );
    }

    const ownerUid = proxyData.assigned_to as string;
    const country = proxyData.country as Country;

    const assignments = await getUserPoolAssignments(ownerUid);
    const activePoolSize = getAssignmentSizePerLane(assignments, country);
    if (!activePoolSize) {
      return NextResponse.json(
        { success: false, error: "No pool configured for this country" },
        { status: 400 }
      );
    }

    const activeLimit = getActiveLimit(activePoolSize);

    const { data: poolProxies } = await supabaseAdmin()
      .from("proxies")
      .select("country, lane, restricted")
      .eq("assigned_to", ownerUid)
      .eq("status", "assigned");

    const counts = getActivePoolCounts(
      (poolProxies ?? []).map((d) => ({
        country: d.country,
        lane: d.lane ?? undefined,
        restricted: d.restricted,
      })),
      country
    );

    if (!canPromoteToActive(counts, activeLimit)) {
      return NextResponse.json(
        {
          success: false,
          error: `Active pool is full (${counts.working}/${activeLimit}). Restrict an account or report a ban to free a slot.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("proxies")
      .update({ lane: "active", restricted: false })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.lane_promoted",
      targetType: "proxy",
      targetId: id,
      metadata: { from: "backup", to: "active", uid: ownerUid, country },
    });

    return NextResponse.json({
      success: true,
      data: { id, lane: "active", refilled: 0 },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
