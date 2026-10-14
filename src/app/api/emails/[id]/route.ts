import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapEmailDoc, enrichEmailsWithSyncedProxies } from "@/lib/sync-enrich";

const updateSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(1, "Password required").optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const emailRef = db.collection("emails").doc(id);
    const emailDoc = await emailRef.get();

    if (!emailDoc.exists) {
      return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
    }

    const current = emailDoc.data()!;
    const updates: Record<string, string> = {};

    if (parsed.data.email !== undefined) {
      const emailNorm = parsed.data.email.trim().toLowerCase();
      if (emailNorm !== String(current.email ?? "").toLowerCase()) {
        const existing = await db
          .collection("emails")
          .where("email", "==", emailNorm)
          .limit(1)
          .get();
        if (!existing.empty && existing.docs[0].id !== id) {
          return NextResponse.json(
            { success: false, error: "This email already exists in inventory" },
            { status: 409 }
          );
        }
        updates.email = emailNorm;
      }
    }

    if (parsed.data.password !== undefined) {
      updates.password = parsed.data.password;
    }

    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No changes" }, { status: 400 });
    }

    await emailRef.update(updates);

    // Keep denormalized snapshot on linked proxy in sync
    const linkedProxyId =
      current.syncedProxyId != null ? String(current.syncedProxyId).trim() : "";
    if (linkedProxyId && (updates.email || updates.password)) {
      const proxyPatch: Record<string, string> = {};
      if (updates.email) proxyPatch.syncedEmailEmail = updates.email;
      if (updates.password) proxyPatch.syncedEmailPassword = updates.password;
      await db.collection("proxies").doc(linkedProxyId).update(proxyPatch);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.updated",
      targetType: "user",
      targetId: id,
      metadata: {
        fields: Object.keys(updates),
        previousEmail: current.email,
        email: updates.email ?? current.email,
      },
    });

    const next = await emailRef.get();
    const [enriched] = await enrichEmailsWithSyncedProxies([mapEmailDoc(next)]);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
