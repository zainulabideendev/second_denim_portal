import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { EmailInventoryTable } from "./email-inventory-table";

export default async function EmailsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "salesman") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Email Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage imported email accounts — assign, flag, or retire
        </p>
      </div>
      <EmailInventoryTable />
    </div>
  );
}
