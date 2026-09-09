import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { linkProxyToEmail } from "@/lib/proxy-email-sync";

const bodySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
  notes: z.string().optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: proxyId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const proxyRef = db.collection("proxies").doc(proxyId);
    const proxyDoc = await proxyRef.get();
    if (!proxyDoc.exists) {
      return NextResponse.json({ success: false, error: "Proxy not found" }, { status: 404 });
    }

    const emailNorm = parsed.data.email.trim().toLowerCase();

    const existing = await db
      .collection("emails")
      .where("email", "==", emailNorm)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { success: false, error: "This email already exists in inventory" },
        { status: 409 }
      );
    }

    const now = FieldValue.serverTimestamp();
    const emailRef = db.collection("emails").doc();
    await emailRef.set({
      email: emailNorm,
      password: parsed.data.password,
      status: "fresh",
      assignedTo: null,
      assignedAt: null,
      notes: parsed.data.notes ?? "",
      batchId: null,
      syncedProxyId: null,
      syncedAt: null,
      createdAt: now,
    });

    await linkProxyToEmail(proxyId, emailRef.id, actor.uid);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.imported",
      targetType: "user",
      targetId: emailRef.id,
      metadata: {
        email: emailNorm,
        proxyId,
        source: "add-gmail",
      },
    });

    return NextResponse.json({
      success: true,
      data: { emailId: emailRef.id, proxyId, email: emailNorm, synced: true },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    return handleAuthError(err);
  }
}
