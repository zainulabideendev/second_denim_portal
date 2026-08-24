import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  assignAvailableProxy,
  countActiveProxies,
  notifyManagers,
  toIso,
} from "@/lib/utils-server";
import { FieldValue } from "firebase-admin/firestore";

const requestSchema = z.object({
  country: z.enum(["FR", "BE", "UK", "DE"]),
  reason: z.string().max(500).optional().default(""),
});

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["salesman", "manager", "admin"]);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { country, reason } = parsed.data;
    const db = adminDb();

    // Get user's current proxy limit
    const userDoc = await db.collection("users").doc(actor.uid).get();
    const userData = userDoc.data()!;
    const limit: number = userData.activeProxyLimit ?? 4;

    const activeCount = await countActiveProxies(actor.uid);

    if (activeCount >= limit) {
      // Over limit — create a pending request
      if (!reason) {
        return NextResponse.json(
          {
            success: false,
            error: `You have reached your proxy limit (${limit}). Please provide a reason to request an additional proxy.`,
            requiresReason: true,
          },
          { status: 422 }
        );
      }

      const reqRef = db.collection("requests").doc();
      await reqRef.set({
        type: "proxy",
        requestedBy: actor.uid,
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
        message: `${actor.name} requested an extra proxy (${country}): "${reason}"`,
        relatedId: reqRef.id,
      });

      return NextResponse.json({
        success: true,
        data: {
          autoAssigned: false,
          requestId: reqRef.id,
          message: "Request submitted and pending manager approval.",
        },
      });
    }

    // Under limit — check availability and auto-assign
    const poolSnap = await db
      .collection("proxies")
      .where("country", "==", country)
      .limit(50)
      .get();

    const inStock = poolSnap.docs.some((d) => {
      const status = d.data().status;
      return status === "fresh" || status === "available";
    });

    if (!inStock) {
      return NextResponse.json(
        {
          success: false,
          error: `No available ${country} proxies at the moment. Contact management to import more.`,
          noStock: true,
        },
        { status: 409 }
      );
    }

    const proxy = await assignAvailableProxy(country, actor.uid, actor.uid);

    if (!proxy) {
      return NextResponse.json(
        { success: false, error: "Assignment failed — please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        autoAssigned: true,
        proxy: {
          id: proxy.id,
          country: proxy.country,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
          provider: proxy.provider,
          purchasedAt: toIso(proxy.purchasedAt),
          expiresAt: toIso(proxy.expiresAt),
          status: "assigned",
          assignedTo: actor.uid,
          assignedAt: new Date().toISOString(),
        },
        message: "Proxy assigned successfully.",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
