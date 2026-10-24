/**
 * SMSPVA activation API client (https://smspva.com)
 * Docs: https://smspva.com/new_theme_api.html
 */

export const SMSPVA_VINTED_SERVICE = "opt130";
export const SMSPVA_VINTED_NAME = "Vinted";

/** Always request UK Vodafone numbers for Vinted activations. */
export const SMSPVA_DEFAULT_COUNTRY = "UK" as const;
export const SMSPVA_DEFAULT_OPERATOR = "Vodafone_UK";

/** Portal countries → SMSPVA country codes (same ISO-style codes). */
export const SMSPVA_COUNTRIES = ["FR", "BE", "UK", "DE"] as const;
export type SmspvaCountry = (typeof SMSPVA_COUNTRIES)[number];

const DIAL: Record<SmspvaCountry, string> = {
  UK: "44",
  FR: "33",
  BE: "32",
  DE: "49",
};

export function formatSmspvaPhone(
  country: SmspvaCountry,
  raw: string | null | undefined
): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return String(raw);
  if (String(raw).trim().startsWith("+")) return `+${digits}`;
  const dial = DIAL[country];
  if (digits.startsWith(dial)) return `+${digits}`;
  return `+${dial}${digits}`;
}

export class SmspvaError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "SmspvaError";
  }
}

function apiKey(): string {
  const key = process.env.SMSPVA_API_KEY?.trim();
  if (!key) {
    throw new SmspvaError(
      "Number service is not configured. Please contact an admin."
    );
  }
  return key;
}

type RawResponse = {
  response?: string | number;
  responce?: string | number; // typo in SMSPVA ban/denial docs
  number?: string | null;
  id?: string | number | null;
  sms?: string | null;
  text?: string | null;
  balance?: string | number;
  error_msg?: string;
  [key: string]: unknown;
};

function responseCode(data: RawResponse): string {
  const v = data.response ?? data.responce;
  return v == null ? "" : String(v);
}

function mapCommonError(data: RawResponse, fallback: string): SmspvaError {
  const code = responseCode(data);
  if (code === "5") {
    return new SmspvaError(
      "Too many requests right now. Please wait a minute and try again.",
      "5"
    );
  }
  if (code === "6") {
    return new SmspvaError(
      "Number service is temporarily unavailable. Try again in about 10 minutes.",
      "6"
    );
  }
  if (code === "7") {
    return new SmspvaError(
      "Too many open number requests. Wait for previous codes or cancel unused numbers.",
      "7"
    );
  }
  if (data.error_msg) {
    return new SmspvaError(String(data.error_msg), code || undefined);
  }
  if (typeof data.response === "string" && data.response.toLowerCase().includes("error")) {
    return new SmspvaError(fallback, code || undefined);
  }
  return new SmspvaError(fallback, code || undefined);
}

async function smspvaGet(
  params: Record<string, string>
): Promise<RawResponse> {
  const key = apiKey();
  const qs = new URLSearchParams({ ...params, apikey: key });
  // SMSPVA docs use both "metod" and "method"
  if (params.metod && !params.method) qs.set("method", params.metod);

  const url = `https://smspva.com/priemnik.php?${qs.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new SmspvaError(
      err instanceof Error
        ? `Could not reach the number service: ${err.message}`
        : "Could not reach the number service. Please try again."
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new SmspvaError(
      "Number service is temporarily unavailable. Please try again shortly."
    );
  }

  // Plain-text Russian / English error strings
  const trimmed = text.trim();
  if (trimmed.includes("API KEY") || trimmed.includes("API KEY не")) {
    throw new SmspvaError(
      "Number service is misconfigured. Please contact an admin."
    );
  }
  if (trimmed.includes("Недостаточно средств") || /insufficient funds/i.test(trimmed)) {
    throw new SmspvaError(
      "Number service credit is too low. Please ask an admin to top up."
    );
  }
  if (trimmed.includes("Превышено количество попыток")) {
    throw new SmspvaError("Too many requests. Wait a few seconds and try again.");
  }
  if (trimmed.includes("Неверный запрос")) {
    throw new SmspvaError("Invalid request. Please try again or contact support.");
  }
  if (
    trimmed.includes("неизвестная ошибка") ||
    trimmed.includes("внутренняя ошибка")
  ) {
    throw new SmspvaError("Number service error. Please try again shortly.");
  }

  try {
    return JSON.parse(trimmed) as RawResponse;
  } catch {
    throw new SmspvaError(
      "Unexpected response from the number service. Please try again."
    );
  }
}

export async function smspvaGetBalance(): Promise<number> {
  const data = await smspvaGet({
    metod: "get_balance",
    service: SMSPVA_VINTED_SERVICE,
  });
  const code = responseCode(data);
  if (code !== "1" || data.balance == null) {
    throw mapCommonError(data, "Could not read service credit.");
  }
  return Number(data.balance);
}

export type SmspvaNumberResult = {
  orderId: string;
  number: string;
};

export async function smspvaGetNumber(
  country: SmspvaCountry = SMSPVA_DEFAULT_COUNTRY,
  service = SMSPVA_VINTED_SERVICE,
  operator = SMSPVA_DEFAULT_OPERATOR
): Promise<SmspvaNumberResult> {
  const data = await smspvaGet({
    metod: "get_number",
    country,
    service,
    operator,
  });
  const code = responseCode(data);

  if (code === "2") {
    throw new SmspvaError(
      `No UK Vodafone numbers available for Vinted right now. Wait about a minute and try again.`,
      "2"
    );
  }

  if (code !== "1" || !data.number || data.id == null || String(data.id) === "-1") {
    throw mapCommonError(
      data,
      `Could not get a UK Vodafone number for Vinted. Please try again.`
    );
  }

  return {
    orderId: String(data.id),
    number: String(data.number),
  };
}

export type SmspvaSmsResult =
  | { status: "waiting" }
  | { status: "received"; code: string; text?: string | null }
  | { status: "expired" }
  | { status: "already_shown" };

export async function smspvaGetSms(
  country: SmspvaCountry,
  orderId: string,
  service = SMSPVA_VINTED_SERVICE
): Promise<SmspvaSmsResult> {
  const data = await smspvaGet({
    metod: "get_sms",
    country,
    service,
    id: orderId,
  });
  const code = responseCode(data);

  if (code === "1" && data.sms) {
    return {
      status: "received",
      code: String(data.sms),
      text: data.text != null ? String(data.text) : null,
    };
  }
  if (code === "2") return { status: "waiting" };
  if (code === "3") return { status: "expired" };
  if (code === "4") return { status: "already_shown" };

  throw mapCommonError(data, "Could not check SMS status. Please try again.");
}

export async function smspvaBan(
  orderId: string,
  service = SMSPVA_VINTED_SERVICE
): Promise<void> {
  const data = await smspvaGet({
    metod: "ban",
    service,
    id: orderId,
  });
  const code = responseCode(data);
  if (code !== "1") {
    // Non-fatal for our flow — log via throw only if clearly rate-limited
    if (code === "5" || code === "6" || code === "7") {
      throw mapCommonError(data, "Could not release the number.");
    }
  }
}

export async function smspvaDenial(
  country: SmspvaCountry,
  orderId: string,
  service = SMSPVA_VINTED_SERVICE
): Promise<void> {
  const data = await smspvaGet({
    metod: "denial",
    country,
    service,
    id: orderId,
  });
  const code = responseCode(data);
  if (code !== "1") {
    if (code === "5" || code === "6" || code === "7") {
      throw mapCommonError(data, "Could not cancel the number request.");
    }
  }
}
