import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { syncUserPoolMeta } from "@/lib/user-pools";
import type { Country } from "@/lib/types";

const updateSchema = z.object({
  userId: z.string().min(1).optional(),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
  sizePerLane: z.number().int().min(1).max(10).optional(),
  backupLimit: z.number().int().min(0).max(20).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const poolRef = db.collection("userPools").doc(id);
    const poolDoc = await poolRef.get();

    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: "Pool not found" }, { status: 404 });
    }

    const current = poolDoc.data()!;
    const nextUserId = parsed.data.userId ?? (current.userId as string);
    const nextCountry = (parsed.data.country ?? current.country) as Country;
    const nextActive = parsed.data.sizePerLane ?? (current.sizePerLane as number);
    const nextBackup =
      parsed.data.backupLimit ??
      (current.backupLimit != null ? Number(current.backupLimit) : nextActive * 2);

    const userChanged = nextUserId !== current.userId;
    const countryChanged = nextCountry !== current.country;

    // Load target user when needed
    let userName = current.userName as string;
    let userEmail = current.userEmail as string;

    if (userChanged || countryChanged) {
      const userDoc = await db.collection("users").doc(nextUserId).get();
      if (!userDoc.exists) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
      }
      const u = userDoc.data()!;
      if (u.role !== "salesman") {
        return NextResponse.json(
          { success: false, error: "Pools can only be assigned to salesmen" },
          { status: 400 }
        );
      }
      userName = u.name;
      userEmail = u.email;

      // Conflict: same user already has this country (another pool doc)
      // Single-field query — filter country in JS to avoid composite index
      const existing = await db
        .collection("userPools")
        .where("userId", "==", nextUserId)
        .get();

      const conflict = existing.docs.find(
        (d) => d.id !== id && d.data().country === nextCountry
      );
      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: `${userName} already has a ${nextCountry} pool`,
          },
          { status: 409 }
        );
      }
    }

    await poolRef.update({
      userId: nextUserId,
      userName,
      userEmail,
      country: nextCountry,
      sizePerLane: nextActive,
      backupLimit: nextBackup,
    });

    // Refresh user meta for old and/or new owner
    const usersToSync = new Set<string>([current.userId as string, nextUserId]);
    for (const uid of usersToSync) {
      await syncUserPoolMeta(uid);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.updated",
      targetType: "user",
      targetId: nextUserId,
      metadata: {
        poolId: id,
        before: {
          userId: current.userId,
          country: current.country,
          sizePerLane: current.sizePerLane,
          backupLimit: current.backupLimit ?? null,
        },
        after: {
          userId: nextUserId,
          country: nextCountry,
          sizePerLane: nextActive,
          backupLimit: nextBackup,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id,
        userId: nextUserId,
        userName,
        userEmail,
        country: nextCountry,
        sizePerLane: nextActive,
        backupLimit: nextBackup,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin"]);
    const { id } = await params;
    const db = adminDb();
    const poolRef = db.collection("userPools").doc(id);
    const poolDoc = await poolRef.get();

    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: "Pool not found" }, { status: 404 });
    }

    const data = poolDoc.data()!;
    const userId = data.userId as string;

    await poolRef.delete();
    await syncUserPoolMeta(userId);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.deleted",
      targetType: "user",
      targetId: userId,
      metadata: {
        poolId: id,
        country: data.country,
        sizePerLane: data.sizePerLane,
        backupLimit: data.backupLimit ?? null,
      },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    return handleAuthError(err);
  }
}
