import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapEmailDoc, enrichEmailsWithSyncedProxies } from "@/lib/sync-enrich";
import type { Database } from "@/lib/database.types";

const updateSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(1, "Password required").optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid data",
        },
        { status: 400 }
      );
    }

    const { data: current } = await supabaseAdmin()
      .from("emails")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Email not found" },
        { status: 404 }
      );
    }

    const updates: Database["public"]["Tables"]["emails"]["Update"] = {};

    if (parsed.data.email !== undefined) {
      const emailNorm = parsed.data.email.trim().toLowerCase();
      if (emailNorm !== String(current.email ?? "").toLowerCase()) {
        const { data: existing } = await supabaseAdmin()
          .from("emails")
          .select("id")
          .eq("email", emailNorm)
          .limit(1);

        if (existing?.length && existing[0].id !== id) {
          return NextResponse.json(
            {
              success: false,
              error: "This email already exists in inventory",
            },
            { status: 409 }
          );
        }
        updates.email = emailNorm;
      }
    }

    if (parsed.data.password !== undefined) {
      updates.password = parsed.data.password;
    }

    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No changes" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("emails")
      .update(updates)
      .eq("id", id);

    if (error) throw new Error(error.message);

    const linkedProxyId = current.synced_proxy_id?.trim() ?? "";
    if (linkedProxyId && (updates.email || updates.password)) {
      const proxyPatch: Database["public"]["Tables"]["proxies"]["Update"] = {};
      if (updates.email) proxyPatch.synced_email_email = updates.email;
      if (updates.password) proxyPatch.synced_email_password = updates.password;
      await supabaseAdmin()
        .from("proxies")
        .update(proxyPatch)
        .eq("id", linkedProxyId);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "email.updated",
      targetType: "user",
      targetId: id,
      metadata: {
        fields: Object.keys(updates),
        previousEmail: current.email,
        email: updates.email ?? current.email,
      },
    });

    const { data: next } = await supabaseAdmin()
      .from("emails")
      .select("*")
      .eq("id", id)
      .single();

    const [enriched] = await enrichEmailsWithSyncedProxies([
      mapEmailDoc(next!),
    ]);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
