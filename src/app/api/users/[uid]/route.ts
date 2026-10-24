import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError, invalidateUserCache } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapProfile } from "@/lib/mappers";
import type { Database } from "@/lib/database.types";

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
    await requireAuth(["admin"]);
    const { uid } = await params;

    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: mapProfile(data) });
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
    const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.country !== undefined) patch.country = updates.country;
    if (updates.poolCountries !== undefined)
      patch.pool_countries = updates.poolCountries;
    if (updates.activeProxyLimit !== undefined)
      patch.active_proxy_limit = updates.activeProxyLimit;
    if (updates.status !== undefined) patch.status = updates.status;

    const { data: existing } = await supabaseAdmin()
      .from("profiles")
      .select("id")
      .eq("id", uid)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("profiles")
      .update(patch)
      .eq("id", uid);

    if (error) throw new Error(error.message);

    if (updates.status === "disabled") {
      await supabaseAdmin().auth.admin.updateUserById(uid, { ban_duration: "876000h" });
    } else if (updates.status === "active") {
      await supabaseAdmin().auth.admin.updateUserById(uid, { ban_duration: "none" });
    }

    invalidateUserCache(uid);

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
