import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  assignAvailablePhone,
  countActivePhones,
  notifyManagers,
  toIso,
} from "@/lib/utils-server";

const requestSchema = z.object({
  country: z.enum(["FR", "BE", "UK", "DE"]),
  reason: z.string().max(500).optional().default(""),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["salesman", "manager", "admin"]);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { country, reason } = parsed.data;
    const limit: number = actor.activeProxyLimit ?? 4;
    const activeCount = await countActivePhones(actor.uid);

    if (activeCount >= limit) {
      if (!reason) {
        return NextResponse.json(
          {
            success: false,
            error: `You have reached your phone number limit (${limit}). Please provide a reason to request an additional number.`,
            requiresReason: true,
          },
          { status: 422 }
        );
      }

      const { data: reqRow, error } = await supabaseAdmin()
        .from("requests")
        .insert({
          type: "phone",
          requested_by: actor.uid,
          requested_by_name: actor.name,
          requested_by_email: actor.email,
          country,
          reason,
          status: "pending",
        })
        .select("id")
        .single();

      if (error || !reqRow) throw new Error(error?.message ?? "Failed to create request");

      await notifyManagers({
        type: "request_pending",
        message: `${actor.name} requested an extra phone number (${country}): "${reason}"`,
        relatedId: reqRow.id,
      });

      return NextResponse.json({
        success: true,
        data: {
          autoAssigned: false,
          requestId: reqRow.id,
          message: "Request submitted and pending manager approval.",
        },
      });
    }

    const { data: available } = await supabaseAdmin()
      .from("phone_numbers")
      .select("id")
      .eq("country", country)
      .eq("status", "available")
      .limit(1);

    if (!available?.length) {
      return NextResponse.json(
        {
          success: false,
          error: `No available ${country} phone numbers at the moment. Contact management to import more.`,
          noStock: true,
        },
        { status: 409 }
      );
    }

    const phone = await assignAvailablePhone(country, actor.uid, actor.uid);

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Assignment failed — please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        autoAssigned: true,
        phone: {
          id: phone.id,
          country: phone.country,
          number: phone.number,
          provider: phone.provider,
          purchasedAt: toIso(phone.purchasedAt),
          expiresAt: toIso(phone.expiresAt),
          status: "active",
          assignedTo: actor.uid,
          assignedAt: new Date().toISOString(),
        },
        message: "Phone number assigned successfully.",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
