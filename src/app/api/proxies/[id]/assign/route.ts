import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";
import { normalizeLane } from "@/lib/pool-utils";

const assignSchema = z.object({
  assignedTo: z.string().min(1, "User ID is required"),
  lane: z.enum(["backup", "active", "fresh", "staging"]).optional().default("backup"),
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
    const db = adminDb();

    // Verify proxy exists
    const proxyDoc = await db.collection("proxies").doc(id).get();
    if (!proxyDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    // Verify target user exists
    const userDoc = await db.collection("users").doc(assignedTo).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Target user not found" },
        { status: 404 }
      );
    }

    const previousData = proxyDoc.data()!;
    const now = new Date();

    await proxyDoc.ref.update({
      status: "assigned",
      assignedTo,
      assignedAt: now,
      lane,
      stagingDone: false,
      accountsCreated: false,
      restricted: false,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.assigned",
      targetType: "proxy",
      targetId: id,
      metadata: {
        assignedTo,
        lane,
        previousAssignedTo: previousData.assignedTo,
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
