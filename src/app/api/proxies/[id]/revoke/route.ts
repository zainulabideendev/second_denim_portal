import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const revokeSchema = z.object({
  retire: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    const retire = parsed.success ? parsed.data.retire : false;

    const db = adminDb();
    const proxyDoc = await db.collection("proxies").doc(id).get();

    if (!proxyDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const previousData = proxyDoc.data()!;
    const newStatus = retire ? "retired" : "fresh";

    await proxyDoc.ref.update({
      status: newStatus,
      assignedTo: null,
      assignedAt: null,
      lane: null,
      stagingDone: false,
      accountsCreated: false,
      restricted: false,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.revoked",
      targetType: "proxy",
      targetId: id,
      metadata: {
        previousAssignedTo: previousData.assignedTo,
        newStatus,
      },
    });

    return NextResponse.json({
      success: true,
      data: { id, status: newStatus },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
