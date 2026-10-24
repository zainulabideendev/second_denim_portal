import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { notifyManagers } from "@/lib/utils-server";

const requestSchema = z.object({
  country: z.enum(["FR", "BE", "UK", "DE"]),
  reason: z.string().min(1, "Reason is required").max(500),
});

/**
 * Salesman requests a proxy — always creates a pending request.
 * Admin assigns the proxy manually; nothing is auto-assigned here.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["salesman", "manager", "admin"]);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
          requiresReason: true,
        },
        { status: 422 }
      );
    }

    const { country, reason } = parsed.data;

    const { data: reqRow, error } = await supabaseAdmin()
      .from("requests")
      .insert({
        type: "proxy",
        requested_by: actor.uid,
        requested_by_name: actor.name,
        requested_by_email: actor.email,
        country,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !reqRow) {
      throw new Error(error?.message ?? "Failed to create request");
    }

    await notifyManagers({
      type: "request_pending",
      message: `${actor.name} requested a proxy (${country}): "${reason}"`,
      relatedId: reqRow.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        autoAssigned: false,
        requestId: reqRow.id,
        message: "Request submitted. An admin will assign a proxy manually.",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
