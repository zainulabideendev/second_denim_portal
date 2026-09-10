import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapProxyDoc } from "@/lib/sync-enrich";

const updateSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  notes: z.string().optional(),
  vintedUsername: z.string().optional(),
  vintedPassword: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["salesman", "admin", "manager"]);
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const proxyRef = db.collection("proxies").doc(id);
    const proxyDoc = await proxyRef.get();

    if (!proxyDoc.exists) {
      return NextResponse.json({ success: false, error: "Proxy not found" }, { status: 404 });
    }

    const data = proxyDoc.data()!;
    if (actor.role === "salesman" && data.assignedTo !== actor.uid) {
      return NextResponse.json({ success: false, error: "Not your proxy" }, { status: 403 });
    }

    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No changes" }, { status: 400 });
    }

    await proxyRef.update(updates);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.updated",
      targetType: "proxy",
      targetId: id,
      metadata: { fields: Object.keys(updates) },
    });

    const next = await proxyRef.get();
    return NextResponse.json({ success: true, data: mapProxyDoc(next) });
  } catch (err) {
    return handleAuthError(err);
  }
}
