import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, format } from "date-fns";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
const bodySchema = z.object({
  number: z.string().min(1, "Phone number required"),
  provider: z.string().min(1, "Provider required").default("manual"),
  numberType: z.enum(["temporary", "permanent"]).optional().default("temporary"),
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional().default(""),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
});

/**
 * Admin/manager: create a phone number and link it to this proxy.
 */
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
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const db = adminDb();
    const proxyRef = db.collection("proxies").doc(proxyId);
    const proxyDoc = await proxyRef.get();
    if (!proxyDoc.exists) {
      return NextResponse.json({ success: false, error: "Proxy not found" }, { status: 404 });
    }

    const proxyData = proxyDoc.data()!;
    const number = parsed.data.number.trim();
    const country =
      parsed.data.country ??
      (["FR", "BE", "UK", "DE"].includes(proxyData.country)
        ? (proxyData.country as "FR" | "BE" | "UK" | "DE")
        : "UK");
    const today = format(new Date(), "yyyy-MM-dd");
    const purchasedAt = parsed.data.purchasedAt ?? today;
    const expiresAt =
      parsed.data.expiresAt ?? format(addDays(new Date(), 30), "yyyy-MM-dd");

    const existing = await db
      .collection("phoneNumbers")
      .where("number", "==", number)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { success: false, error: "A phone number with this value already exists" },
        { status: 409 }
      );
    }

    const phoneRef = db.collection("phoneNumbers").doc();
    const now = FieldValue.serverTimestamp();
    const assignedTo = (proxyData.assignedTo as string | null) ?? null;
    const assignedAt = assignedTo ? new Date() : null;

    const batch = db.batch();

    // Clear previous phone link on this proxy
    const prevPhoneId =
      proxyData.phoneId != null ? String(proxyData.phoneId).trim() : "";
    if (prevPhoneId) {
      batch.update(db.collection("phoneNumbers").doc(prevPhoneId), {
        proxyId: null,
      });
    }

    batch.set(phoneRef, {
      country,
      number,
      provider: parsed.data.provider.trim() || "manual",
      purchasedAt: new Date(purchasedAt),
      expiresAt: new Date(expiresAt),
      numberType: parsed.data.numberType ?? "temporary",
      status: assignedTo ? "active" : "available",
      assignedTo,
      assignedAt,
      batchId: "",
      notes: parsed.data.notes ?? "",
      proxyId,
      createdAt: now,
    });

    batch.update(proxyRef, {
      phoneId: phoneRef.id,
      phoneNumber: number,
    });

    await batch.commit();

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: phoneRef.id,
      metadata: {
        number,
        country,
        proxyId,
        assignedTo,
        source: "add-phone-to-proxy",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        phoneId: phoneRef.id,
        proxyId,
        number,
        country,
        assignedTo,
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
