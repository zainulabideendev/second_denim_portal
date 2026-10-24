import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { invalidateUserCache } from "@/lib/auth";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  invalidateUserCache();
  return NextResponse.json({ success: true });
}
