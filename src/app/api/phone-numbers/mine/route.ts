import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { isPhoneAssignedStatus } from "@/lib/phone-utils";
import { enrichPhonesWithProxies, mapPhoneDoc } from "@/lib/sync-enrich";

export async function GET() {
  try {
    const actor = await requireAuth();

    const { data, error } = await supabaseAdmin()
      .from("phone_numbers")
      .select("*")
      .eq("assigned_to", actor.uid);

    if (error) throw new Error(error.message);

    const phones = (data ?? [])
      .filter((d) => isPhoneAssignedStatus(d.status))
      .map(mapPhoneDoc)
      .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""));

    const enriched = await enrichPhonesWithProxies(phones);
    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
