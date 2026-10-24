import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { linkProxyToEmail } from "@/lib/proxy-email-sync";

const bodySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
  notes: z.string().optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: proxyId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid data",
        },
        { status: 400 }
      );
    }

    const { data: proxyDoc } = await supabaseAdmin()
      .from("proxies")
      .select("id")
      .eq("id", proxyId)
      .maybeSingle();

    if (!proxyDoc) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    const emailNorm = parsed.data.email.trim().toLowerCase();

    const { data: existing } = await supabaseAdmin()
      .from("emails")
      .select("id")
      .eq("email", emailNorm)
      .limit(1);

    if (existing?.length) {
      return NextResponse.json(
        { success: false, error: "This email already exists in inventory" },
        { status: 409 }
      );
    }

    const { data: emailRow, error: insertError } = await supabaseAdmin()
      .from("emails")
      .insert({
        email: emailNorm,
        password: parsed.data.password,
        status: "fresh",
        assigned_to: null,
        assigned_at: null,
        notes: parsed.data.notes ?? "",
        synced_proxy_id: null,
        synced_at: null,
      })
      .select("id")
      .single();

    if (insertError || !emailRow) {
      throw new Error(insertError?.message ?? "Failed to create email");
    }

    await linkProxyToEmail(proxyId, emailRow.id, actor.uid);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.imported",
      targetType: "user",
      targetId: emailRow.id,
      metadata: {
        email: emailNorm,
        proxyId,
        source: "add-gmail",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        emailId: emailRow.id,
        proxyId,
        email: emailNorm,
        synced: true,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 }
      );
    }
    return handleAuthError(err);
  }
}
