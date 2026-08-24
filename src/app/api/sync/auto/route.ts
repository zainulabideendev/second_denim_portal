import { NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { autoSyncFreshPairs } from "@/lib/proxy-email-sync";

export async function POST() {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const result = await autoSyncFreshPairs(actor.uid);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
