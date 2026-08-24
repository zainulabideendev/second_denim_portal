import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
} from "@/lib/user-pools";
import {
  canUnrestrictActive,
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
        { success: false, error: "You can only update your own proxies" },
        { status: 403 }
      );
    }

    if (proxyData.status !== "assigned") {
      return NextResponse.json(
        { success: false, error: "Only assigned proxies can be restored" },
        { status: 400 }
      );
    }

    if (normalizeLane(proxyData.lane) !== "active" || !proxyData.restricted) {
      return NextResponse.json(
        { success: false, error: "Only restricted active proxies can be restored" },
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

    if (!canUnrestrictActive(counts, activeLimit)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot restore — working active limit reached (${activeLimit + 1} max). Report a ban to reset.`,
        },
        { status: 409 }
      );
    }

    await proxyDoc.ref.update({ restricted: false });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.unrestricted",
      targetType: "proxy",
      targetId: id,
      metadata: { uid: ownerUid, country },
    });

    return NextResponse.json({
      success: true,
      data: { id, restricted: false },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
