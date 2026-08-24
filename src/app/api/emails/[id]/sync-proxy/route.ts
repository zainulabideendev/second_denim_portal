import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { linkProxyToEmail, unlinkProxyEmail } from "@/lib/proxy-email-sync";
import { adminDb } from "@/lib/firebase-admin";

const syncSchema = z.object({
  proxyId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: emailId } = await params;
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    await linkProxyToEmail(parsed.data.proxyId, emailId, actor.uid);

    return NextResponse.json({
      success: true,
      data: { proxyId: parsed.data.proxyId, emailId, synced: true },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    return handleAuthError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: emailId } = await params;

    const db = adminDb();
    const emailDoc = await db.collection("emails").doc(emailId).get();
    if (!emailDoc.exists) {
      return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
    }

    const proxyId = emailDoc.data()?.syncedProxyId as string | undefined;
    if (!proxyId) {
      return NextResponse.json({ success: false, error: "Email is not synced to a proxy" }, { status: 400 });
    }

    await unlinkProxyEmail(proxyId, actor.uid);

    return NextResponse.json({ success: true, data: { emailId, synced: false } });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
