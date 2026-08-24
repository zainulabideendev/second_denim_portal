import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsersView } from "./users-view";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">User Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create and manage user accounts and roles
        </p>
      </div>
      <UsersView />
    </div>
  );
}
