import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError, invalidateUserCache } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  computePoolLimit,
  getPoolConfig,
  resolveUserPoolCountries,
} from "@/lib/pool-config";
import { MAX_POOL_COUNTRIES } from "@/lib/types";

const bodySchema = z.object({
  poolCountries: z
    .array(z.enum(["FR", "BE", "UK", "DE"]))
    .min(1)
    .max(MAX_POOL_COUNTRIES),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    await requireAuth(["admin"]);
    const { uid } = await params;

    const { data: doc } = await supabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        uid,
        poolCountries: resolveUserPoolCountries({
          poolCountries: doc.pool_countries,
          country: doc.country ?? undefined,
        }),
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
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
        },
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

    const { data: userDoc } = await supabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (userDoc.role !== "salesman") {
      return NextResponse.json(
        {
          success: false,
          error: "Pool countries can only be set for salesmen",
        },
        { status: 400 }
      );
    }

    const config = await getPoolConfig();
    const activeProxyLimit = computePoolLimit(uniqueCountries, config);

    const { error } = await supabaseAdmin()
      .from("profiles")
      .update({
        pool_countries: uniqueCountries,
        active_proxy_limit: activeProxyLimit,
      })
      .eq("id", uid);

    if (error) throw new Error(error.message);

    invalidateUserCache(uid);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "pool.user_countries_updated",
      targetType: "user",
      targetId: uid,
      metadata: {
        poolCountries: uniqueCountries,
        activeProxyLimit,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        uid,
        poolCountries: uniqueCountries,
        activeProxyLimit,
        filled: 0,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
