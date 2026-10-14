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
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
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

    if (parsed.data.country !== undefined && actor.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only admins can change proxy country" },
        { status: 403 }
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

    const metadata: Record<string, unknown> = { fields: Object.keys(updates) };
    if (updates.country && updates.country !== data.country) {
      metadata.previousCountry = data.country;
      metadata.country = updates.country;
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.updated",
      targetType: "proxy",
      targetId: id,
      metadata,
    });

    const next = await proxyRef.get();
    return NextResponse.json({ success: true, data: mapProxyDoc(next) });
  } catch (err) {
    return handleAuthError(err);
  }
}
