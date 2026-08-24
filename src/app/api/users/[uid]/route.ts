import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["admin", "manager", "salesman"]).optional(),
  country: z.enum(["FR", "BE", "UK", "DE"]).nullable().optional(),
  poolCountries: z
    .array(z.enum(["FR", "BE", "UK", "DE"]))
    .min(1)
    .max(3)
    .optional(),
  activeProxyLimit: z.number().int().min(1).max(100).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const actor = await requireAuth(["admin"]);
    const { uid } = await params;
    const db = adminDb();

    const doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    void actor;
    const d = doc.data()!;
    return NextResponse.json({
      success: true,
      data: {
        uid: doc.id,
        name: d.name,
        email: d.email,
        role: d.role,
        country: d.country ?? null,
        poolCountries: d.poolCountries ?? [],
        activeProxyLimit: d.activeProxyLimit ?? 4,
        status: d.status,
        createdAt: toIso(d.createdAt),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const actor = await requireAuth(["admin"]);
    const { uid } = await params;

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parsed.data;
    const db = adminDb();

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    await db.collection("users").doc(uid).update(updates);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "user.updated",
      targetType: "user",
      targetId: uid,
      metadata: updates,
    });

    return NextResponse.json({ success: true, data: { uid, ...updates } });
  } catch (err) {
    return handleAuthError(err);
  }
}
