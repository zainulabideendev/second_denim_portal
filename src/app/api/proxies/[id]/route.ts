import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapProxyDoc } from "@/lib/sync-enrich";
import type { Database } from "@/lib/database.types";

const updateSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  notes: z.string().optional(),
  vintedUsername: z.string().optional(),
  vintedPassword: z.string().optional(),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
});

const FIELD_MAP: Record<string, string> = {
  host: "host",
  port: "port",
  username: "username",
  password: "password",
  notes: "notes",
  vintedUsername: "vinted_username",
  vintedPassword: "vinted_password",
  country: "country",
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAuth(["salesman", "admin", "manager"]);
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid data",
        },
        { status: 400 }
      );
    }

    if (parsed.data.country !== undefined && actor.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Only admins can change proxy country" },
        { status: 403 }
      );
    }

    const { data: proxyData } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!proxyData) {
      return NextResponse.json(
        { success: false, error: "Proxy not found" },
        { status: 404 }
      );
    }

    if (actor.role === "salesman" && proxyData.assigned_to !== actor.uid) {
      return NextResponse.json(
        { success: false, error: "Not your proxy" },
        { status: 403 }
      );
    }

    const updates: Database["public"]["Tables"]["proxies"]["Update"] = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        const col = FIELD_MAP[key] ?? key;
        (updates as Record<string, string>)[col] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No changes" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin()
      .from("proxies")
      .update(updates)
      .eq("id", id);

    if (error) throw new Error(error.message);

    const metadata: Record<string, unknown> = {
      fields: Object.keys(parsed.data).filter(
        (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
      ),
    };
    if (updates.country && updates.country !== proxyData.country) {
      metadata.previousCountry = proxyData.country;
      metadata.country = updates.country;
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "proxy.updated",
      targetType: "proxy",
      targetId: id,
      metadata,
    });

    const { data: next } = await supabaseAdmin()
      .from("proxies")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({ success: true, data: mapProxyDoc(next!) });
  } catch (err) {
    return handleAuthError(err);
  }
}
