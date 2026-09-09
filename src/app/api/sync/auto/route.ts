import { NextResponse } from "next/server";
// import { requireAuth, handleAuthError } from "@/lib/auth";
// import { autoSyncFreshPairs } from "@/lib/proxy-email-sync";

// Auto Sync Fresh (proxy–email) — temporarily disabled
export async function POST() {
  return NextResponse.json(
    { success: false, error: "Auto sync email is disabled" },
    { status: 503 }
  );

  /*
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
  */
}
