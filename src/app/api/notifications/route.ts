import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth();
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 20)
      : 10;

    const { data, error } = await supabaseAdmin()
      .from("notifications")
      .select("*")
      .eq("uid", actor.uid)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const notifications = (data ?? []).map((d) => ({
      id: d.id,
      uid: d.uid,
      type: d.type,
      message: d.message,
      read: d.read,
      createdAt: d.created_at,
      relatedId: d.related_id ?? null,
    }));

    return NextResponse.json({ success: true, data: notifications });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH() {
  try {
    const actor = await requireAuth();

    const { data, error } = await supabaseAdmin()
      .from("notifications")
      .update({ read: true })
      .eq("uid", actor.uid)
      .eq("read", false)
      .select("id");

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: { markedRead: data?.length ?? 0 },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
