import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapEmail, mapPhone, mapProxy } from "@/lib/mappers";
import type { EmailRow, PhoneRow, ProxyRow } from "@/lib/database.types";

export { mapProxy as mapProxyDoc, mapEmail as mapEmailDoc, mapPhone as mapPhoneDoc };

type SyncedProxySnap = {
  id: string;
  host: string;
  port: string;
  country: string;
};

/** Prefer denormalized snapshot fields; only fetch missing links. */
export async function enrichProxiesWithSyncedEmails<
  T extends {
    id: string;
    syncedEmailId?: string | null;
    syncedEmail?: { id: string; email: string; password: string } | null;
  }
>(proxies: T[]) {
  const needFetch = proxies.filter(
    (p) => p.syncedEmailId && !p.syncedEmail?.email
  );
  const emailIds = [
    ...new Set(
      needFetch.map((p) => p.syncedEmailId).filter((id): id is string => !!id)
    ),
  ];

  if (!emailIds.length) {
    return proxies.map((p) => ({
      ...p,
      syncedEmail: p.syncedEmailId ? p.syncedEmail ?? null : null,
    }));
  }

  const { data: emailDocs } = await supabaseAdmin()
    .from("emails")
    .select("id, email, password")
    .in("id", emailIds);

  const emailMap = new Map(
    (emailDocs ?? []).map(
      (d) =>
        [d.id, { id: d.id, email: d.email, password: d.password }] as const
    )
  );

  const backfills = needFetch
    .map((p) => {
      const snap = p.syncedEmailId ? emailMap.get(p.syncedEmailId) : null;
      if (!snap) return null;
      return supabaseAdmin()
        .from("proxies")
        .update({
          synced_email_email: snap.email,
          synced_email_password: snap.password,
        })
        .eq("id", p.id);
    })
    .filter(Boolean);

  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return proxies.map((p) => ({
    ...p,
    syncedEmail: p.syncedEmailId
      ? p.syncedEmail ?? emailMap.get(p.syncedEmailId) ?? null
      : null,
  }));
}

export async function enrichEmailsWithSyncedProxies<
  T extends {
    id: string;
    syncedProxyId?: string | null;
    syncedProxy?: SyncedProxySnap | null;
  }
>(emails: T[]) {
  const needFetch = emails.filter(
    (e) => e.syncedProxyId && !e.syncedProxy?.host
  );
  const proxyIds = [
    ...new Set(
      needFetch.map((e) => e.syncedProxyId).filter((id): id is string => !!id)
    ),
  ];
  if (!proxyIds.length) {
    return emails.map((e) => ({
      ...e,
      syncedProxy: e.syncedProxyId ? e.syncedProxy ?? null : null,
    }));
  }

  const { data: proxyDocs } = await supabaseAdmin()
    .from("proxies")
    .select("id, host, port, country")
    .in("id", proxyIds);

  const proxyMap = new Map(
    (proxyDocs ?? []).map(
      (d) =>
        [
          d.id,
          { id: d.id, host: d.host, port: d.port, country: d.country },
        ] as const
    )
  );

  const backfills = needFetch
    .map((e) => {
      const snap = e.syncedProxyId ? proxyMap.get(e.syncedProxyId) : null;
      if (!snap) return null;
      return supabaseAdmin()
        .from("emails")
        .update({
          synced_proxy_host: snap.host,
          synced_proxy_port: snap.port,
          synced_proxy_country: snap.country,
        })
        .eq("id", e.id);
    })
    .filter(Boolean);

  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return emails.map((e) => ({
    ...e,
    syncedProxy: e.syncedProxyId
      ? e.syncedProxy ?? proxyMap.get(e.syncedProxyId) ?? null
      : null,
  }));
}

export async function enrichPhonesWithProxies<
  T extends {
    id: string;
    proxyId?: string | null;
    proxy?: SyncedProxySnap | null;
  }
>(phones: T[]) {
  const needFetch = phones.filter((p) => p.proxyId && !p.proxy?.host);
  const proxyIds = [
    ...new Set(
      needFetch.map((p) => p.proxyId).filter((id): id is string => !!id)
    ),
  ];
  if (!proxyIds.length) {
    return phones.map((p) => ({
      ...p,
      proxy: p.proxyId ? p.proxy ?? null : null,
    }));
  }

  const { data: proxyDocs } = await supabaseAdmin()
    .from("proxies")
    .select("id, host, port, country")
    .in("id", proxyIds);

  const proxyMap = new Map(
    (proxyDocs ?? []).map(
      (d) =>
        [
          d.id,
          { id: d.id, host: d.host, port: d.port, country: d.country },
        ] as const
    )
  );

  const backfills = needFetch
    .map((p) => {
      const snap = p.proxyId ? proxyMap.get(p.proxyId) : null;
      if (!snap) return null;
      return supabaseAdmin()
        .from("phone_numbers")
        .update({
          proxy_host: snap.host,
          proxy_port: snap.port,
          proxy_country: snap.country,
        })
        .eq("id", p.id);
    })
    .filter(Boolean);

  if (backfills.length) {
    void Promise.all(backfills).catch(() => undefined);
  }

  return phones.map((p) => ({
    ...p,
    proxy: p.proxyId ? p.proxy ?? proxyMap.get(p.proxyId) ?? null : null,
  }));
}

export function emailProxySnapshotFields(
  proxy: { host?: string; port?: string; country?: string } | null
) {
  if (!proxy) {
    return {
      synced_proxy_host: null,
      synced_proxy_port: null,
      synced_proxy_country: null,
    };
  }
  return {
    synced_proxy_host: proxy.host ?? "",
    synced_proxy_port: proxy.port ?? "",
    synced_proxy_country: (proxy.country as "FR" | "BE" | "UK" | "DE") ?? null,
  };
}

export function phoneProxySnapshotFields(
  proxy: { host?: string; port?: string; country?: string } | null
) {
  if (!proxy) {
    return { proxy_host: null, proxy_port: null, proxy_country: null };
  }
  return {
    proxy_host: proxy.host ?? "",
    proxy_port: proxy.port ?? "",
    proxy_country: (proxy.country as "FR" | "BE" | "UK" | "DE") ?? null,
  };
}

export function mapProxyFromRow(row: ProxyRow) {
  return mapProxy(row);
}

export function mapEmailFromRow(row: EmailRow) {
  return mapEmail(row);
}

export function mapPhoneFromRow(row: PhoneRow) {
  return mapPhone(row);
}
