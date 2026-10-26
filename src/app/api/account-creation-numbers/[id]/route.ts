import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  mapAccountCreationNumber,
  type AccountCreationNumberRow,
} from "@/lib/account-creation-numbers";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  notes: z.string().optional().default(""),
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid number details." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabaseAdmin()
      .from("account_creation_numbers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Number not found." },
        { status: 404 }
      );
    }

    const trimmed = parsed.data.number.trim();
    const { data: dup } = await supabaseAdmin()
      .from("account_creation_numbers")
      .select("id")
      .eq("number", trimmed)
      .neq("id", id)
      .limit(1);

    if (dup?.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Another account creation number already uses this value.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin()
      .from("account_creation_numbers")
      .update({
        number: trimmed,
        country: parsed.data.country,
        provider: parsed.data.provider.trim(),
        notes: parsed.data.notes ?? "",
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !updated) {
      throw new Error(error?.message ?? "Failed to update number");
    }

    // Keep denormalized value on linked proxy in sync
    if (existing.proxy_id) {
      await supabaseAdmin()
        .from("proxies")
        .update({
          account_creation_number: trimmed,
        })
        .eq("id", existing.proxy_id)
        .eq("account_creation_number_id", id);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.updated",
      targetType: "account_creation_number",
      targetId: id,
      metadata: {
        number: trimmed,
        country: parsed.data.country,
        provider: parsed.data.provider.trim(),
        previousNumber: existing.number,
      },
    });

    return NextResponse.json({
      success: true,
      data: mapAccountCreationNumber(updated as AccountCreationNumberRow),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
