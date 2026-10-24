import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin"]);

    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType");
    const action = searchParams.get("action");

    let query = supabaseAdmin()
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (targetType) query = query.eq("target_type", targetType);
    if (action) query = query.eq("action", action);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const uids = [
      ...new Set(
        (data ?? [])
          .map((d) => d.actor_uid)
          .filter((uid): uid is string => !!uid)
      ),
    ];

    const { data: profiles } = uids.length
      ? await supabaseAdmin().from("profiles").select("id, name").in("id", uids)
      : { data: [] as { id: string; name: string }[] };

    const userMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

    const logs = (data ?? []).map((d) => ({
      id: d.id,
      actorUid: d.actor_uid,
      actorName: d.actor_uid
        ? (userMap.get(d.actor_uid) ?? "Unknown")
        : "Unknown",
      action: d.action,
      targetType: d.target_type,
      targetId: d.target_id,
      metadata: d.metadata ?? {},
      createdAt: d.created_at,
    }));

    return NextResponse.json({ success: true, data: logs });
  } catch (err) {
    return handleAuthError(err);
  }
}
