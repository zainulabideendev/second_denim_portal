import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid data",
        },
        { status: 400 }
      );
    }

    const { data: batch, error: batchError } = await supabaseAdmin()
      .from("import_batches")
      .insert({
        type: "email",
        imported_by: actor.uid,
        count: parsed.data.rows.length,
        raw_file_name: "email-import",
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw new Error(batchError?.message ?? "Failed to create import batch");
    }

    const rows = parsed.data.rows;
    const chunkSize = 200;
    let imported = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin().from("emails").insert(
        chunk.map((row) => ({
          email: row.email,
          password: row.password,
          status: "fresh" as const,
          assigned_to: null,
          assigned_at: null,
          notes: row.notes ?? "",
          synced_proxy_id: null,
          synced_at: null,
        }))
      );
      if (error) throw new Error(error.message);
      imported += chunk.length;
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.imported",
      targetType: "user",
      targetId: batch.id,
      metadata: { count: imported, batchId: batch.id },
    });

    return NextResponse.json({
      success: true,
      data: { imported, batchId: batch.id },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
