import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { notifyManagers } from "@/lib/utils-server";
import { FieldValue } from "firebase-admin/firestore";

const requestSchema = z.object({
  country: z.enum(["FR", "BE", "UK", "DE"]),
  reason: z.string().min(1, "Reason is required").max(500),
});

/**
 * Salesman requests a proxy — always creates a pending request.
 * Admin assigns the proxy manually; nothing is auto-assigned here.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["salesman", "manager", "admin"]);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid request",
          requiresReason: true,
        },
        { status: 422 }
      );
    }

    const { country, reason } = parsed.data;
    const db = adminDb();

    const reqRef = db.collection("requests").doc();
    await reqRef.set({
      type: "proxy",
      requestedBy: actor.uid,
      requestedByName: actor.name,
      requestedByEmail: actor.email,
      country,
      reason,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      fulfilledItemId: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    await notifyManagers({
      type: "request_pending",
      message: `${actor.name} requested a proxy (${country}): "${reason}"`,
      relatedId: reqRef.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        autoAssigned: false,
        requestId: reqRef.id,
        message: "Request submitted. An admin will assign a proxy manually.",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
