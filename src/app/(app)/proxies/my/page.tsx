import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MyProxiesView } from "./my-proxies-view";

export default async function MyProxiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <MyProxiesView user={user} />;
}
