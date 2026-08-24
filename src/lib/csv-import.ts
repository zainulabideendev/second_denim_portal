import { addDays, format } from "date-fns";
import { COUNTRIES } from "@/lib/types";
import type { Country } from "@/lib/types";

export type ImportKind = "proxy" | "phone" | "email";

export interface ParsedProxyRow {
  host: string;
  port: string;
  username: string;
  password: string;
  country: Country;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  notes: string;
  _errors?: string[];
}

export interface ParsedPhoneRow {
  number: string;
  country: Country;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  notes: string;
  _errors?: string[];
}

export interface ParsedEmailRow {
  email: string;
  password: string;
  notes: string;
  _errors?: string[];
}

export type ParsedRow = ParsedProxyRow | ParsedPhoneRow | ParsedEmailRow;

function splitCsvLine(line: string): string[] {
  const sep = line.includes(";") ? ";" : ",";
  return line.split(sep).map((p) => p.trim().replace(/^"|"$/g, ""));
}

export function parseProxyCsv(
  raw: string,
  defaultCountry: Country,
  defaultProvider: string
): ParsedProxyRow[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const expiry = format(addDays(new Date(), 30), "yyyy-MM-dd");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("host"))
    .map((line) => {
      const [host, port, username, password, country, provider, purchasedAt, expiresAt] =
        splitCsvLine(line);
      const errors: string[] = [];
      if (!host) errors.push("host required");
      if (!port) errors.push("port required");
      if (!username) errors.push("username required");
      if (!password) errors.push("password required");
      const resolvedCountry = (country as Country) || defaultCountry;
      if (!COUNTRIES.includes(resolvedCountry)) errors.push(`invalid country: ${resolvedCountry}`);
      return {
        host: host ?? "",
        port: port ?? "",
        username: username ?? "",
        password: password ?? "",
        country: resolvedCountry,
        provider: provider || defaultProvider || "Unknown",
        purchasedAt: purchasedAt || today,
        expiresAt: expiresAt || expiry,
        notes: "",
        _errors: errors.length ? errors : undefined,
      };
    });
}

export function parsePhoneCsv(
  raw: string,
  defaultCountry: Country,
  defaultProvider: string
): ParsedPhoneRow[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const expiry = format(addDays(new Date(), 30), "yyyy-MM-dd");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("number"))
    .map((line) => {
      const [number, country, provider, purchasedAt, expiresAt] = splitCsvLine(line);
      const errors: string[] = [];
      if (!number) errors.push("number required");
      const resolvedCountry = (country as Country) || defaultCountry;
      if (!COUNTRIES.includes(resolvedCountry)) errors.push(`invalid country: ${resolvedCountry}`);
      return {
        number: number ?? "",
        country: resolvedCountry,
        provider: provider || defaultProvider || "Unknown",
        purchasedAt: purchasedAt || today,
        expiresAt: expiresAt || expiry,
        notes: "",
        _errors: errors.length ? errors : undefined,
      };
    });
}

export function parseEmailCsv(raw: string): ParsedEmailRow[] {
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("email"))
    .map((line) => {
      const [email, password, notes] = splitCsvLine(line);
      const errors: string[] = [];
      if (!email || !email.includes("@")) errors.push("invalid email");
      if (!password) errors.push("password required");
      return {
        email: email ?? "",
        password: password ?? "",
        notes: notes ?? "",
        _errors: errors.length ? errors : undefined,
      };
    });
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const IMPORT_FORMATS: Record<ImportKind, string> = {
  proxy: "host, port, username, password, country, provider, purchasedAt, expiresAt",
  phone: "number, country, provider, purchasedAt, expiresAt",
  email: "email, password",
};

export const SAMPLE_CSV_PATHS: Record<ImportKind, string> = {
  proxy: "/samples/sample-proxies.csv",
  phone: "/samples/sample-phones.csv",
  email: "/samples/sample-emails.csv",
};
