import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/audit";

const SYSTEM_UID = "cron-system";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = adminDb();
  const now = new Date();
  let expiredProxies = 0;
  let expiredPhones = 0;

  try {
    // Query only by expiresAt (single-field) — filter status in JS to avoid composite index
    const [proxySnap, phoneSnap] = await Promise.all([
      db.collection("proxies").where("expiresAt", "<=", now).get(),
      db.collection("phoneNumbers").where("expiresAt", "<=", now).get(),
    ]);

    const proxyDocs = proxySnap.docs.filter((d) =>
      ["available", "active", "assigned"].includes(d.data().status)
    );
    const phoneDocs = phoneSnap.docs.filter((d) =>
      ["available", "active", "assigned"].includes(d.data().status)
    );

    if (proxyDocs.length > 0) {
      const batch = db.batch();
      proxyDocs.forEach((doc) => batch.update(doc.ref, { status: "expired" }));
      await batch.commit();
      await Promise.all(
        proxyDocs.map((doc) =>
          writeAuditLog({
            actorUid: SYSTEM_UID,
            action: "proxy.expired",
            targetType: "proxy",
            targetId: doc.id,
            metadata: { expiresAt: doc.data().expiresAt?.toDate?.()?.toISOString() },
          })
        )
      );
      expiredProxies = proxyDocs.length;
    }

    if (phoneDocs.length > 0) {
      const batch = db.batch();
      phoneDocs.forEach((doc) => batch.update(doc.ref, { status: "expired" }));
      await batch.commit();
      await Promise.all(
        phoneDocs.map((doc) =>
          writeAuditLog({
            actorUid: SYSTEM_UID,
            action: "phone.expired",
            targetType: "phone",
            targetId: doc.id,
            metadata: { expiresAt: doc.data().expiresAt?.toDate?.()?.toISOString() },
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
    return NextResponse.json({ success: false, error: "Cron job failed" }, { status: 500 });
  }
}
