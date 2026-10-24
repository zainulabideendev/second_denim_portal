import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    let query = supabaseAdmin().from("requests").select("*").limit(150);
    if (status)
      query = query.eq(
        "status",
        status as "pending" | "approved" | "rejected" | "fulfilled"
      );

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const missingUids = new Set<string>();
    (data ?? []).forEach((d) => {
      if (!d.requested_by_name && d.requested_by) missingUids.add(d.requested_by);
      if (d.reviewed_by && !d.reviewed_by_name) missingUids.add(d.reviewed_by);
    });

    const { data: profiles } = missingUids.size
      ? await supabaseAdmin()
          .from("profiles")
          .select("id, name, email")
          .in("id", Array.from(missingUids))
      : { data: [] as { id: string; name: string; email: string }[] };

    const userMap = new Map(
      (profiles ?? []).map((p) => [p.id, { name: p.name, email: p.email }])
    );

    let requests = (data ?? []).map((d) => {
      const reqUser = d.requested_by_name
        ? { name: d.requested_by_name, email: d.requested_by_email ?? "" }
        : userMap.get(d.requested_by);
      const revUser = d.reviewed_by
        ? d.reviewed_by_name
          ? { name: d.reviewed_by_name, email: d.reviewed_by_email ?? "" }
          : userMap.get(d.reviewed_by)
        : null;
      return {
        id: d.id,
        type: d.type,
        requestedBy: d.requested_by,
        requestedByUser: reqUser
          ? { uid: d.requested_by, name: reqUser.name, email: reqUser.email }
          : null,
        country: d.country,
        reason: d.reason,
        status: d.status,
        reviewedBy: d.reviewed_by ?? null,
        reviewedByUser: revUser
          ? { uid: d.reviewed_by!, name: revUser.name, email: revUser.email }
          : null,
        reviewedAt: d.reviewed_at ?? null,
        fulfilledItemId: d.fulfilled_item_id ?? null,
        createdAt: d.created_at,
      };
    });

    if (type) requests = requests.filter((r) => r.type === type);
    requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    return handleAuthError(err);
  }
}
