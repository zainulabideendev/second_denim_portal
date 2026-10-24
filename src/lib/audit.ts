import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuditAction } from "@/lib/types";
import type { Json } from "@/lib/database.types";

export async function writeAuditLog({
  actorUid,
  action,
  targetType,
  targetId,
  metadata = {},
}: {
  actorUid: string;
  action: AuditAction;
  targetType: "proxy" | "phone" | "request" | "user";
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin().from("audit_logs").insert({
    actor_uid: actorUid,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata as Json,
  });

  if (error) {
    console.error("[audit]", error.message);
  }
}
