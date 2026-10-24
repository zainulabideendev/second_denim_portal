import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { mapSmsPvaOrder, type SmsPvaOrderRow } from "@/lib/sms-pva-orders";
import {
  SmspvaError,
  smspvaDenial,
  type SmspvaCountry,
} from "@/lib/smspva";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);
    const { id } = await ctx.params;
    const isAdmin = actor.role === "admin" || actor.role === "manager";

    let q = supabaseAdmin().from("sms_pva_orders").select("*").eq("id", id);
    if (!isAdmin) q = q.eq("user_id", actor.uid);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);

    const row = data as SmsPvaOrderRow | null;
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Order not found." },
        { status: 404 }
      );
    }

    if (row.status !== "waiting") {
      return NextResponse.json(
        {
          success: false,
          error: `This order is already ${row.status} and cannot be cancelled.`,
          data: mapSmsPvaOrder(row),
        },
        { status: 409 }
      );
    }

    try {
      await smspvaDenial(
        row.country as SmspvaCountry,
        row.smspva_order_id,
        row.service
      );
    } catch (err) {
      const message =
        err instanceof SmspvaError
          ? err.message
          : "Could not cancel the number. Please try again.";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin()
      .from("sms_pva_orders")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user before code arrived.",
        completed_at: now,
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (updErr || !updated) {
      return NextResponse.json(
        { success: false, error: updErr?.message ?? "Failed to update order." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapSmsPvaOrder(updated as SmsPvaOrderRow),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
