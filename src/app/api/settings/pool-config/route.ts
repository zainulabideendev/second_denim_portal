import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { getPoolConfig, savePoolConfig } from "@/lib/pool-config";
import { writeAuditLog } from "@/lib/audit";
import { COUNTRIES } from "@/lib/types";

const patchSchema = z.object({
  defaultSizePerLane: z.number().int().min(1).max(10).optional(),
  byCountry: z
    .record(
      z.enum(["FR", "BE", "UK", "DE"]),
      z.object({ sizePerLane: z.number().int().min(1).max(10) })
    )
    .optional(),
});

export async function GET() {
  try {
    await requireAuth(["admin"]);
    const config = await getPoolConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid config" },
        { status: 400 }
      );
    }

    const current = await getPoolConfig();
    const next = {
      defaultSizePerLane:
        parsed.data.defaultSizePerLane ?? current.defaultSizePerLane,
      byCountry: { ...current.byCountry, ...(parsed.data.byCountry ?? {}) },
    };

    for (const country of COUNTRIES) {
      if (!next.byCountry[country]) {
        next.byCountry[country] = { sizePerLane: next.defaultSizePerLane };
      }
    }

    const saved = await savePoolConfig(next, actor.uid);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.config_updated",
      targetType: "user",
      targetId: "poolConfig",
      metadata: next,
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    return handleAuthError(err);
  }
}
