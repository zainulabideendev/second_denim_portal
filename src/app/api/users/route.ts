import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { mapProfile } from "@/lib/mappers";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "manager", "salesman"]),
  country: z.enum(["FR", "BE", "UK", "DE"]).optional(),
  activeProxyLimit: z.number().int().min(1).max(20).default(4),
});

export async function GET() {
  try {
    await requireAuth(["admin"]);

    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      data: (data ?? []).map(mapProfile),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuth(["admin"]);
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, role, country, activeProxyLimit } =
      parsed.data;

    const { data: created, error: authError } =
      await supabaseAdmin().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

    if (authError || !created.user) {
      return NextResponse.json(
        { success: false, error: authError?.message ?? "Failed to create user" },
        { status: 400 }
      );
    }

    const { error: profileError } = await supabaseAdmin()
      .from("profiles")
      .upsert({
        id: created.user.id,
        name,
        email,
        role,
        country: country ?? null,
        active_proxy_limit: activeProxyLimit,
        status: "active",
      });

    if (profileError) {
      await supabaseAdmin().auth.admin.deleteUser(created.user.id);
      throw new Error(profileError.message);
    }

    await writeAuditLog({
      actorUid: actor.uid,
      action: "user.created",
      targetType: "user",
      targetId: created.user.id,
      metadata: { name, email, role },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          uid: created.user.id,
          name,
          email,
          role,
          activeProxyLimit,
          status: "active",
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
