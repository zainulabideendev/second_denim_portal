import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { mapSmsPvaOrder, type SmsPvaOrderRow } from "@/lib/sms-pva-orders";
import {
  SMSPVA_DEFAULT_COUNTRY,
  SMSPVA_DEFAULT_OPERATOR,
  SMSPVA_VINTED_NAME,
  SMSPVA_VINTED_SERVICE,
  SmspvaError,
  smspvaGetNumber,
} from "@/lib/smspva";

export async function POST(_request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);
    const country = SMSPVA_DEFAULT_COUNTRY;

    const { data: openOrders } = await supabaseAdmin()
      .from("sms_pva_orders")
      .select("id")
      .eq("user_id", actor.uid)
      .eq("status", "waiting")
      .limit(1);

    if (openOrders?.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "You already have a number waiting for a code. Cancel it or wait for the SMS before requesting another.",
          openOrderId: openOrders[0].id,
        },
        { status: 409 }
      );
    }

    let numberResult;
    try {
      numberResult = await smspvaGetNumber(
        country,
        SMSPVA_VINTED_SERVICE,
        SMSPVA_DEFAULT_OPERATOR
      );
    } catch (err) {
      const message =
        err instanceof SmspvaError
          ? err.message
          : "Failed to request a number. Please try again.";

      await supabaseAdmin().from("sms_pva_orders").insert({
        smspva_order_id: "none",
        user_id: actor.uid,
        user_name: actor.name,
        user_email: actor.email,
        country,
        service: SMSPVA_VINTED_SERVICE,
        service_name: SMSPVA_VINTED_NAME,
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: row, error } = await supabaseAdmin()
      .from("sms_pva_orders")
      .insert({
        smspva_order_id: numberResult.orderId,
        user_id: actor.uid,
        user_name: actor.name,
        user_email: actor.email,
        country,
        service: SMSPVA_VINTED_SERVICE,
        service_name: SMSPVA_VINTED_NAME,
        phone_number: numberResult.number,
        status: "waiting",
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (error || !row) {
      console.error("sms_pva insert:", error?.message);
      return NextResponse.json(
        {
          success: false,
          error:
            "Number was reserved but could not be saved. Contact an admin with reference " +
            numberResult.orderId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapSmsPvaOrder(row as SmsPvaOrderRow),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
