import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { phoneProxySnapshotFields } from "@/lib/sync-enrich";

const bodySchema = z.object({
  number: z.string().min(1, "Phone number required"),
  provider: z.string().min(1, "Provider required").default("manual"),
  numberType: z.enum(["temporary", "permanent"]).optional().default("temporary"),
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional().default(""),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
});

/**
 * Admin/manager: create a phone number and link it to this proxy.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: proxyId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid data",
        },
        { status: 400 }
      );
    }

    const { data: proxyData } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", proxyId)
      .maybeSingle();

    if (!proxyData) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const number = parsed.data.number.trim();
    const country =
      parsed.data.country ??
      (["FR", "BE", "UK", "DE"].includes(proxyData.country)
        ? proxyData.country
        : "UK");
    const today = format(new Date(), "yyyy-MM-dd");
    const purchasedAt = parsed.data.purchasedAt ?? today;
    const expiresAt =
      parsed.data.expiresAt ?? format(addDays(new Date(), 30), "yyyy-MM-dd");

    const { data: existing } = await supabaseAdmin()
      .from("phone_numbers")
      .select("id")
      .eq("number", number)
      .limit(1);

    if (existing?.length) {
      return NextResponse.json(
        {
          success: false,
          error: "A phone number with this value already exists",
        },
        { status: 409 }
      );
    }

    const assignedTo = proxyData.assigned_to ?? null;
    const assignedAt = assignedTo ? new Date().toISOString() : null;

    const prevPhoneId = proxyData.phone_id?.trim() ?? "";
    if (prevPhoneId) {
      await supabaseAdmin()
        .from("phone_numbers")
        .update({
          proxy_id: null,
          ...phoneProxySnapshotFields(null),
        })
        .eq("id", prevPhoneId);
    }

    const { data: phoneRow, error: insertError } = await supabaseAdmin()
      .from("phone_numbers")
      .insert({
        country,
        number,
        provider: parsed.data.provider.trim() || "manual",
        purchased_at: new Date(purchasedAt).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        number_type: parsed.data.numberType ?? "temporary",
        status: assignedTo ? "active" : "available",
        assigned_to: assignedTo,
        assigned_at: assignedAt,
        batch_id: "",
        notes: parsed.data.notes ?? "",
        proxy_id: proxyId,
        ...phoneProxySnapshotFields(proxyData),
      })
      .select("id")
      .single();

    if (insertError || !phoneRow) {
      throw new Error(insertError?.message ?? "Failed to create phone");
    }

    await supabaseAdmin()
      .from("proxies")
      .update({
        phone_id: phoneRow.id,
        phone_number: number,
      })
      .eq("id", proxyId);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: phoneRow.id,
      metadata: {
        number,
        country,
        proxyId,
        assignedTo,
        source: "add-phone-to-proxy",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneId: phoneRow.id,
        proxyId,
        number,
        country,
        assignedTo,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
