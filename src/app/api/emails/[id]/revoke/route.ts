import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ retire: z.boolean().optional().default(false) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const { retire } = schema.parse(body);

    const db = adminDb();
    const doc = await db.collection("emails").doc(id).get();
    if (!doc.exists) return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });

    await doc.ref.update(
      retire
        ? { status: "retired", assignedTo: null, assignedAt: null }
        : { status: "fresh", assignedTo: null, assignedAt: null }
    );

    await writeAuditLog({
      actorUid: actor.uid,
      action: retire ? "email.retired" : "email.revoked",
      targetType: "user",
      targetId: id,
      metadata: { retire },
    });

    return NextResponse.json({ success: true, data: { id, status: retire ? "retired" : "fresh" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
