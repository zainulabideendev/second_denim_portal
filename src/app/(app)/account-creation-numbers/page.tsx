import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AccountCreationNumbersTable } from "./account-creation-numbers-table";

export default async function AccountCreationNumbersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "salesman") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Account creation numbers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Permanent numbers for account creation — stored separately from Phone
          Numbers inventory.
        </p>
      </div>
      <AccountCreationNumbersTable />
    </div>
  );
}
