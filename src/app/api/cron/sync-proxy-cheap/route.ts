import { NextRequest, NextResponse } from "next/server";
import { syncProxyCheapFromApi } from "@/lib/proxy-cheap-sync";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret === cronSecret) return true;

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${cronSecret}`) return true;

  return false;
}

function wantsDryRun(request: NextRequest): boolean {
  const q = request.nextUrl.searchParams.get("dryRun");
  return q === "1" || q === "true";
}

async function runSync(request: NextRequest) {
  try {
    const dryRun = wantsDryRun(request);
    const data = await syncProxyCheapFromApi({ dryRun });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Cron sync-proxy-cheap error:", error);
    const message = error instanceof Error ? error.message : "Cron job failed";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return runSync(request);
}

/** Vercel Cron invokes scheduled paths with GET by default. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return runSync(request);
}
