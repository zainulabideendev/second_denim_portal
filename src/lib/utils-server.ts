import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapPhone, toIso } from "@/lib/mappers";
import type { Country, PhoneNumber } from "@/lib/types";
import { writeAuditLog } from "@/lib/audit";

export { toIso };

export async function handleBanCascade(
  bannedProxyId: string,
  _uid: string,
  _country: Country,
  _actorUid: string,
  notes: string,
  _activePoolSize?: number,
  _backupLimit?: number | null
): Promise<{ promoted: string[]; refilled: boolean }> {
  await supabaseAdmin()
    .from("proxies")
    .update({
      status: "flagged",
      lane: "active",
      notes: notes ? `[BANNED] ${notes}` : "[BANNED] Account got banned",
    })
    .eq("id", bannedProxyId);

  return { promoted: [], refilled: false };
}

export async function assignAvailablePhone(
  country: Country,
  assignedTo: string,
  actorUid: string
): Promise<PhoneNumber | null> {
  const { data: availableOnly } = await supabaseAdmin()
    .from("phone_numbers")
    .select("*")
    .eq("country", country)
    .eq("status", "available")
    .order("purchased_at", { ascending: true })
    .limit(1);

  if (!availableOnly?.length) return null;

  const row = availableOnly[0];
  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin()
    .from("phone_numbers")
    .update({ status: "active", assigned_to: assignedTo, assigned_at: now })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !updated) return null;

  await writeAuditLog({
    actorUid,
    action: "phone.assigned",
    targetType: "phone",
    targetId: updated.id,
    metadata: { assignedTo, country },
  });

  return mapPhone(updated);
}

export async function countActiveProxies(uid: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("proxies")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", uid)
    .eq("status", "assigned");
  if (error) return 0;
  return count ?? 0;
}

export async function countActivePhones(uid: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("phone_numbers")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", uid)
    .in("status", ["active", "assigned"]);
  if (error) return 0;
  return count ?? 0;
}

export async function createNotification({
  uid,
  type,
  message,
  relatedId,
}: {
  uid: string;
  type: string;
  message: string;
  relatedId?: string;
}) {
  await supabaseAdmin().from("notifications").insert({
    uid,
    type,
    message,
    read: false,
    related_id: relatedId ?? null,
  });
}

export async function notifyManagers({
  type,
  message,
  relatedId,
}: {
  type: string;
  message: string;
  relatedId?: string;
}) {
  const { data: managers } = await supabaseAdmin()
    .from("profiles")
    .select("id")
    .in("role", ["manager", "admin"])
    .eq("status", "active");

  if (!managers?.length) return;

  await supabaseAdmin().from("notifications").insert(
    managers.map((m) => ({
      uid: m.id,
      type,
      message,
      read: false,
      related_id: relatedId ?? null,
    }))
  );
}
