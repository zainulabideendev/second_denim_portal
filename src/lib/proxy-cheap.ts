import { addDays } from "date-fns";
import type { Country } from "@/lib/types";

const API_BASE = "https://api.proxy-cheap.com";
export const PROXY_CHEAP_PROVIDER = "proxy-cheap";

/** Country-specific Proxy-Cheap accounts (one API key pair each). */
export const PROXY_CHEAP_ACCOUNTS = [
  { id: "UK", country: "UK" as Country, keyEnv: "PROXY_CHEAP_UK_API_KEY", secretEnv: "PROXY_CHEAP_UK_API_SECRET" },
  { id: "BE", country: "BE" as Country, keyEnv: "PROXY_CHEAP_BE_API_KEY", secretEnv: "PROXY_CHEAP_BE_API_SECRET" },
  { id: "FR", country: "FR" as Country, keyEnv: "PROXY_CHEAP_FR_API_KEY", secretEnv: "PROXY_CHEAP_FR_API_SECRET" },
] as const;

export type ProxyCheapAccountId = (typeof PROXY_CHEAP_ACCOUNTS)[number]["id"];

export interface ProxyCheapAccountConfig {
  id: ProxyCheapAccountId;
  country: Country;
  apiKey: string;
  apiSecret: string;
}

export interface ProxyCheapRawProxy {
  id?: number | string;
  status?: string;
  countryCode?: string;
  country?: string;
  networkType?: string;
  type?: string;
  ip?: string;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  authentication?: {
    username?: string;
    password?: string;
    whitelistedIps?: string[];
  };
  connection?: {
    publicIp?: string;
    connectIp?: string;
    httpPort?: number | string;
    httpsPort?: number | string;
    socks5Port?: number | string;
  };
  proxyType?: string;
  createdAt?: string;
  expiresAt?: string;
  expires_at?: string;
  metadata?: {
    ispName?: string;
    country?: string;
    countryCode?: string;
  };
  orderId?: number | string;
}

export interface MappedProxyCheapProxy {
  proxyCheapId: string;
  host: string;
  port: string;
  username: string;
  password: string;
  /** App inventory status for new inserts — always "fresh". */
  status: "fresh";
  country: Country;
  provider: string;
  purchasedAt: Date;
  expiresAt: Date;
  notes: string;
  accountId: ProxyCheapAccountId;
}

export interface AccountFetchStats {
  accountId: ProxyCheapAccountId;
  country: Country;
  fetched: number;
  skippedOther: number;
  /** Proxies whose API countryCode did not match this account (UK/BE/FR). */
  skippedWrongCountry: number;
  error?: string;
}

export interface FetchProxyCheapResult {
  proxies: MappedProxyCheapProxy[];
  byAccount: AccountFetchStats[];
  skippedOther: number;
  skippedWrongCountry: number;
  accountsUsed: ProxyCheapAccountId[];
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function unwrapProxyList(payload: unknown): ProxyCheapRawProxy[] {
  if (Array.isArray(payload)) return payload as ProxyCheapRawProxy[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.proxies)) return obj.proxies as ProxyCheapRawProxy[];
    if (Array.isArray(obj.data)) return obj.data as ProxyCheapRawProxy[];
  }
  return [];
}

/** Normalize Proxy-Cheap country codes to app countries (GB → UK). */
export function normalizeProxyCheapCountryCode(
  raw: string | undefined | null
): Country | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code === "GB") return "UK";
  if (code === "UK" || code === "BE" || code === "FR" || code === "DE") {
    return code as Country;
  }
  return null;
}

function extractApiCountryCode(raw: ProxyCheapRawProxy): string | undefined {
  return (
    raw.countryCode ||
    raw.country ||
    raw.metadata?.countryCode ||
    raw.metadata?.country ||
    undefined
  );
}

/** Load configured UK / BE / FR accounts from env (skips incomplete pairs). */
export function getConfiguredProxyCheapAccounts(): ProxyCheapAccountConfig[] {
  const accounts: ProxyCheapAccountConfig[] = [];

  for (const def of PROXY_CHEAP_ACCOUNTS) {
    const apiKey = process.env[def.keyEnv]?.trim();
    const apiSecret = process.env[def.secretEnv]?.trim();
    if (!apiKey || !apiSecret || apiKey === "..." || apiSecret === "...") continue;
    accounts.push({
      id: def.id,
      country: def.country,
      apiKey,
      apiSecret,
    });
  }

  return accounts;
}

async function proxyCheapGet(
  path: string,
  account: Pick<ProxyCheapAccountConfig, "apiKey" | "apiSecret" | "id">
): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Api-Key": account.apiKey,
      "X-Api-Secret": account.apiSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Proxy-Cheap [${account.id}] API error ${res.status} on ${path}: ${body.slice(0, 300)}`
    );
  }

  return res.json();
}

type MapOutcome =
  | { ok: true; proxy: MappedProxyCheapProxy }
  | { ok: false; reason: "inactive" | "incomplete" | "wrong_country" };

/**
 * Map a raw proxy for one country account.
 * - Country saved = account country (UK / BE / FR only)
 * - If API reports a different countryCode, skip (wrong account)
 * - Requires Proxy-Cheap proxy id for cron dedupe
 */
export function mapProxyCheapProxy(
  raw: ProxyCheapRawProxy,
  account: Pick<ProxyCheapAccountConfig, "id" | "country">
): MapOutcome {
  const apiStatus = (raw.status ?? "").toUpperCase();
  if (apiStatus && apiStatus !== "ACTIVE") {
    return { ok: false, reason: "inactive" };
  }

  if (raw.id == null || String(raw.id).trim() === "") {
    return { ok: false, reason: "incomplete" };
  }

  // If API includes country, it must match this account (UK account → UK only, etc.)
  const apiCountry = normalizeProxyCheapCountryCode(extractApiCountryCode(raw));
  if (apiCountry && apiCountry !== account.country) {
    return { ok: false, reason: "wrong_country" };
  }

  const host = (
    raw.connection?.connectIp ||
    raw.connection?.publicIp ||
    raw.ip ||
    raw.host ||
    ""
  ).trim();
  const portRaw =
    raw.connection?.httpPort ??
    raw.connection?.httpsPort ??
    raw.connection?.socks5Port ??
    raw.port;
  const port = portRaw != null ? String(portRaw).trim() : "";
  const username = (raw.authentication?.username ?? raw.username ?? "").trim();
  const password = (raw.authentication?.password ?? raw.password ?? "").trim();

  if (!host || !port || !username || !password) {
    return { ok: false, reason: "incomplete" };
  }

  const now = new Date();
  const purchasedAt = parseDate(raw.createdAt, now);
  const expiresAt = parseDate(raw.expiresAt ?? raw.expires_at, addDays(purchasedAt, 30));
  const proxyCheapId = String(raw.id).trim();

  const notesParts = [
    `account=${account.id}`,
    raw.networkType || raw.type ? `type=${raw.networkType || raw.type}` : null,
    raw.metadata?.ispName ? `isp=${raw.metadata.ispName}` : null,
  ].filter(Boolean);

  return {
    ok: true,
    proxy: {
      proxyCheapId,
      host,
      port,
      username,
      password,
      status: "fresh",
      // Always the account country — UK account → UK, BE → BE, FR → FR
      country: account.country,
      provider: PROXY_CHEAP_PROVIDER,
      purchasedAt,
      expiresAt,
      notes: notesParts.join("; "),
      accountId: account.id,
    },
  };
}

async function fetchAccountProxies(
  account: ProxyCheapAccountConfig
): Promise<{
  proxies: MappedProxyCheapProxy[];
  skippedOther: number;
  skippedWrongCountry: number;
}> {
  const listPayload = await proxyCheapGet("/proxies", account);
  const proxies: MappedProxyCheapProxy[] = [];
  let skippedOther = 0;
  let skippedWrongCountry = 0;

  const consume = (raw: ProxyCheapRawProxy) => {
    const outcome = mapProxyCheapProxy(raw, account);
    if (!outcome.ok) {
      if (outcome.reason === "wrong_country") skippedWrongCountry += 1;
      else skippedOther += 1;
      return;
    }
    proxies.push(outcome.proxy);
  };

  for (const raw of unwrapProxyList(listPayload)) {
    consume(raw);
  }

  const orderIdsEnv = process.env[`PROXY_CHEAP_${account.id}_ORDER_IDS`] ?? "";
  const orderIds = orderIdsEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const orderId of orderIds) {
    const orderProxies = await proxyCheapGet(`/orders/${orderId}/proxies`, account);
    for (const raw of unwrapProxyList(orderProxies)) {
      consume(raw);
    }
  }

  return { proxies, skippedOther, skippedWrongCountry };
}

/**
 * Fetch per country account:
 * UK keys → only UK proxies, BE keys → only BE, FR keys → only FR.
 */
export async function fetchProxyCheapProxies(): Promise<FetchProxyCheapResult> {
  const accounts = getConfiguredProxyCheapAccounts();

  if (accounts.length === 0) {
    throw new Error(
      "Proxy-Cheap is not configured. Set at least one account pair: " +
        "PROXY_CHEAP_UK_API_KEY/SECRET, PROXY_CHEAP_BE_API_KEY/SECRET, or PROXY_CHEAP_FR_API_KEY/SECRET."
    );
  }

  // Key by account + proxy id so the same numeric id on different accounts cannot collide
  const byId = new Map<string, MappedProxyCheapProxy>();
  const byAccount: AccountFetchStats[] = [];
  let skippedOther = 0;
  let skippedWrongCountry = 0;

  for (const account of accounts) {
    try {
      const result = await fetchAccountProxies(account);
      skippedOther += result.skippedOther;
      skippedWrongCountry += result.skippedWrongCountry;

      for (const proxy of result.proxies) {
        byId.set(`${proxy.accountId}:${proxy.proxyCheapId}`, proxy);
      }

      byAccount.push({
        accountId: account.id,
        country: account.country,
        fetched: result.proxies.length,
        skippedOther: result.skippedOther,
        skippedWrongCountry: result.skippedWrongCountry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      byAccount.push({
        accountId: account.id,
        country: account.country,
        fetched: 0,
        skippedOther: 0,
        skippedWrongCountry: 0,
        error: message,
      });
    }
  }

  const anySuccess = byAccount.some((a) => !a.error);
  if (!anySuccess) {
    const details = byAccount.map((a) => `${a.accountId}: ${a.error}`).join(" | ");
    throw new Error(`Proxy-Cheap sync failed for all accounts. ${details}`);
  }

  return {
    proxies: [...byId.values()],
    byAccount,
    skippedOther,
    skippedWrongCountry,
    accountsUsed: accounts.map((a) => a.id),
  };
}
