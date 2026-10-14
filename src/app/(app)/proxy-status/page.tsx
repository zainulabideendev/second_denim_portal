import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProxyStatusView } from "./proxy-status-view";

export default async function ProxyStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "manager") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Proxy status by user</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Active, backup, restricted, and banned proxies per salesman — filter by assignment date
        </p>
      </div>
      <ProxyStatusView />
    </div>
  );
}
