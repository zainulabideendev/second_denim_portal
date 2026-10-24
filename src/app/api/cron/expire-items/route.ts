import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";

const SYSTEM_UID = "cron-system";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  let expiredProxies = 0;
  let expiredPhones = 0;

  try {
    const nowIso = now.toISOString();

    const [proxyRes, phoneRes] = await Promise.all([
      supabaseAdmin()
        .from("proxies")
        .select("id, status, expires_at")
        .lte("expires_at", nowIso)
        .in("status", ["available", "active", "assigned", "fresh"]),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id, status, expires_at")
        .lte("expires_at", nowIso)
        .in("status", ["available", "active", "assigned"]),
    ]);

    const proxyDocs = proxyRes.data ?? [];
    const phoneDocs = phoneRes.data ?? [];

    if (proxyDocs.length > 0) {
      const ids = proxyDocs.map((d) => d.id);
      const { error } = await supabaseAdmin()
        .from("proxies")
        .update({ status: "expired" })
        .in("id", ids);
      if (error) throw new Error(error.message);

      await Promise.all(
        proxyDocs.map((doc) =>
          writeAuditLog({
            actorUid: SYSTEM_UID,
            action: "proxy.expired",
            targetType: "proxy",
            targetId: doc.id,
            metadata: { expiresAt: doc.expires_at },
          })
        )
      );
      expiredProxies = proxyDocs.length;
    }

    if (phoneDocs.length > 0) {
      const ids = phoneDocs.map((d) => d.id);
      const { error } = await supabaseAdmin()
        .from("phone_numbers")
        .update({ status: "expired" })
        .in("id", ids);
      if (error) throw new Error(error.message);

      await Promise.all(
        phoneDocs.map((doc) =>
          writeAuditLog({
            actorUid: SYSTEM_UID,
            action: "phone.expired",
            targetType: "phone",
            targetId: doc.id,
            metadata: { expiresAt: doc.expires_at },
          })
        )
      );
      expiredPhones = phoneDocs.length;
    }

    return NextResponse.json({
      success: true,
      data: { expiredProxies, expiredPhones, runAt: now.toISOString() },
    });
  } catch (error) {
    console.error("Cron expire-items error:", error);
    return NextResponse.json(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
