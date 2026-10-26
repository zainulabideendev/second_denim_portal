import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  enrichPhonesWithProxies,
  mapPhoneDoc,
  phoneProxySnapshotFields,
} from "@/lib/sync-enrich";

const createPhoneSchema = z.object({
  number: z.string().min(1),
  country: z.enum(["FR", "BE", "UK", "DE"]),
  provider: z.string().min(1),
  purchasedAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: z.string().optional().default(""),
  proxyId: z.string().optional(),
  numberType: z.enum(["temporary", "permanent"]).optional().default("temporary"),
  status: z
    .enum(["active", "inactive", "banned", "banned_with_balance"])
    .optional()
    .default("active"),
  assignedTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth(["admin", "manager"]);

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const status = searchParams.get("status");
    const assignedTo = searchParams.get("assignedTo");
    const numberType = searchParams.get("numberType");

    let query = supabaseAdmin().from("phone_numbers").select("*").limit(500);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    else if (country)
      query = query.eq("country", country as "FR" | "BE" | "UK" | "DE");
    if (numberType === "temporary" || numberType === "permanent") {
      query = query.eq("number_type", numberType);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let phones = (data ?? []).map(mapPhoneDoc);

    if (country && assignedTo)
      phones = phones.filter((p) => p.country === country);
    if (status) phones = phones.filter((p) => p.status === status);
    if (numberType === "temporary") {
      // Treat missing/null type as temporary for older rows
      phones = phones.filter((p) => (p.numberType ?? "temporary") === "temporary");
    } else if (numberType === "permanent") {
      phones = phones.filter((p) => p.numberType === "permanent");
    }

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

    const {
      number,
      country,
      provider,
      purchasedAt,
      expiresAt,
      notes,
      assignedTo,
      status,
      proxyId,
      numberType,
    } = parsed.data;

    const isPermanent = (numberType ?? "temporary") === "permanent";
    let targetUserId: string | null = actor.uid;

    if (actor.role === "salesman") {
      targetUserId = actor.uid;
      if (!proxyId) {
        return NextResponse.json(
          {
            success: false,
            error: "Please select the proxy for which this number is purchased.",
          },
          { status: 400 }
        );
      }
    } else if (assignedTo) {
      targetUserId = assignedTo;
    } else if (isPermanent) {
      // Account-creation stock can sit unassigned until needed
      targetUserId = null;
    } else {
      return NextResponse.json(
        { success: false, error: "Assigned user is required." },
        { status: 400 }
      );
    }

    if (targetUserId) {
      const { data: userDoc } = await supabaseAdmin()
        .from("profiles")
        .select("id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (!userDoc) {
        return NextResponse.json(
          { success: false, error: "Assigned user not found." },
          { status: 404 }
        );
      }
    }

    let proxyData: {
      id: string;
      host: string;
      port: string;
      country: "FR" | "BE" | "UK" | "DE";
      assigned_to: string | null;
    } | null = null;

    if (proxyId) {
      const { data: proxy } = await supabaseAdmin()
        .from("proxies")
        .select("id, host, port, country, assigned_to")
        .eq("id", proxyId)
        .maybeSingle();

      if (!proxy) {
        return NextResponse.json(
          { success: false, error: "Selected proxy not found." },
          { status: 404 }
        );
      }
      if (actor.role === "salesman" && proxy.assigned_to !== actor.uid) {
        return NextResponse.json(
          {
            success: false,
            error: "You can only attach numbers to your assigned proxies.",
          },
          { status: 403 }
        );
      }
      proxyData = proxy;
    }

    const { data: existing } = await supabaseAdmin()
      .from("phone_numbers")
      .select("id")
      .eq("number", number.trim())
      .limit(1);

    if (existing?.length) {
      return NextResponse.json(
        {
          success: false,
          error: "A phone number with this value already exists.",
        },
        { status: 409 }
      );
    }

    const assignedAt = targetUserId ? new Date().toISOString() : null;
    const phoneStatus =
      targetUserId == null
        ? "available"
        : (status ?? (isPermanent ? "available" : "active"));

    const { data: created, error: insertError } = await supabaseAdmin()
      .from("phone_numbers")
      .insert({
        country,
        number: number.trim(),
        provider: provider.trim(),
        purchased_at: new Date(purchasedAt).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
        number_type: numberType ?? "temporary",
        status: phoneStatus,
        assigned_to: targetUserId,
        assigned_at: assignedAt,
        batch_id: null,
        notes: notes ?? "",
        proxy_id: proxyId || null,
        ...phoneProxySnapshotFields(proxyData),
      })
      .select("*")
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message ?? "Failed to create phone");
    }

    if (proxyId) {
      await supabaseAdmin()
        .from("proxies")
        .update({
          phone_id: created.id,
          phone_number: number.trim(),
        })
        .eq("id", proxyId);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "phone.assigned",
      targetType: "phone",
      targetId: created.id,
      metadata: {
        count: 1,
        source: "manual",
        number: number.trim(),
        country,
        provider,
        assignedTo: targetUserId,
        status: phoneStatus,
        proxyId: proxyId || null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          country,
          number: number.trim(),
          provider: provider.trim(),
          purchasedAt: new Date(purchasedAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
          numberType: numberType ?? "temporary",
          status: phoneStatus,
          assignedTo: targetUserId,
          assignedAt,
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
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
