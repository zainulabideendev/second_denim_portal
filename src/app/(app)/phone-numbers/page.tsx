import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PhoneInventoryTable } from "./phone-inventory-table";

interface Props {
  searchParams: Promise<{ assignedTo?: string }>;
}

export default async function PhoneNumbersPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "salesman") redirect("/phone-numbers/my");

  const { assignedTo } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Phone Number Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Full inventory — filter by user, status, or country
        </p>
      </div>
      <PhoneInventoryTable defaultUser={assignedTo} />
    </div>
  );
}
