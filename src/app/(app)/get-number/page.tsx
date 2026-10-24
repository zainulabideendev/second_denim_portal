import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GetNumberView } from "./get-number-view";

export default async function GetNumberPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <GetNumberView />;
}
