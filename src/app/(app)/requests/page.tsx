import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RequestsManagerView } from "./requests-manager-view";

export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "salesman") redirect("/requests/my");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Requests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review and manage proxy &amp; phone number requests
        </p>
      </div>
      <RequestsManagerView />
    </div>
  );
}
