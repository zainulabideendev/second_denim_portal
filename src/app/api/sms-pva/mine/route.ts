import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { mapSmsPvaOrder, type SmsPvaOrderRow } from "@/lib/sms-pva-orders";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") ?? 30) || 30,
      100
    );

    const { data, error } = await supabaseAdmin()
      .from("sms_pva_orders")
      .select("*")
      .eq("user_id", actor.uid)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: ((data ?? []) as SmsPvaOrderRow[]).map(mapSmsPvaOrder),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
