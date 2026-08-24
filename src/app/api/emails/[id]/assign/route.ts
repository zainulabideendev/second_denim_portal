import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";

const schema = z.object({ assignedTo: z.string().min(1) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });

    const db = adminDb();
    const doc = await db.collection("emails").doc(id).get();
    if (!doc.exists) return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });

    const now = new Date();
    await doc.ref.update({ status: "assigned", assignedTo: parsed.data.assignedTo, assignedAt: now });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.assigned",
      targetType: "user",
      targetId: id,
      metadata: { assignedTo: parsed.data.assignedTo },
    });

    return NextResponse.json({ success: true, data: { id, status: "assigned", assignedAt: toIso(now) } });
  } catch (err) {
    return handleAuthError(err);
  }
}
