import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 }
      );
    }

    const { proxyId, lane } = parsed.data;

    const { data: pool } = await supabaseAdmin()
      .from("user_pools")
      .select("*")
      .eq("id", poolId)
      .maybeSingle();

    if (!pool) {
      return NextResponse.json(
        { success: false, error: "Pool not found" },
        { status: 404 }
      );
    }

    const userId = pool.user_id;
    const country = pool.country as Country;
    const activeLimit = getActiveLimit(Number(pool.size_per_lane) || 3);
    const backupLimit = getBackupLimit(
      Number(pool.size_per_lane) || 3,
      pool.backup_limit != null ? Number(pool.backup_limit) : null
    );

    const { data: proxy } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", proxyId)
      .maybeSingle();

    if (!proxy) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    if (proxy.country !== country) {
      return NextResponse.json(
        { success: false, error: `Proxy country must be ${country}` },
        { status: 400 }
      );
    }

    if (proxy.status !== "fresh" && proxy.status !== "available") {
      return NextResponse.json(
        { success: false, error: "Proxy must be fresh or available" },
        { status: 409 }
      );
    }

    const { data: assignedSnap } = await supabaseAdmin()
      .from("proxies")
      .select("country, lane, restricted, status")
      .eq("assigned_to", userId);

    const assignedInCountry = (assignedSnap ?? [])
      .filter((d) => d.status === "assigned" && d.country === country)
      .map((d) => ({
        country: d.country as Country,
        lane: d.lane ?? undefined,
        restricted: Boolean(d.restricted),
      }));

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
    const { error } = await supabaseAdmin()
      .from("proxies")
      .update({
        status: "assigned",
        assigned_to: userId,
        assigned_at: now.toISOString(),
        lane,
        staging_done: false,
        accounts_created: false,
        restricted: false,
      })
      .eq("id", proxyId);

    if (error) throw new Error(error.message);

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
