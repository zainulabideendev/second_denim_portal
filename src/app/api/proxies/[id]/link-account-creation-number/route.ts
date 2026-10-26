import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  accountCreationNumberId: z.string().min(1),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    const { id: proxyId } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Select an account creation number." },
        { status: 400 }
      );
    }

    const { data: proxy, error: proxyErr } = await supabaseAdmin()
      .from("proxies")
      .select(
        "id, country, host, port, assigned_to, account_creation_number_id"
      )
      .eq("id", proxyId)
      .maybeSingle();

    if (proxyErr) throw new Error(proxyErr.message);
    if (!proxy) {
      return NextResponse.json(
        { success: false, error: "Proxy not found." },
        { status: 404 }
      );
    }

    const acnId = parsed.data.accountCreationNumberId;
    const { data: acn, error: acnErr } = await supabaseAdmin()
      .from("account_creation_numbers")
      .select("*")
      .eq("id", acnId)
      .maybeSingle();

    if (acnErr) throw new Error(acnErr.message);
    if (!acn) {
      return NextResponse.json(
        { success: false, error: "Account creation number not found." },
        { status: 404 }
      );
    }

    if (acn.status === "retired") {
      return NextResponse.json(
        { success: false, error: "Cannot link a retired number." },
        { status: 409 }
      );
    }

    if (acn.proxy_id && acn.proxy_id !== proxyId) {
      return NextResponse.json(
        {
          success: false,
          error: "That number is already linked to another proxy.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // Unlink previous ACN on this proxy
    if (
      proxy.account_creation_number_id &&
      proxy.account_creation_number_id !== acnId
    ) {
      await supabaseAdmin()
        .from("account_creation_numbers")
        .update({
          proxy_id: null,
          proxy_host: null,
          proxy_port: null,
          proxy_country: null,
          status: "available",
          assigned_to: null,
          assigned_at: null,
          updated_at: now,
        })
        .eq("id", proxy.account_creation_number_id)
        .eq("proxy_id", proxyId);
    }

    const { error: acnUpdErr } = await supabaseAdmin()
      .from("account_creation_numbers")
      .update({
        proxy_id: proxyId,
        proxy_host: proxy.host,
        proxy_port: proxy.port,
        proxy_country: proxy.country,
        status: "assigned",
        assigned_to: proxy.assigned_to,
        assigned_at: now,
        updated_at: now,
      })
      .eq("id", acnId);

    if (acnUpdErr) throw new Error(acnUpdErr.message);

    const { error: proxyUpdErr } = await supabaseAdmin()
      .from("proxies")
      .update({
        account_creation_number_id: acnId,
        account_creation_number: acn.number,
        account_creation_number_linked_at: now,
      })
      .eq("id", proxyId);

    if (proxyUpdErr) throw new Error(proxyUpdErr.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.linked",
      targetType: "account_creation_number",
      targetId: acnId,
      metadata: {
        proxyId,
        number: acn.number,
        assignedTo: proxy.assigned_to,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        proxyId,
        accountCreationNumberId: acnId,
        number: acn.number,
        linkedAt: now,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
