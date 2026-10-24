import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";

export async function GET() {
  try {
    const actor = await requireAuth();

    const { data, error } = await supabaseAdmin()
      .from("requests")
      .select("*")
      .eq("requested_by", actor.uid)
      .limit(100);

    if (error) throw new Error(error.message);

    const requests = (data ?? [])
      .map((d) => ({
        id: d.id,
        type: d.type,
        requestedBy: d.requested_by,
        country: d.country,
        reason: d.reason,
        status: d.status,
        reviewedBy: d.reviewed_by ?? null,
        reviewedAt: d.reviewed_at ?? null,
        fulfilledItemId: d.fulfilled_item_id ?? null,
        createdAt: d.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    return handleAuthError(err);
  }
}
