import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "manager", "salesman"]),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
  activeProxyLimit: z.number().int().min(1).max(20).default(4),
});

export async function GET() {
  try {
    const actor = await requireAuth(["admin"]);
    const db = adminDb();

    const snapshot = await db
      .collection("users")
      .orderBy("createdAt", "desc")
      .get();

    const users = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        uid: doc.id,
        name: d.name,
        email: d.email,
        role: d.role,
        country: d.country ?? null,
        poolCountries: d.poolCountries ?? [],
        activeProxyLimit: d.activeProxyLimit ?? 4,
        status: d.status,
        createdAt: toIso(d.createdAt),
      };
    });

    void actor; // used for auth check

    return NextResponse.json({ success: true, data: users });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, role, country, activeProxyLimit } = parsed.data;

    // Create Firebase Auth user
    const authUser = await adminAuth().createUser({
      email,
      password,
      displayName: name,
    });

    const db = adminDb();
    await db.collection("users").doc(authUser.uid).set({
      name,
      email,
      role,
      ...(country ? { country } : {}),
      activeProxyLimit,
      status: "active",
      createdAt: new Date(),
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "user.created",
      targetType: "user",
      targetId: authUser.uid,
      metadata: { name, email, role },
    });

    return NextResponse.json(
      {
        success: true,
        data: { uid: authUser.uid, name, email, role, activeProxyLimit, status: "active" },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
