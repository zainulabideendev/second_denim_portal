import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { FieldValue } from "firebase-admin/firestore";

const proxyRowSchema = z.object({
  host: z.string().min(1),
  port: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional().default(""),
});

const importBodySchema = z.object({
  rows: z.array(proxyRowSchema).min(1).max(500),
  rawFileName: z.string().default("manual-paste"),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);

    const body = await request.json();
    const parsed = importBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rows, rawFileName } = parsed.data;
    const db = adminDb();

    // Create import batch record
    const batchRef = db.collection("importBatches").doc();
    const batchId = batchRef.id;

    // Write proxies in a single Firestore batch
    const writeBatch = db.batch();

    writeBatch.set(batchRef, {
      type: "proxy",
      importedBy: actor.uid,
      importedAt: FieldValue.serverTimestamp(),
      count: rows.length,
      rawFileName,
      createdAt: FieldValue.serverTimestamp(),
    });

    const proxyIds: string[] = [];
    for (const row of rows) {
      const proxyRef = db.collection("proxies").doc();
      proxyIds.push(proxyRef.id);
      writeBatch.set(proxyRef, {
        country: row.country,
        host: row.host,
        port: row.port,
        username: row.username,
        password: row.password,
        provider: row.provider,
        purchasedAt: new Date(row.purchasedAt),
        expiresAt: new Date(row.expiresAt),
        status: "fresh",
        assignedTo: null,
        assignedAt: null,
        batchId,
        notes: row.notes ?? "",
        syncedEmailId: null,
        syncedAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await writeBatch.commit();

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.imported",
      targetType: "proxy",
      targetId: batchId,
      metadata: { count: rows.length, rawFileName, batchId },
    });

    return NextResponse.json(
      {
        success: true,
        data: { batchId, count: rows.length, proxyIds },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
