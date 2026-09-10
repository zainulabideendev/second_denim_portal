// ─── Roles ────────────────────────────────────────────────────────────────────

export type Role = "admin" | "manager" | "salesman";

export const COUNTRIES = ["FR", "BE", "UK", "DE"] as const;
export type Country = (typeof COUNTRIES)[number];

export const COUNTRY_LABELS: Record<Country, string> = {
  FR: "France",
  BE: "Belgium",
  UK: "UK",
  DE: "Germany",
};

// ─── Users ────────────────────────────────────────────────────────────────────

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  country?: Country;
  /** Up to 3 countries — admin assigns per-user proxy pools */
  poolCountries?: Country[];
  activeProxyLimit: number;
  status: "active" | "disabled";
  createdAt: string; // ISO string
}

export const MAX_POOL_COUNTRIES = 3;

/** Admin-created pool assignment: one user + one country */
export interface UserCountryPool {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  country: Country;
  /** Max active accounts */
  sizePerLane: number;
  /** Max backup accounts — optional on legacy docs (falls back to sizePerLane × 2) */
  backupLimit?: number;
  createdAt: string;
  createdBy: string;
}

export interface UserCountryPoolRow extends UserCountryPool {
  filled: number;
  total: number;
  byLane: { backup: number; active: number };
}

// ─── Pool configuration (legacy defaults) ─────────────────────────────────────

export interface CountryPoolSettings {
  sizePerLane: number;
}

export interface PoolConfig {
  defaultSizePerLane: number;
  byCountry: Record<Country, CountryPoolSettings>;
  updatedAt?: string;
  updatedBy?: string;
}

// ─── Proxies ──────────────────────────────────────────────────────────────────

export type ProxyStatus =
  | "fresh"
  | "available"
  | "active"
  | "assigned"
  | "expired"
  | "flagged"
  | "retired";

/**
 * Pool lanes — backup + active per country.
 * backup → create Gmail + Vinted accounts; promote to active when ready
 * active → live accounts in use
 *
 * Admin active limit = sizePerLane.
 * Backup limit = backupLimit when set, else sizePerLane × 2 (legacy).
 */
export type ProxyLane = "backup" | "active";

export const POOL_SIZE_PER_LANE = 3;
export const POOL_LANES: ProxyLane[] = ["backup", "active"];

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  defaultSizePerLane: POOL_SIZE_PER_LANE,
  byCountry: {
    FR: { sizePerLane: 3 },
    BE: { sizePerLane: 3 },
    UK: { sizePerLane: 3 },
    DE: { sizePerLane: 3 },
  },
};

export interface CountryPoolLanes {
  backup: Proxy[];
  active: Proxy[];
  poolSize: number;
  totalSlots: number;
  /** Admin-configured max active accounts (= sizePerLane in Firestore). */
  activeLimit: number;
  backupLimit: number;
  sizePerLane: number;
  canPromote: boolean;
  activeWorkingCount: number;
  restrictedCount: number;
  restrictedLimit: number;
  canRestrict: boolean;
}

export interface Proxy {
  id: string;
  country: Country;
  host: string;
  port: string;
  username: string;
  password: string;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  status: ProxyStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  batchId: string;
  notes: string;
  /** Proxy-Cheap proxy id — used by cron to skip already-imported proxies */
  proxyCheapId?: string | null;
  /** Pool lane — only set when status === "assigned" */
  lane?: ProxyLane;
  /** True once salesman has created Gmail + Vinted on this backup proxy */
  accountsCreated?: boolean;
  /** @deprecated Use accountsCreated — kept for legacy Firestore docs */
  stagingDone?: boolean;
  /** Linked inventory email id (admin sync) */
  syncedEmailId?: string | null;
  syncedAt?: string | null;
  /** Populated in API responses when synced */
  syncedEmail?: Pick<Email, "id" | "email" | "password"> | null;
  /** Paused active account — frees a working slot without banning */
  restricted?: boolean;
  vintedUsername?: string;
  vintedPassword?: string;
  /** Linked phone number id */
  phoneId?: string | null;
  /** Populated/cached phone number string */
  phoneNumber?: string | null;
  /** Populated phone summary */
  phone?: Pick<PhoneNumber, "id" | "number"> | null;
}

export interface ProxyWithUser extends Proxy {
  assignedUser?: Pick<AppUser, "uid" | "name" | "email"> | null;
}

// ─── Phone Numbers ────────────────────────────────────────────────────────────

export type PhoneAccountStatus = "active" | "inactive";

export type PhoneNumberType = "temporary" | "permanent";

export type PhoneStatus =
  | "available"
  | PhoneAccountStatus
  | "expired"
  | "retired"
  | "assigned" // legacy
  | "flagged" // legacy
  | "banned" // legacy
  | "banned_with_balance"; // legacy

export interface PhoneNumber {
  id: string;
  country: Country;
  number: string;
  numberType?: PhoneNumberType;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  status: PhoneStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  batchId: string;
  notes: string;
  /** Linked proxy id */
  proxyId?: string | null;
  /** Populated in API responses when linked to a proxy */
  proxy?: Pick<Proxy, "id" | "host" | "port" | "country"> | null;
}

export interface PhoneNumberWithUser extends PhoneNumber {
  assignedUser?: Pick<AppUser, "uid" | "name" | "email"> | null;
}

// ─── Import Batches ───────────────────────────────────────────────────────────

export interface ImportBatch {
  id: string;
  type: "proxy" | "phone";
  importedBy: string;
  importedAt: string;
  country: Country;
  count: number;
  rawFileName: string;
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export type RequestType = "proxy" | "phone";
export type RequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

export interface ItemRequest {
  id: string;
  type: RequestType;
  requestedBy: string;
  country: Country;
  reason: string;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  fulfilledItemId: string | null;
  createdAt: string;
}

export interface ItemRequestWithUsers extends ItemRequest {
  requestedByUser?: Pick<AppUser, "uid" | "name" | "email"> | null;
  reviewedByUser?: Pick<AppUser, "uid" | "name" | "email"> | null;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAction =
  | "proxy.assigned"
  | "proxy.revoked"
  | "proxy.flagged"
  | "proxy.expired"
  | "proxy.retired"
  | "proxy.imported"
  | "proxy.lane_promoted"
  | "proxy.accounts_created"
  | "proxy.restricted"
  | "proxy.unrestricted"
  | "proxy.staging_done"
  | "proxy.email_synced"
  | "proxy.email_unsynced"
  | "proxy.email_auto_synced"
  | "proxy.updated"
  | "pool.config_updated"
  | "pool.user_countries_updated"
  | "pool.created"
  | "pool.updated"
  | "pool.deleted"
  | "email.imported"
  | "email.assigned"
  | "email.revoked"
  | "email.flagged"
  | "email.retired"
  | "phone.assigned"
  | "phone.revoked"
  | "phone.flagged"
  | "phone.expired"
  | "phone.retired"
  | "phone.imported"
  | "request.created"
  | "request.approved"
  | "request.rejected"
  | "request.fulfilled"
  | "user.created"
  | "user.updated"
  | "user.disabled";

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName?: string;
  action: AuditAction;
  targetType: "proxy" | "phone" | "request" | "user";
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface CountryStats {
  country: Country;
  available: number;
  assigned: number;
  expired: number;
  flagged: number;
  total: number;
}

export interface DashboardSummary {
  role: Role;
  proxyStats: CountryStats[];
  phoneStats: CountryStats[];
  pendingRequests: number;
  expiringSoon: Array<{
    id: string;
    type: "proxy" | "phone";
    country: Country;
    expiresAt: string;
    assignedTo: string | null;
    daysLeft: number;
  }>;
  // salesman-specific
  myActiveProxies?: number;
  myActivePhones?: number;
  myPendingRequests?: number;
  myExpiringSoon?: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  uid: string;
  type: "request_pending" | "request_reviewed" | "proxy_flagged" | "expiry_warning";
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
}

// ─── Emails ───────────────────────────────────────────────────────────────────

export type EmailStatus = "fresh" | "available" | "assigned" | "flagged" | "retired";

export interface Email {
  id: string;
  email: string;
  password: string;
  status: EmailStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  notes: string;
  createdAt: string;
  /** Linked proxy id (admin sync) */
  syncedProxyId?: string | null;
  syncedAt?: string | null;
  /** Populated in API responses when synced */
  syncedProxy?: Pick<Proxy, "id" | "host" | "port" | "country"> | null;
}

// ─── CSV Import Row ───────────────────────────────────────────────────────────

export interface CsvProxyRow {
  host: string;
  port: string;
  username: string;
  password: string;
  country: Country;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  notes?: string;
}

export interface CsvEmailRow {
  email: string;
  password: string;
  notes?: string;
}

export interface CsvPhoneRow {
  number: string;
  country: Country;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  notes?: string;
}

// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
