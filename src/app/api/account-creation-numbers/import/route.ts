import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const rowSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  notes: z.string().optional().default(""),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
  rawFileName: z.string().default("manual-paste"),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { rows, rawFileName } = parsed.data;
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin()
      .from("account_creation_numbers")
      .insert(
        rows.map((row) => ({
          number: row.number.trim(),
          country: row.country,
          provider: row.provider.trim(),
          notes: row.notes ?? "",
          status: "available" as const,
          assigned_to: null,
          assigned_at: null,
          updated_at: now,
        }))
      )
      .select("id");

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Import failed: one or more numbers already exist in account creation stock.",
          },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.imported",
      targetType: "account_creation_number",
      targetId: "batch",
      metadata: { count: rows.length, rawFileName },
    });

    return NextResponse.json(
      { success: true, data: { count: data?.length ?? rows.length } },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
