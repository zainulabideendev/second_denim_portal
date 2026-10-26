import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { sendSlackMessage } from "@/lib/slack";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Salesman (or admin) marks that the account-creation number on this proxy
 * was changed. Sets the ACN back to available and clears the proxy link so
 * the number can be linked to another proxy.
 */
export async function POST(_request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);
    const { id: proxyId } = await ctx.params;

    const { data: proxy, error: proxyErr } = await supabaseAdmin()
      .from("proxies")
      .select(
        "id, assigned_to, account_creation_number_id, account_creation_number"
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

    if (actor.role === "salesman" && proxy.assigned_to !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "You can only update numbers on your proxies." },
        { status: 403 }
      );
    }

    if (!proxy.account_creation_number_id) {
      return NextResponse.json(
        {
          success: false,
          error: "No account creation number is linked to this proxy.",
        },
        { status: 409 }
      );
    }

    const acnId = proxy.account_creation_number_id;
    const number = proxy.account_creation_number;
    const now = new Date().toISOString();

    const { error: proxyUpdErr } = await supabaseAdmin()
      .from("proxies")
      .update({
        account_creation_number_id: null,
        account_creation_number: null,
        account_creation_number_linked_at: null,
      })
      .eq("id", proxyId)
      .eq("account_creation_number_id", acnId);

    if (proxyUpdErr) throw new Error(proxyUpdErr.message);

    const { error: acnUpdErr } = await supabaseAdmin()
      .from("account_creation_numbers")
      .update({
        status: "available",
        assigned_to: null,
        assigned_at: null,
        proxy_id: null,
        proxy_host: null,
        proxy_port: null,
        proxy_country: null,
        updated_at: now,
      })
      .eq("id", acnId);

    if (acnUpdErr) throw new Error(acnUpdErr.message);

    await writeAuditLog({
      actorUid: actor.uid,
      action: "account_creation_number.changed",
      targetType: "account_creation_number",
      targetId: acnId,
      metadata: {
        proxyId,
        number,
      },
    });

    const displayName = actor.name?.trim() || actor.email || "Someone";
    const displayNumber = number?.trim() || "unknown";
    void sendSlackMessage(
      `${displayName} has changed his number (${displayNumber}).`
    );

    return NextResponse.json({
      success: true,
      data: {
        proxyId,
        accountCreationNumberId: acnId,
        number,
        status: "available",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
