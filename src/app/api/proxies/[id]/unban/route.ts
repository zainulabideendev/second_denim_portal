import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
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

    const ownerUid = proxyData.assignedTo as string | null;
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
          error: `Active pool is full (${counts.working}/${activeLimit}). Restrict or free an active slot first.`,
        },
        { status: 409 }
      );
    }

    const prevNotes = typeof proxyData.notes === "string" ? proxyData.notes : "";
    const notes = prevNotes
      ? `${prevNotes}\n[RESTORED FROM BAN] by ${actor.name}`
      : `[RESTORED FROM BAN] by ${actor.name}`;

    await proxyDoc.ref.update({
      status: "assigned",
      lane: "active",
      restricted: false,
      notes,
    });

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
