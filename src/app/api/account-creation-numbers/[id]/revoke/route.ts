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

const schema = z.object({
  retire: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    const retire = parsed.success ? parsed.data.retire : false;

    const { data: existing } = await supabaseAdmin()
      .from("account_creation_numbers")
      .select("id, proxy_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Number not found." },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    if (existing.proxy_id) {
      await supabaseAdmin()
        .from("proxies")
        .update({
          account_creation_number_id: null,
          account_creation_number: null,
          account_creation_number_linked_at: null,
        })
        .eq("id", existing.proxy_id)
        .eq("account_creation_number_id", id);
    }

    const { data: updated, error } = await supabaseAdmin()
      .from("account_creation_numbers")
      .update({
        assigned_to: null,
        assigned_at: null,
        proxy_id: null,
        proxy_host: null,
        proxy_port: null,
        proxy_country: null,
        status: retire ? "retired" : "available",
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !updated) throw new Error(error?.message ?? "Update failed");

    await writeAuditLog({
      actorUid: actor.uid,
      action: retire
        ? "account_creation_number.retired"
        : "account_creation_number.revoked",
      targetType: "account_creation_number",
      targetId: id,
      metadata: { retire },
    });

    return NextResponse.json({
      success: true,
      data: mapAccountCreationNumber(updated as AccountCreationNumberRow),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
