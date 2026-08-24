import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { notifyManagers } from "@/lib/utils-server";

const flagSchema = z.object({
  notes: z.string().max(500).optional().default(""),
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
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const db = adminDb();
    const doc = await db.collection("phoneNumbers").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Phone number not found" }, { status: 404 });
    }

    const data = doc.data()!;
    if (data.assignedTo !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "Only the assigned user can update this number's status." },
        { status: 403 }
      );
    }

    const notes = parsed.data.notes;
    await doc.ref.update({
      status: "banned",
      notes: notes ? `[BANNED] ${notes}` : "[BANNED] Not working",
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.flagged",
      targetType: "phone",
      targetId: id,
      metadata: { notes, previousStatus: data.status },
    });

    await notifyManagers({
      type: "proxy_flagged",
      message: `Phone number flagged as not working by ${actor.name} (${data.country}).`,
      relatedId: id,
    });

    return NextResponse.json({ success: true, data: { id, status: "banned" } });
  } catch (err) {
    return handleAuthError(err);
  }
}
