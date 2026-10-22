import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAuth, handleAuthError } from "@/lib/auth";
import { toIso } from "@/lib/utils-server";
import {
  countByStatuses,
  getDocsByStatuses,
} from "@/lib/firestore-reads";

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

    const [
      usersSnap,
      assignedProxies,
      flaggedProxies,
      expiredProxies,
      assignedPhones,
      flaggedPhones,
      expiredPhones,
      availableProxyCount,
      availablePhoneCount,
    ] = await Promise.all([
      db.collection("users").limit(150).get(),
      getDocsByStatuses(db, "proxies", ["assigned"], 500),
      getDocsByStatuses(db, "proxies", ["flagged"], 200),
      getDocsByStatuses(db, "proxies", ["expired"], 200),
      getDocsByStatuses(db, "phoneNumbers", ["active", "assigned"], 400),
      getDocsByStatuses(
        db,
        "phoneNumbers",
        ["flagged", "banned", "banned_with_balance"],
        200
      ),
      getDocsByStatuses(db, "phoneNumbers", ["expired"], 200),
      countByStatuses(db, "proxies", ["fresh", "available"]),
      countByStatuses(db, "phoneNumbers", ["available"]),
    ]);

    const countForUser = (
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      uid: string
    ) => docs.filter((d) => d.data().assignedTo === uid).length;

    const stats: UserProxyStat[] = usersSnap.docs.map((doc) => {
      const u = doc.data();
      const uid = doc.id;

      return {
        uid,
        name: u.name ?? "",
        email: u.email ?? "",
        role: u.role ?? "salesman",
        status: u.status ?? "active",
        activeProxyLimit: u.activeProxyLimit ?? 4,
        activeProxies: countForUser(assignedProxies, uid),
        activePhones: countForUser(assignedPhones, uid),
        flaggedProxies: countForUser(flaggedProxies, uid),
        flaggedPhones: countForUser(flaggedPhones, uid),
        expiredProxies: countForUser(expiredProxies, uid),
        createdAt: toIso(u.createdAt),
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
        total: usersSnap.size,
        active: usersSnap.docs.filter((d) => d.data().status === "active").length,
        disabled: usersSnap.docs.filter((d) => d.data().status === "disabled")
          .length,
      },
    };

    return NextResponse.json({ success: true, data: { stats, totals } });
  } catch (err) {
    return handleAuthError(err);
  }
}
