import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";

export interface UserProxyStat {
  uid: string;
  name: string;
  email: string;
  role: string;
  status: string;
  activeProxyLimit: number;
  activeProxies: number;
  activePhones: number;
  flaggedProxies: number;
  flaggedPhones: number;
  expiredProxies: number;
  createdAt: string;
}

export async function GET() {
  try {
    await requireAuth(["admin", "manager"]);

    const [
      usersRes,
      assignedProxiesRes,
      flaggedProxiesRes,
      expiredProxiesRes,
      assignedPhonesRes,
      flaggedPhonesRes,
      expiredPhonesRes,
      availableProxyRes,
      availablePhoneRes,
    ] = await Promise.all([
      supabaseAdmin().from("profiles").select("*").limit(150),
      supabaseAdmin()
        .from("proxies")
        .select("id, assigned_to")
        .eq("status", "assigned")
        .limit(500),
      supabaseAdmin()
        .from("proxies")
        .select("id, assigned_to")
        .eq("status", "flagged")
        .limit(200),
      supabaseAdmin()
        .from("proxies")
        .select("id, assigned_to")
        .eq("status", "expired")
        .limit(200),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id, assigned_to")
        .in("status", ["active", "assigned"])
        .limit(400),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id, assigned_to")
        .in("status", ["flagged", "banned", "banned_with_balance"])
        .limit(200),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id, assigned_to")
        .eq("status", "expired")
        .limit(200),
      supabaseAdmin()
        .from("proxies")
        .select("id", { count: "exact", head: true })
        .in("status", ["fresh", "available"]),
      supabaseAdmin()
        .from("phone_numbers")
        .select("id", { count: "exact", head: true })
        .eq("status", "available"),
    ]);

    const users = usersRes.data ?? [];
    const assignedProxies = assignedProxiesRes.data ?? [];
    const flaggedProxies = flaggedProxiesRes.data ?? [];
    const expiredProxies = expiredProxiesRes.data ?? [];
    const assignedPhones = assignedPhonesRes.data ?? [];
    const flaggedPhones = flaggedPhonesRes.data ?? [];
    const expiredPhones = expiredPhonesRes.data ?? [];
    const availableProxyCount = availableProxyRes.count ?? 0;
    const availablePhoneCount = availablePhoneRes.count ?? 0;

    const countForUser = (
      docs: Array<{ assigned_to: string | null }>,
      uid: string
    ) => docs.filter((d) => d.assigned_to === uid).length;

    const stats: UserProxyStat[] = users.map((u) => {
      const uid = u.id;
      return {
        uid,
        name: u.name ?? "",
        email: u.email ?? "",
        role: u.role ?? "salesman",
        status: u.status ?? "active",
        activeProxyLimit: u.active_proxy_limit ?? 4,
        activeProxies: countForUser(assignedProxies, uid),
        activePhones: countForUser(assignedPhones, uid),
        flaggedProxies: countForUser(flaggedProxies, uid),
        flaggedPhones: countForUser(flaggedPhones, uid),
        expiredProxies: countForUser(expiredProxies, uid),
        createdAt: u.created_at,
      };
    });

    const totals = {
      proxies: {
        available: availableProxyCount,
        assigned: assignedProxies.length,
        expired: expiredProxies.length,
        flagged: flaggedProxies.length,
        total:
          availableProxyCount +
          assignedProxies.length +
          expiredProxies.length +
          flaggedProxies.length,
      },
      phones: {
        available: availablePhoneCount,
        assigned: assignedPhones.length,
        expired: expiredPhones.length,
        flagged: flaggedPhones.length,
        total:
          availablePhoneCount +
          assignedPhones.length +
          expiredPhones.length +
          flaggedPhones.length,
      },
      users: {
        total: users.length,
        active: users.filter((d) => d.status === "active").length,
        disabled: users.filter((d) => d.status === "disabled").length,
      },
    };

    return NextResponse.json({ success: true, data: { stats, totals } });
  } catch (err) {
    return handleAuthError(err);
  }
}
