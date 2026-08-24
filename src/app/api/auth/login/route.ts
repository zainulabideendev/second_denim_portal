import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { createSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";

const loginSchema = z.object({
  idToken: z.string().min(1, "ID token is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { idToken } = parsed.data;

    // Verify the ID token is valid
    const auth = adminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check user exists and is active in our users collection
    const db = adminDb();
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: "User account not found. Contact your administrator." },
        { status: 403 }
      );
    }

    const userData = userDoc.data()!;
    if (userData.status === "disabled") {
      return NextResponse.json(
        { success: false, error: "Your account has been disabled. Contact your administrator." },
        { status: 403 }
      );
    }

    // Create a session cookie
    const sessionCookie = await createSessionCookie(idToken);

    const response = NextResponse.json({
      success: true,
      data: {
        uid,
        role: userData.role,
        name: userData.name,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Authentication failed" },
      { status: 401 }
    );
  }
}
