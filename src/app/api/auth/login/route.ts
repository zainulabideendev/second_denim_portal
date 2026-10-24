import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapProfile } from "@/lib/mappers";
import { invalidateUserCache } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const supabase = await createClient();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: authError?.message ?? "Authentication failed" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin()
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          success: false,
          error: "User account not found. Contact your administrator.",
        },
        { status: 403 }
      );
    }

    if (profile.status === "disabled") {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          success: false,
          error: "Your account has been disabled. Contact your administrator.",
        },
        { status: 403 }
      );
    }

    const user = mapProfile(profile);
    invalidateUserCache(user.uid);

    return NextResponse.json({
      success: true,
      data: {
        uid: user.uid,
        role: user.role,
        name: user.name,
        email: user.email,
        activeProxyLimit: user.activeProxyLimit,
        status: user.status,
        createdAt: user.createdAt,
        country: user.country,
        poolCountries: user.poolCountries,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Authentication failed" },
      { status: 401 }
    );
  }
}
