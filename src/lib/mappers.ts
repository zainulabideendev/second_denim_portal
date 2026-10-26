import type { AppUser, Email, PhoneNumber, Proxy } from "@/lib/types";
import type {
  EmailRow,
  PhoneRow,
  ProfileRow,
  ProxyRow,
} from "@/lib/database.types";

export function mapProfile(row: ProfileRow): AppUser {
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    country: row.country ?? undefined,
    poolCountries: row.pool_countries?.length
      ? row.pool_countries
      : undefined,
    activeProxyLimit: row.active_proxy_limit,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapProxy(row: ProxyRow): Proxy {
  return {
    id: row.id,
    country: row.country,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    provider: row.provider,
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    batchId: row.batch_id ?? "",
    notes: row.notes ?? "",
    proxyCheapId: row.proxy_cheap_id,
    lane: row.lane ?? undefined,
    accountsCreated: row.accounts_created,
    stagingDone: row.staging_done,
    restricted: row.restricted,
    syncedEmailId: row.synced_email_id,
    syncedAt: row.synced_at,
    syncedEmail:
      row.synced_email_id && row.synced_email_email
        ? {
            id: row.synced_email_id,
            email: row.synced_email_email,
            password: row.synced_email_password ?? "",
          }
        : null,
    vintedUsername: row.vinted_username,
    vintedPassword: row.vinted_password,
    phoneId: row.phone_id,
    phoneNumber: row.phone_number,
    accountCreationNumberId: row.account_creation_number_id ?? null,
    accountCreationNumber: row.account_creation_number ?? null,
    accountCreationNumberLinkedAt:
      row.account_creation_number_linked_at ?? null,
  };
}

export function mapEmail(row: EmailRow): Email {
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    syncedProxyId: row.synced_proxy_id,
    syncedAt: row.synced_at,
    syncedProxy:
      row.synced_proxy_id && row.synced_proxy_host
        ? {
            id: row.synced_proxy_id,
            host: row.synced_proxy_host,
            port: row.synced_proxy_port ?? "",
            country: row.synced_proxy_country ?? "UK",
          }
        : null,
  };
}

export function mapPhone(row: PhoneRow): PhoneNumber {
  return {
    id: row.id,
    country: row.country,
    number: row.number,
    provider: row.provider,
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    status: row.status,
    numberType: row.number_type,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    batchId: row.batch_id ?? "",
    notes: row.notes ?? "",
    proxyId: row.proxy_id,
    proxy:
      row.proxy_id && row.proxy_host
        ? {
            id: row.proxy_id,
            host: row.proxy_host,
            port: row.proxy_port ?? "",
            country: row.proxy_country ?? "UK",
          }
        : null,
  };
}

export function toIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (
    typeof val === "object" &&
    val !== null &&
    "toDate" in val &&
    typeof (val as { toDate: () => Date }).toDate === "function"
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return String(val);
}
