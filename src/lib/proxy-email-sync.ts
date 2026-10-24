import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditLog } from "@/lib/audit";
import { emailProxySnapshotFields } from "@/lib/sync-enrich";

export async function linkProxyToEmail(
  proxyId: string,
  emailId: string,
  actorUid: string,
  options?: { skipAudit?: boolean }
): Promise<void> {
  const db = supabaseAdmin();

  const [{ data: proxy }, { data: email }] = await Promise.all([
    db.from("proxies").select("*").eq("id", proxyId).maybeSingle(),
    db.from("emails").select("*").eq("id", emailId).maybeSingle(),
  ]);

  if (!proxy) throw new Error("Proxy not found");
  if (!email) throw new Error("Email not found");

  if (proxy.synced_email_id && proxy.synced_email_id !== emailId) {
    await db
      .from("emails")
      .update({
        synced_proxy_id: null,
        synced_at: null,
        ...emailProxySnapshotFields(null),
      })
      .eq("id", proxy.synced_email_id);
  }

  if (email.synced_proxy_id && email.synced_proxy_id !== proxyId) {
    await db
      .from("proxies")
      .update({
        synced_email_id: null,
        synced_at: null,
        synced_email_email: null,
        synced_email_password: null,
      })
      .eq("id", email.synced_proxy_id);
  }

  const now = new Date().toISOString();

  const [{ error: proxyErr }, { error: emailErr }] = await Promise.all([
    db
      .from("proxies")
      .update({
        synced_email_id: emailId,
        synced_at: now,
        synced_email_email: email.email ?? "",
        synced_email_password: email.password ?? "",
      })
      .eq("id", proxyId),
    db
      .from("emails")
      .update({
        synced_proxy_id: proxyId,
        synced_at: now,
        synced_proxy_host: proxy.host ?? "",
        synced_proxy_port: proxy.port ?? "",
        synced_proxy_country: proxy.country,
      })
      .eq("id", emailId),
  ]);

  if (proxyErr) throw new Error(proxyErr.message);
  if (emailErr) throw new Error(emailErr.message);

  if (!options?.skipAudit) {
    await writeAuditLog({
      actorUid,
      action: "proxy.email_synced",
      targetType: "proxy",
      targetId: proxyId,
      metadata: { emailId, email: email.email },
    });
  }
}

export async function unlinkProxyEmail(
  proxyId: string,
  actorUid: string
): Promise<void> {
  const db = supabaseAdmin();
  const { data: proxy } = await db
    .from("proxies")
    .select("*")
    .eq("id", proxyId)
    .maybeSingle();

  if (!proxy) throw new Error("Proxy not found");

  const emailId = proxy.synced_email_id;
  if (!emailId) throw new Error("Proxy is not synced to an email");

  await Promise.all([
    db
      .from("proxies")
      .update({
        synced_email_id: null,
        synced_at: null,
        synced_email_email: null,
        synced_email_password: null,
      })
      .eq("id", proxyId),
    db
      .from("emails")
      .update({
        synced_proxy_id: null,
        synced_at: null,
        ...emailProxySnapshotFields(null),
      })
      .eq("id", emailId),
  ]);

  await writeAuditLog({
    actorUid,
    action: "proxy.email_unsynced",
    targetType: "proxy",
    targetId: proxyId,
    metadata: { emailId },
  });
}

export async function autoSyncFreshEmails(
  actorUid: string
): Promise<{ synced: number; pairs: Array<{ proxyId: string; emailId: string }> }> {
  const db = supabaseAdmin();
  const [{ data: proxies }, { data: emails }] = await Promise.all([
    db
      .from("proxies")
      .select("id")
      .is("synced_email_id", null)
      .in("status", ["fresh", "available", "assigned"])
      .limit(500),
    db
      .from("emails")
      .select("id, status, synced_proxy_id")
      .limit(500),
  ]);

  const freeEmails = (emails ?? []).filter(
    (e) => e.status === "fresh" && !e.synced_proxy_id
  );

  const pairs: Array<{ proxyId: string; emailId: string }> = [];
  const limit = Math.min(proxies?.length ?? 0, freeEmails.length);

  for (let i = 0; i < limit; i++) {
    const proxyId = proxies![i].id;
    const emailId = freeEmails[i].id;
    await linkProxyToEmail(proxyId, emailId, actorUid, { skipAudit: true });
    pairs.push({ proxyId, emailId });
  }

  if (pairs.length) {
    await writeAuditLog({
      actorUid,
      action: "proxy.email_auto_synced",
      targetType: "proxy",
      targetId: "batch",
      metadata: { count: pairs.length },
    });
  }

  return { synced: pairs.length, pairs };
}
