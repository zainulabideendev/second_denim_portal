import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const proxyRowSchema = z.object({
  host: z.string().min(1),
  port: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
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

    const { data: batch, error: batchError } = await supabaseAdmin()
      .from("import_batches")
      .insert({
        type: "proxy",
        imported_by: actor.uid,
        count: rows.length,
        raw_file_name: rawFileName,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw new Error(batchError?.message ?? "Failed to create import batch");
    }

    const batchId = batch.id;

    const { data: proxies, error: insertError } = await supabaseAdmin()
      .from("proxies")
      .insert(
        rows.map((row) => ({
          country: row.country,
          host: row.host,
          port: row.port,
          username: row.username,
          password: row.password,
          provider: row.provider,
          purchased_at: new Date(row.purchasedAt).toISOString(),
          expires_at: new Date(row.expiresAt).toISOString(),
          status: "fresh" as const,
          assigned_to: null,
          assigned_at: null,
          batch_id: batchId,
          notes: row.notes ?? "",
          synced_email_id: null,
          synced_at: null,
        }))
      )
      .select("id");

    if (insertError) throw new Error(insertError.message);

    const proxyIds = (proxies ?? []).map((p) => p.id);

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
