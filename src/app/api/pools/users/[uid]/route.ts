import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  computePoolLimit,
  getPoolConfig,
  resolveUserPoolCountries,
} from "@/lib/pool-config";
import { autoRefillUserPools } from "@/lib/utils-server";
import { MAX_POOL_COUNTRIES } from "@/lib/types";

const bodySchema = z.object({
  poolCountries: z
    .array(z.enum(["FR", "BE", "UK", "DE"]))
    .min(1)
    .max(MAX_POOL_COUNTRIES),
  refill: z.boolean().optional().default(true),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    await requireAuth(["admin"]);
    const { uid } = await params;
    const db = adminDb();
    const doc = await db.collection("users").doc(uid).get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const data = doc.data()!;
    return NextResponse.json({
      success: true,
      data: {
        uid,
        poolCountries: resolveUserPoolCountries(data),
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
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const uniqueCountries = [...new Set(parsed.data.poolCountries)];
    if (uniqueCountries.length !== parsed.data.poolCountries.length) {
      return NextResponse.json(
        { success: false, error: "Duplicate countries are not allowed" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (userDoc.data()?.role !== "salesman") {
      return NextResponse.json(
        { success: false, error: "Pool countries can only be set for salesmen" },
        { status: 400 }
      );
    }

    const config = await getPoolConfig();
    const activeProxyLimit = computePoolLimit(uniqueCountries, config);

    await db.collection("users").doc(uid).update({
      poolCountries: uniqueCountries,
      activeProxyLimit,
    });

    let filled = 0;
    if (parsed.data.refill) {
      filled = await autoRefillUserPools(uid, actor.uid);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.user_countries_updated",
      targetType: "user",
      targetId: uid,
      metadata: {
        poolCountries: uniqueCountries,
        activeProxyLimit,
        filled,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        uid,
        poolCountries: uniqueCountries,
        activeProxyLimit,
        filled,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
