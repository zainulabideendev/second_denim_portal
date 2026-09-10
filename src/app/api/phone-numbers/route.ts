import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import { writeAuditLog } from "@/lib/audit";
import { enrichPhonesWithProxies } from "@/lib/sync-enrich";
import { FieldValue } from "firebase-admin/firestore";

const createPhoneSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional().default(""),
  proxyId: z.string().optional(),
  numberType: z.enum(["temporary", "permanent"]).optional().default("temporary"),
  proxyId: z.string().optional(),
  status: z.enum(["active", "inactive", "banned", "balnebe"]).optional().default("active"),
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
        numberType: d.numberType ?? "temporary",
        assignedTo: d.assignedTo ?? null,
        assignedAt: d.assignedAt ? toIso(d.assignedAt) : null,
        batchId: d.batchId ?? "",
        notes: d.notes ?? "",
        lane: d.lane ?? null,
        proxyId: d.proxyId ?? null,
      };
    });

    if (country && assignedTo) phones = phones.filter((p) => p.country === country);
    if (status) phones = phones.filter((p) => p.status === status);

    phones.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

    const enriched = await enrichPhonesWithProxies(phones);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager", "salesman"]);

    const body = await request.json();
    const parsed = createPhoneSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { number, country, provider, purchasedAt, expiresAt, notes, assignedTo, status, proxyId, numberType } =
      parsed.data;
    const db = adminDb();

    let targetUserId = actor.uid;
    if (actor.role === "salesman") {
      targetUserId = actor.uid;
      if (!proxyId) {
        return NextResponse.json(
          { success: false, error: "Please select the proxy for which this number is purchased." },
          { status: 400 }
        );
      }
    } else {
      if (!assignedTo) {
        return NextResponse.json(
          { success: false, error: "Assigned user is required." },
          { status: 400 }
        );
      }
      targetUserId = assignedTo;
    }

    const userDoc = await db.collection("users").doc(targetUserId).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Assigned user not found." },
        { status: 404 }
      );
    }

    let proxyData: FirebaseFirestore.DocumentData | null = null;
    let proxyRef: FirebaseFirestore.DocumentReference | null = null;
    if (proxyId) {
      proxyRef = db.collection("proxies").doc(proxyId);
      const proxyDoc = await proxyRef.get();
      if (!proxyDoc.exists) {
        return NextResponse.json(
          { success: false, error: "Selected proxy not found." },
          { status: 404 }
        );
      }
      proxyData = proxyDoc.data()!;
      if (actor.role === "salesman" && proxyData.assignedTo !== actor.uid) {
        return NextResponse.json(
          { success: false, error: "You can only attach numbers to your assigned proxies." },
          { status: 403 }
        );
      }
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

    const batch = db.batch();

    batch.set(phoneRef, {
      country,
      number: number.trim(),
      provider: provider.trim(),
      purchasedAt: new Date(purchasedAt),
      expiresAt: new Date(expiresAt),
      numberType: numberType ?? "temporary",
      status: status ?? "active",
      assignedTo: targetUserId,
      assignedAt,
      batchId: "",
      notes: notes ?? "",
      proxyId: proxyId || null,
      createdAt: now,
    });

    if (proxyRef) {
      batch.update(proxyRef, {
        phoneId: phoneRef.id,
        phoneNumber: number.trim(),
      });
    }

    await batch.commit();

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
        assignedTo: targetUserId,
        status: status ?? "active",
        proxyId: proxyId || null,
      },
    });

    const created = {
      id: phoneRef.id,
      country,
      number: number.trim(),
      provider: provider.trim(),
      purchasedAt: new Date(purchasedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      numberType: numberType ?? "temporary",
      status: status ?? "active",
      assignedTo: targetUserId,
      assignedAt: assignedAt.toISOString(),
      batchId: "",
      notes: notes ?? "",
      proxyId: proxyId || null,
      proxy: proxyData
        ? {
            id: proxyId!,
            host: proxyData.host,
            port: proxyData.port,
            country: proxyData.country,
          }
        : null,
    };

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}
