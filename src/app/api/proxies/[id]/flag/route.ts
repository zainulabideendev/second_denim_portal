import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { handleBanCascade, notifyManagers } from "@/lib/utils-server";
import {
  getUserPoolAssignments,
  getAssignmentSizePerLane,
  getAssignmentBackupLimit,
} from "@/lib/user-pools";
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
      const msg =
        parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    const db = adminDb();
    const proxyDoc = await db.collection("proxies").doc(id).get();

    if (!proxyDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const proxyData = proxyDoc.data()!;

    // Salesmen can only flag their own proxies
    if (actor.role === "salesman" && proxyData.assignedTo !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "You can only flag your own proxies" },
        { status: 403 }
      );
    }

    const notes = parsed.data.notes;
    const ownerUid = proxyData.assignedTo as string | null;
    const country = proxyData.country as Country;

    let activePoolSize = 3;
    let backupLimit: number | null = null;
    if (ownerUid) {
      const assignments = await getUserPoolAssignments(ownerUid);
      activePoolSize =
        getAssignmentSizePerLane(assignments, country) ?? activePoolSize;
      backupLimit = getAssignmentBackupLimit(assignments, country);
    }

    const cascadeResult = ownerUid
      ? await handleBanCascade(
          id,
          ownerUid,
          country,
          actor.uid,
          notes,
          activePoolSize,
          backupLimit
        )
      : { promoted: [], refilled: false };

    // If the proxy wasn't assigned (admin flagging a global proxy), just flag it
    if (!ownerUid) {
      await proxyDoc.ref.update({
        status: "flagged",
        notes: notes ? `[FLAGGED] ${notes}` : "[FLAGGED] Not working",
      });
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
        refilled: cascadeResult.refilled,
      },
    });

    await notifyManagers({
      type: "proxy_flagged",
      message: `${actor.name} reported a ban on a ${country} proxy. Backup refill: ${cascadeResult.refilled ? "new proxy added" : "pool exhausted!"}`,
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
