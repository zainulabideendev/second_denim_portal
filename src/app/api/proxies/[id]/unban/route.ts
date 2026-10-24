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
} from "@/lib/pool-utils";
import type { Country } from "@/lib/types";

/**
 * Revert a banned (flagged) proxy back to assigned + active.
 * Salesmen can only restore their own proxies.
 */
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
        { success: false, error: "You can only restore your own proxies" },
        { status: 403 }
      );
    }

    if (proxyData.status !== "flagged") {
      return NextResponse.json(
        { success: false, error: "Only banned proxies can be restored" },
        { status: 400 }
      );
    }

    const ownerUid = proxyData.assigned_to;
    if (!ownerUid) {
      return NextResponse.json(
        { success: false, error: "Proxy is not assigned to a user" },
        { status: 400 }
      );
    }

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
          error: `Active pool is full (${counts.working}/${activeLimit}). Restrict or free an active slot first.`,
        },
        { status: 409 }
      );
    }

    const prevNotes =
      typeof proxyData.notes === "string" ? proxyData.notes : "";
    const notes = prevNotes
      ? `${prevNotes}\n[RESTORED FROM BAN] by ${actor.name}`
      : `[RESTORED FROM BAN] by ${actor.name}`;

    const { error } = await supabaseAdmin()
      .from("proxies")
      .update({
        status: "assigned",
        lane: "active",
        restricted: false,
        notes,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.unbanned",
      targetType: "proxy",
      targetId: id,
      metadata: { uid: ownerUid, country, previousStatus: "flagged" },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: "assigned", lane: "active" },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
