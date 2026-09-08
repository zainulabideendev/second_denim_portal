import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
  getAssignmentBackupLimit,
} from "@/lib/user-pools";
import {
  canPromoteToActive,
  getActiveLimit,
  getActivePoolCounts,
  normalizeLane,
} from "@/lib/pool-utils";
import { autoRefillUserPoolForCountry } from "@/lib/utils-server";
import type { Country } from "@/lib/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["salesman", "admin", "manager"]);
    const { id } = await params;
    const db = adminDb();
    const proxyDoc = await db.collection("proxies").doc(id).get();

    if (!proxyDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const proxyData = proxyDoc.data()!;

    if (actor.role === "salesman" && proxyData.assignedTo !== actor.uid) {
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

    if (!proxyData.accountsCreated && !proxyData.stagingDone) {
      return NextResponse.json(
        {
          success: false,
          error: "Mark accounts as created before moving to active",
        },
        { status: 400 }
      );
    }

    const ownerUid = proxyData.assignedTo as string;
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

    const poolSnap = await db
      .collection("proxies")
      .where("assignedTo", "==", ownerUid)
      .where("status", "==", "assigned")
      .get();

    const counts = getActivePoolCounts(
      poolSnap.docs.map((d) => ({ ...d.data(), country: d.data().country })),
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

    await proxyDoc.ref.update({ lane: "active", restricted: false });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.lane_promoted",
      targetType: "proxy",
      targetId: id,
      metadata: { from: "backup", to: "active", uid: ownerUid, country },
    });

    const refilled = await autoRefillUserPoolForCountry(
      ownerUid,
      country,
      actor.uid,
      activePoolSize,
      getAssignmentBackupLimit(assignments, country)
    );

    return NextResponse.json({
      success: true,
      data: { id, lane: "active", refilled },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
