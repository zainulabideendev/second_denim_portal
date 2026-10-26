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
  assignedTo: z.string().uuid(),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Select a user to assign." },
        { status: 400 }
      );
    }

    const { data: userDoc } = await supabaseAdmin()
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.assignedTo)
      .maybeSingle();

    if (!userDoc) {
      return NextResponse.json(
        { success: false, error: "User not found." },
        { status: 404 }
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

    if (existing.status === "retired") {
      return NextResponse.json(
        { success: false, error: "Cannot assign a retired number." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin()
      .from("account_creation_numbers")
      .update({
        assigned_to: parsed.data.assignedTo,
        assigned_at: now,
        status: "assigned",
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !updated) throw new Error(error?.message ?? "Assign failed");

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.assigned",
      targetType: "account_creation_number",
      targetId: id,
      metadata: { assignedTo: parsed.data.assignedTo },
    });

    return NextResponse.json({
      success: true,
      data: mapAccountCreationNumber(updated as AccountCreationNumberRow),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
