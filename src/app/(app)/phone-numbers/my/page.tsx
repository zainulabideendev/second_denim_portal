import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MyPhonesView } from "./my-phones-view";

export default async function MyPhonesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <MyPhonesView user={user} />;
}
