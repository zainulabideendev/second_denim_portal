import type { PhoneAccountStatus, PhoneStatus } from "./types";

export const PHONE_ACCOUNT_STATUSES: PhoneAccountStatus[] = [
  "active",
  "banned",
  "banned_with_balance",
];

export const PHONE_ACCOUNT_STATUS_LABELS: Record<PhoneAccountStatus, string> = {
  active: "Active",
  banned: "Banned",
  banned_with_balance: "Banned with balance",
};

const ASSIGNED_STATUSES = new Set<string>([
  "active",
  "banned",
  "banned_with_balance",
  "assigned",
  "flagged",
]);

export function normalizePhoneStatus(status: string): PhoneStatus {
  if (status === "assigned") return "active";
  if (status === "flagged") return "banned";
  return status as PhoneStatus;
}

export function isPhoneAssignedStatus(status: string): boolean {
  return ASSIGNED_STATUSES.has(status);
}

export function isPhoneActiveStatus(status: string): boolean {
  const normalized = normalizePhoneStatus(status);
  return normalized === "active";
}

export function isPhoneBannedStatus(status: string): boolean {
  const normalized = normalizePhoneStatus(status);
  return normalized === "banned" || normalized === "banned_with_balance";
}

export function phoneStatusMatchesTab(
  status: string,
  tab: "active" | "banned" | "banned_with_balance"
): boolean {
  const normalized = normalizePhoneStatus(status);
  return normalized === tab;
}
