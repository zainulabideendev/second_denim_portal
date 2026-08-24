import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";

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
    const actor = await requireAuth(["admin", "manager"]);
    void actor;
    const db = adminDb();

    // Fetch all users and all non-retired proxies/phones in parallel
    // No compound queries — fetch all, filter in JS to avoid composite indexes
    const [usersSnap, proxiesSnap, phonesSnap] = await Promise.all([
      db.collection("users").limit(500).get(),
      db.collection("proxies").limit(1000).get(),
      db.collection("phoneNumbers").limit(1000).get(),
    ]);

    const stats: UserProxyStat[] = usersSnap.docs.map((doc) => {
      const u = doc.data();
      const uid = doc.id;

      const userProxies = proxiesSnap.docs.filter((p) => p.data().assignedTo === uid);
      const userPhones = phonesSnap.docs.filter((p) => p.data().assignedTo === uid);

      return {
        uid,
        name: u.name ?? "",
        email: u.email ?? "",
        role: u.role ?? "salesman",
        status: u.status ?? "active",
        activeProxyLimit: u.activeProxyLimit ?? 4,
        activeProxies: userProxies.filter((p) => p.data().status === "assigned").length,
        activePhones: userPhones.filter((p) => {
          const s = p.data().status;
          return s === "active" || s === "assigned";
        }).length,
        flaggedProxies: userProxies.filter((p) => p.data().status === "flagged").length,
        flaggedPhones: userPhones.filter((p) => {
          const s = p.data().status;
          return s === "banned" || s === "banned_with_balance" || s === "flagged";
        }).length,
        expiredProxies: proxiesSnap.docs.filter(
          (p) => p.data().assignedTo === uid && p.data().status === "expired"
        ).length,
        createdAt: toIso(u.createdAt),
      };
    });

    // Also include global inventory totals
    const totals = {
      proxies: {
        available: proxiesSnap.docs.filter((p) => {
          const s = p.data().status;
          return s === "fresh" || s === "available";
        }).length,
        assigned: proxiesSnap.docs.filter((p) => p.data().status === "assigned").length,
        expired: proxiesSnap.docs.filter((p) => p.data().status === "expired").length,
        flagged: proxiesSnap.docs.filter((p) => p.data().status === "flagged").length,
        total: proxiesSnap.size,
      },
      phones: {
        available: phonesSnap.docs.filter((p) => p.data().status === "available").length,
        assigned: phonesSnap.docs.filter((p) => {
          const s = p.data().status;
          return s === "active" || s === "assigned";
        }).length,
        expired: phonesSnap.docs.filter((p) => p.data().status === "expired").length,
        flagged: phonesSnap.docs.filter((p) => {
          const s = p.data().status;
          return s === "banned" || s === "banned_with_balance" || s === "flagged";
        }).length,
        total: phonesSnap.size,
      },
      users: {
        total: usersSnap.size,
        active: usersSnap.docs.filter((d) => d.data().status === "active").length,
        disabled: usersSnap.docs.filter((d) => d.data().status === "disabled").length,
      },
    };

    return NextResponse.json({ success: true, data: { stats, totals } });
  } catch (err) {
    return handleAuthError(err);
  }
}
