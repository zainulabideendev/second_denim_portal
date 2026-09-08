import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createUserCountryPools,
  enrichPoolRows,
  getAllUserPoolAssignments,
} from "@/lib/user-pools";
import { autoRefillUserPoolForCountry } from "@/lib/utils-server";

export async function GET() {
  try {
    await requireAuth(["admin"]);
    const assignments = await getAllUserPoolAssignments();
    const pools = await enrichPoolRows(assignments);
    return NextResponse.json({ success: true, data: pools });
  } catch (err) {
    return handleAuthError(err);
  }
}

const createSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  countrySizes: z
    .array(
      z.object({
        country: z.enum(["FR", "BE", "UK", "DE"]),
        sizePerLane: z.number().int().min(1).max(10),
        backupLimit: z.number().int().min(0).max(20),
      })
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const uniqueUserIds = [...new Set(parsed.data.userIds)];
    const uniqueCountries = new Map(
      parsed.data.countrySizes.map((c) => [
        c.country,
        { sizePerLane: c.sizePerLane, backupLimit: c.backupLimit },
      ])
    );
    const countrySizes = [...uniqueCountries.entries()].map(
      ([country, sizes]) => ({ country, ...sizes })
    );

    const db = adminDb();
    const userDocs = await Promise.all(
      uniqueUserIds.map((uid) => db.collection("users").doc(uid).get())
    );

    const usersById = new Map<
      string,
      { name: string; email: string; role: string }
    >();
    for (const doc of userDocs) {
      if (!doc.exists) {
        return NextResponse.json(
          { success: false, error: `User not found: ${doc.id}` },
          { status: 404 }
        );
      }
      const d = doc.data()!;
      usersById.set(doc.id, {
        name: d.name,
        email: d.email,
        role: d.role,
      });
    }

    const result = await createUserCountryPools({
      userIds: uniqueUserIds,
      countrySizes,
      actorUid: actor.uid,
      usersById,
    });

    let filled = 0;
    for (const { country, sizePerLane, backupLimit } of countrySizes) {
      for (const userId of uniqueUserIds) {
        filled += await autoRefillUserPoolForCountry(
          userId,
          country,
          actor.uid,
          sizePerLane,
          backupLimit
        );
      }
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.created",
      targetType: "user",
      targetId: "bulk",
      metadata: {
        userIds: uniqueUserIds,
        countrySizes,
        created: result.created,
        filled,
      },
    });

    return NextResponse.json(
      { success: true, data: { ...result, filled } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("already has")) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    return handleAuthError(err);
  }
}
