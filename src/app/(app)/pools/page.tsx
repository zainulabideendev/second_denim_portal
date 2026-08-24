import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PoolsAdminView } from "./pools-admin-view";

export default async function PoolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pool Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create and manage country-based proxy pools for salesmen
        </p>
      </div>
      <PoolsAdminView />
    </div>
  );
}
