import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import {
  enrichEmailsWithSyncedProxies,
  mapEmailDoc,
} from "@/lib/sync-enrich";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin", "manager"]);
    void actor;

    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");

    let snapshot: FirebaseFirestore.QuerySnapshot;
    if (assignedTo) {
      snapshot = await db.collection("emails").where("assignedTo", "==", assignedTo).limit(500).get();
    } else {
      snapshot = await db.collection("emails").limit(500).get();
    }

    let emails = snapshot.docs.map(mapEmailDoc);

    if (status) emails = emails.filter((e) => e.status === status);
    emails.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const enriched = await enrichEmailsWithSyncedProxies(emails);

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    return handleAuthError(err);
  }
}
