import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { enrichProxiesWithSyncedEmails, mapProxyDoc } from "@/lib/sync-enrich";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    let query = supabaseAdmin().from("proxies").select("*").limit(500);

    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    else if (country) query = query.eq("country", country as "FR" | "BE" | "UK" | "DE");
    else if (status)
      query = query.eq(
        "status",
        status as
          | "fresh"
          | "available"
          | "active"
          | "assigned"
          | "expired"
          | "flagged"
          | "retired"
      );

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let proxies = (data ?? []).map(mapProxyDoc);

    if (country && assignedTo)
      proxies = proxies.filter((p) => p.country === country);
    if (status && (assignedTo || country))
      proxies = proxies.filter((p) => p.status === status);

    proxies.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

    const enriched = await enrichProxiesWithSyncedEmails(proxies);
    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
