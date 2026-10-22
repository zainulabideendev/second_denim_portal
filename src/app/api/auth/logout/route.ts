import { NextResponse } from "next/server";
import { PROFILE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(PROFILE_COOKIE_NAME);
  return response;
}
