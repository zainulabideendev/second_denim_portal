import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  enrichEmailsWithSyncedProxies,
  mapEmailDoc,
} from "@/lib/sync-enrich";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    let query = supabaseAdmin().from("emails").select("*").limit(500);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let emails = (data ?? []).map(mapEmailDoc);
    if (status) emails = emails.filter((e) => e.status === status);
    emails.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const enriched = await enrichEmailsWithSyncedProxies(emails);
    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
