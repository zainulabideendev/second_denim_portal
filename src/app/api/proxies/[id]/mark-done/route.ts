import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
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
        { success: false, error: "Not your proxy" },
        { status: 403 }
      );
    }

    if (normalizeLane(proxyData.lane) !== "backup") {
      return NextResponse.json(
        { success: false, error: "Only backup proxies can be marked as account created" },
        { status: 400 }
      );
    }

    if (proxyData.accountsCreated || proxyData.stagingDone) {
      return NextResponse.json(
        { success: false, error: "Accounts already marked as created" },
        { status: 409 }
      );
    }

    await proxyDoc.ref.update({ accountsCreated: true, stagingDone: true });

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
