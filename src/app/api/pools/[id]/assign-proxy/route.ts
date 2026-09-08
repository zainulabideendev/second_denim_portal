import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toIso } from "@/lib/utils-server";
import {
  canPromoteToActive,
  getActiveLimit,
  getActivePoolCounts,
  getBackupLimit,
  normalizeLane,
} from "@/lib/pool-utils";
import type { Country } from "@/lib/types";

const bodySchema = z.object({
  proxyId: z.string().min(1),
  lane: z.enum(["backup", "active"]).default("backup"),
});

/**
 * Admin manually assigns a specific proxy into a user country pool.
 * Does not auto-pick — admin chooses the proxy.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin"]);
    const { id: poolId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const { proxyId, lane } = parsed.data;
    const db = adminDb();

    const poolDoc = await db.collection("userPools").doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ success: false, error: "Pool not found" }, { status: 404 });
    }

    const pool = poolDoc.data()!;
    const userId = pool.userId as string;
    const country = pool.country as Country;
    const activeLimit = getActiveLimit(Number(pool.sizePerLane) || 3);
    const backupLimit = getBackupLimit(
      Number(pool.sizePerLane) || 3,
      pool.backupLimit != null ? Number(pool.backupLimit) : null
    );

    const proxyDoc = await db.collection("proxies").doc(proxyId).get();
    if (!proxyDoc.exists) {
      return NextResponse.json({ success: false, error: "Proxy not found" }, { status: 404 });
    }

    const proxy = proxyDoc.data()!;
    if (proxy.country !== country) {
      return NextResponse.json(
        { success: false, error: `Proxy country must be ${country}` },
        { status: 400 }
      );
    }

    const status = proxy.status as string;
    if (status !== "fresh" && status !== "available") {
      return NextResponse.json(
        { success: false, error: "Proxy must be fresh or available" },
        { status: 409 }
      );
    }

    const assignedSnap = await db
      .collection("proxies")
      .where("assignedTo", "==", userId)
      .get();

    const assignedInCountry = assignedSnap.docs
      .filter((d) => d.data().status === "assigned" && d.data().country === country)
      .map((d) => {
        const data = d.data();
        return {
          country: data.country as Country,
          lane: data.lane as string | undefined,
          restricted: Boolean(data.restricted),
        };
      });

    let backupCount = 0;
    for (const p of assignedInCountry) {
      if (normalizeLane(p.lane) === "backup") backupCount++;
    }

    if (lane === "backup") {
      if (backupCount >= backupLimit) {
        return NextResponse.json(
          {
            success: false,
            error: `Backup pool is full (${backupCount}/${backupLimit})`,
          },
          { status: 409 }
        );
      }
    } else {
      const counts = getActivePoolCounts(assignedInCountry, country);
      if (!canPromoteToActive(counts, activeLimit)) {
        return NextResponse.json(
          {
            success: false,
            error: `Active pool is full (${counts.working}/${activeLimit})`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date();
    await proxyDoc.ref.update({
      status: "assigned",
      assignedTo: userId,
      assignedAt: now,
      lane,
      stagingDone: false,
      accountsCreated: false,
      restricted: false,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.assigned",
      targetType: "proxy",
      targetId: proxyId,
      metadata: {
        assignedTo: userId,
        country,
        lane,
        poolId,
        manualPoolAssign: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        proxyId,
        poolId,
        assignedTo: userId,
        country,
        lane,
        assignedAt: toIso(now),
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
