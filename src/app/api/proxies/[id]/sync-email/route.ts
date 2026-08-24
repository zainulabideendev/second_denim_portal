import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { linkProxyToEmail, unlinkProxyEmail } from "@/lib/proxy-email-sync";

const syncSchema = z.object({
  emailId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    await linkProxyToEmail(id, parsed.data.emailId, actor.uid);

    return NextResponse.json({
      success: true,
      data: { proxyId: id, emailId: parsed.data.emailId, synced: true },
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
    const { id } = await params;
    await unlinkProxyEmail(id, actor.uid);
    return NextResponse.json({ success: true, data: { proxyId: id, synced: false } });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
