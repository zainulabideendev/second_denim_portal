import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { mapSmsPvaOrder, type SmsPvaOrderRow } from "@/lib/sms-pva-orders";
import {
  SmspvaError,
  smspvaBan,
  smspvaGetSms,
  type SmspvaCountry,
} from "@/lib/smspva";

type Ctx = { params: Promise<{ id: string }> };

async function loadOrder(id: string, userId: string, isAdmin: boolean) {
  let q = supabaseAdmin().from("sms_pva_orders").select("*").eq("id", id);
  if (!isAdmin) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data as SmsPvaOrderRow | null;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);
    const { id } = await ctx.params;
    const isAdmin = actor.role === "admin" || actor.role === "manager";

    let row = await loadOrder(id, actor.uid, isAdmin);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Order not found." },
        { status: 404 }
      );
    }

    // Poll provider only while waiting
    if (row.status === "waiting") {
      const expiredLocally = new Date(row.expires_at).getTime() <= Date.now();

      if (expiredLocally) {
        try {
          await smspvaBan(row.smspva_order_id, row.service);
        } catch {
          /* best-effort */
        }
        const now = new Date().toISOString();
        const { data: updated } = await supabaseAdmin()
          .from("sms_pva_orders")
          .update({
            status: "expired",
            error_message: "No SMS received within 10 minutes.",
            completed_at: now,
          })
          .eq("id", row.id)
          .select("*")
          .single();
        if (updated) row = updated as SmsPvaOrderRow;
      } else {
        try {
          const sms = await smspvaGetSms(
            row.country as SmspvaCountry,
            row.smspva_order_id,
            row.service
          );

          if (sms.status === "received") {
            const now = new Date().toISOString();
            const { data: updated } = await supabaseAdmin()
              .from("sms_pva_orders")
              .update({
                status: "received",
                sms_code: sms.code,
                sms_text: sms.text ?? null,
                code_received_at: now,
                completed_at: now,
              })
              .eq("id", row.id)
              .select("*")
              .single();
            if (updated) row = updated as SmsPvaOrderRow;
          } else if (sms.status === "expired") {
            try {
              await smspvaBan(row.smspva_order_id, row.service);
            } catch {
              /* best-effort */
            }
            const now = new Date().toISOString();
            const { data: updated } = await supabaseAdmin()
              .from("sms_pva_orders")
              .update({
                status: "expired",
                error_message: "No SMS received — this number has expired.",
                completed_at: now,
              })
              .eq("id", row.id)
              .select("*")
              .single();
            if (updated) row = updated as SmsPvaOrderRow;
          } else if (sms.status === "already_shown" && !row.sms_code) {
            // Code was delivered earlier but we missed it — keep waiting or mark received without code
            // Leave as waiting; client can keep polling briefly
          }
        } catch (err) {
          if (err instanceof SmspvaError && (err.code === "5" || err.code === "6")) {
            return NextResponse.json(
              { success: false, error: err.message, data: mapSmsPvaOrder(row) },
              { status: 429 }
            );
          }
          // Transient poll errors: return current row so UI can keep waiting
          console.warn("sms_pva poll:", err instanceof Error ? err.message : err);
        }
      }
    }

    return NextResponse.json({ success: true, data: mapSmsPvaOrder(row) });
  } catch (err) {
    return handleAuthError(err);
  }
}
