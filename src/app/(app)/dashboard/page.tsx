import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminDashboard } from "./admin-dashboard";
import { ManagerDashboard } from "./manager-dashboard";
import { SalesmanDashboard } from "./salesman-dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "admin") {
    return <AdminDashboard user={user} />;
  }

  if (user.role === "salesman") {
    return <SalesmanDashboard user={user} />;
  }

  return <ManagerDashboard user={user} />;
}
