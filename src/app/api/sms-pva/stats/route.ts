import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { SmspvaError, smspvaGetBalance } from "@/lib/smspva";
import { mapSmsPvaOrder, type SmsPvaOrderRow } from "@/lib/sms-pva-orders";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin"]);

    const days = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("days") ?? 30) || 30, 1),
      365
    );
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const { data, error } = await supabaseAdmin()
      .from("sms_pva_orders")
      .select("*")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as SmsPvaOrderRow[];

    // "Code asked" = every attempt that reserved/tried a number (exclude pure failed with no order? include all)
    const totalAsked = rows.length;
    const successful = rows.filter((r) => r.status === "received").length;
    const notReceived = rows.filter(
      (r) => r.status === "expired" || r.status === "cancelled"
    ).length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const waiting = rows.filter((r) => r.status === "waiting").length;

    const byDateMap = new Map<
      string,
      {
        date: string;
        asked: number;
        successful: number;
        notReceived: number;
        failed: number;
      }
    >();

    for (const r of rows) {
      const date = r.created_at.slice(0, 10);
      let bucket = byDateMap.get(date);
      if (!bucket) {
        bucket = { date, asked: 0, successful: 0, notReceived: 0, failed: 0 };
        byDateMap.set(date, bucket);
      }
      bucket.asked += 1;
      if (r.status === "received") bucket.successful += 1;
      else if (r.status === "expired" || r.status === "cancelled")
        bucket.notReceived += 1;
      else if (r.status === "failed") bucket.failed += 1;
    }

    const byDate = Array.from(byDateMap.values()).sort((a, b) =>
      a.date < b.date ? 1 : -1
    );

    let balance: number | null = null;
    let balanceError: string | null = null;
    try {
      balance = await smspvaGetBalance();
    } catch (err) {
      balanceError =
        err instanceof SmspvaError
          ? err.message
          : "Could not load service credit.";
    }

    return NextResponse.json({
      success: true,
      data: {
        days,
        since: since.toISOString(),
        totals: {
          asked: totalAsked,
          successful,
          notReceived,
          failed,
          waiting,
        },
        byDate,
        recent: rows.slice(0, 50).map(mapSmsPvaOrder),
        balance,
        balanceError,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
