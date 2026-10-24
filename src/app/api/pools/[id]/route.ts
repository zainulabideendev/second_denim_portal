import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
        },
        { status: 400 }
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: current } = await supabaseAdmin()
      .from("user_pools")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Pool not found" },
        { status: 404 }
      );
    }

    const nextUserId = parsed.data.userId ?? current.user_id;
    const nextCountry = (parsed.data.country ?? current.country) as Country;
    const nextActive = parsed.data.sizePerLane ?? current.size_per_lane;
    const nextBackup =
      parsed.data.backupLimit ??
      (current.backup_limit != null
        ? Number(current.backup_limit)
        : nextActive * 2);

    const userChanged = nextUserId !== current.user_id;
    const countryChanged = nextCountry !== current.country;

    let userName = current.user_name;
    let userEmail = current.user_email;

    if (userChanged || countryChanged) {
      const { data: userDoc } = await supabaseAdmin()
        .from("profiles")
        .select("*")
        .eq("id", nextUserId)
        .maybeSingle();

      if (!userDoc) {
        return NextResponse.json(
          { success: false, error: "User not found" },
          { status: 404 }
        );
      }
      if (userDoc.role !== "salesman") {
        return NextResponse.json(
          { success: false, error: "Pools can only be assigned to salesmen" },
          { status: 400 }
        );
      }
      userName = userDoc.name;
      userEmail = userDoc.email;

      const { data: existing } = await supabaseAdmin()
        .from("user_pools")
        .select("id, country")
        .eq("user_id", nextUserId);

      const conflict = (existing ?? []).find(
        (d) => d.id !== id && d.country === nextCountry
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

    const { error } = await supabaseAdmin()
      .from("user_pools")
      .update({
        user_id: nextUserId,
        user_name: userName,
        user_email: userEmail,
        country: nextCountry,
        size_per_lane: nextActive,
        backup_limit: nextBackup,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    const usersToSync = new Set<string>([current.user_id, nextUserId]);
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
          userId: current.user_id,
          country: current.country,
          sizePerLane: current.size_per_lane,
          backupLimit: current.backup_limit ?? null,
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

    const { data } = await supabaseAdmin()
      .from("user_pools")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Pool not found" },
        { status: 404 }
      );
    }

    const userId = data.user_id;

    const { error } = await supabaseAdmin()
      .from("user_pools")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);

    await syncUserPoolMeta(userId);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.deleted",
      targetType: "user",
      targetId: userId,
      metadata: {
        poolId: id,
        country: data.country,
        sizePerLane: data.size_per_lane,
        backupLimit: data.backup_limit ?? null,
      },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    return handleAuthError(err);
  }
}
