import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import { writeAuditLog } from "@/lib/audit";
import { FieldValue } from "firebase-admin/firestore";

const createPhoneSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional().default(""),
  assignedTo: z.string().min(1),
  status: z.enum(["active", "banned", "banned_with_balance"]),
});

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    void actor;

    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    // Single where clause max — no composite indexes needed.
    let snapshot: FirebaseFirestore.QuerySnapshot;
    if (assignedTo) {
      snapshot = await db.collection("phoneNumbers").where("assignedTo", "==", assignedTo).limit(500).get();
    } else if (country) {
      snapshot = await db.collection("phoneNumbers").where("country", "==", country).limit(500).get();
    } else {
      snapshot = await db.collection("phoneNumbers").limit(500).get();
    }

    let phones = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        country: d.country,
        number: d.number,
        provider: d.provider,
        purchasedAt: toIso(d.purchasedAt),
        expiresAt: toIso(d.expiresAt),
        status: d.status,
        assignedTo: d.assignedTo ?? null,
        assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
        batchId: d.batchId ?? "",
        notes: d.notes ?? "",
        lane: d.lane ?? null,
      };
    });

    if (country && assignedTo) phones = phones.filter((p) => p.country === country);
    if (status) phones = phones.filter((p) => p.status === status);

    phones.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

    return NextResponse.json({ success: true, data: phones });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);

    const body = await request.json();
    const parsed = createPhoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { number, country, provider, purchasedAt, expiresAt, notes, assignedTo, status } =
      parsed.data;
    const db = adminDb();

    const userDoc = await db.collection("users").doc(assignedTo).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Assigned user not found." },
        { status: 404 }
      );
    }

    const existing = await db
      .collection("phoneNumbers")
      .where("number", "==", number.trim())
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { success: false, error: "A phone number with this value already exists." },
        { status: 409 }
      );
    }

    const phoneRef = db.collection("phoneNumbers").doc();
    const now = FieldValue.serverTimestamp();
    const assignedAt = new Date();

    await phoneRef.set({
      country,
      number: number.trim(),
      provider: provider.trim(),
      purchasedAt: new Date(purchasedAt),
      expiresAt: new Date(expiresAt),
      status,
      assignedTo,
      assignedAt,
      batchId: "",
      notes: notes ?? "",
      createdAt: now,
    });

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: phoneRef.id,
      metadata: {
        count: 1,
        source: "manual",
        number: number.trim(),
        country,
        provider,
        assignedTo,
        status,
      },
    });

    const created = {
      id: phoneRef.id,
      country,
      number: number.trim(),
      provider: provider.trim(),
      purchasedAt: new Date(purchasedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      status,
      assignedTo,
      assignedAt: assignedAt.toISOString(),
      batchId: "",
      notes: notes ?? "",
    };

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}
