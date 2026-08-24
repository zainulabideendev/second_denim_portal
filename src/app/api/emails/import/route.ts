import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const rowSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
  notes: z.string().optional().default(""),
});

const importSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const batchRef = db.collection("importBatches").doc();
    const now = FieldValue.serverTimestamp();

    // Write import batch metadata
    await batchRef.set({
      type: "email",
      importedBy: actor.uid,
      importedAt: now,
      count: parsed.data.rows.length,
      createdAt: now,
    });

    // Write emails in Firestore batches (max 500 per batch)
    const rows = parsed.data.rows;
    const chunkSize = 490;
    let imported = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const row of chunk) {
        const ref = db.collection("emails").doc();
        batch.set(ref, {
          email: row.email,
          password: row.password,
          status: "fresh",
          assignedTo: null,
          assignedAt: null,
          notes: row.notes ?? "",
          batchId: batchRef.id,
          syncedProxyId: null,
          syncedAt: null,
          createdAt: now,
        });
      }
      await batch.commit();
      imported += chunk.length;
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.imported",
      targetType: "user",
      targetId: batchRef.id,
      metadata: { count: imported, batchId: batchRef.id },
    });

    return NextResponse.json({
      success: true,
      data: { imported, batchId: batchRef.id },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
