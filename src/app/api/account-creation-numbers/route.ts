import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  mapAccountCreationNumber,
  type AccountCreationNumberRow,
} from "@/lib/account-creation-numbers";

const createSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  notes: z.string().optional().default(""),
  assignedTo: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    let query = supabaseAdmin()
      .from("account_creation_numbers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (country === "FR" || country === "BE" || country === "UK" || country === "DE") {
      query = query.eq("country", country);
    }
    if (
      status === "available" ||
      status === "assigned" ||
      status === "changed" ||
      status === "retired"
    ) {
      query = query.eq("status", status);
    }
    if (assignedTo) query = query.eq("assigned_to", assignedTo);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: ((data ?? []) as AccountCreationNumberRow[]).map(
        mapAccountCreationNumber
      ),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid number details." },
        { status: 400 }
      );
    }

    const { number, country, provider, notes, assignedTo } = parsed.data;
    const trimmed = number.trim();

    if (assignedTo) {
      const { data: userDoc } = await supabaseAdmin()
        .from("profiles")
        .select("id")
        .eq("id", assignedTo)
        .maybeSingle();
      if (!userDoc) {
        return NextResponse.json(
          { success: false, error: "Assigned user not found." },
          { status: 404 }
        );
      }
    }

    const { data: existing } = await supabaseAdmin()
      .from("account_creation_numbers")
      .select("id")
      .eq("number", trimmed)
      .limit(1);

    if (existing?.length) {
      return NextResponse.json(
        { success: false, error: "This number already exists in account creation stock." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: created, error } = await supabaseAdmin()
      .from("account_creation_numbers")
      .insert({
        number: trimmed,
        country,
        provider: provider.trim(),
        notes: notes ?? "",
        status: assignedTo ? "assigned" : "available",
        assigned_to: assignedTo ?? null,
        assigned_at: assignedTo ? now : null,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error || !created) {
      throw new Error(error?.message ?? "Failed to create number");
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.created",
      targetType: "account_creation_number",
      targetId: created.id,
      metadata: {
        number: trimmed,
        country,
        provider,
        assignedTo: assignedTo ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: mapAccountCreationNumber(created as AccountCreationNumberRow),
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
