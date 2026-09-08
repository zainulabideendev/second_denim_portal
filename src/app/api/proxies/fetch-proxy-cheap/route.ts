import { NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { syncProxyCheapFromApi } from "@/lib/proxy-cheap-sync";

/**
 * Admin/manager: fetch proxies from Proxy-Cheap (UK/BE/FR) and insert new ones.
 * Matching is by proxyCheapId — existing docs are never updated.
 */
export async function POST() {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const data = await syncProxyCheapFromApi({ actorUid: actor.uid });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not configured")) {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    if (err instanceof Error && err.message.includes("Proxy-Cheap")) {
      return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
    return handleAuthError(err);
  }
}
