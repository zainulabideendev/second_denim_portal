import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { FieldValue } from "firebase-admin/firestore";

const phoneRowSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional().default(""),
});

const importBodySchema = z.object({
  rows: z.array(phoneRowSchema).min(1).max(500),
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

    const batchRef = db.collection("importBatches").doc();
    const batchId = batchRef.id;

    const writeBatch = db.batch();

    writeBatch.set(batchRef, {
      type: "phone",
      importedBy: actor.uid,
      importedAt: FieldValue.serverTimestamp(),
      count: rows.length,
      rawFileName,
      createdAt: FieldValue.serverTimestamp(),
    });

    const phoneIds: string[] = [];
    for (const row of rows) {
      const phoneRef = db.collection("phoneNumbers").doc();
      phoneIds.push(phoneRef.id);
      writeBatch.set(phoneRef, {
        country: row.country,
        number: row.number,
        provider: row.provider,
        purchasedAt: new Date(row.purchasedAt),
        expiresAt: new Date(row.expiresAt),
        status: "available",
        assignedTo: null,
        assignedAt: null,
        batchId,
        notes: row.notes ?? "",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await writeBatch.commit();

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.imported",
      targetType: "phone",
      targetId: batchId,
      metadata: { count: rows.length, rawFileName, batchId },
    });

    return NextResponse.json(
      { success: true, data: { batchId, count: rows.length, phoneIds } },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
