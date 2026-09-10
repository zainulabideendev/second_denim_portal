import type { PhoneAccountStatus, PhoneNumberType, PhoneStatus } from "./types";

export const PHONE_ACCOUNT_STATUSES: PhoneAccountStatus[] = [
  "active",
  "inactive",
];

export const PHONE_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  banned: "Inactive",
  banned_with_balance: "Inactive",
};

export const PHONE_NUMBER_TYPES: PhoneNumberType[] = [
  "temporary",
  "permanent",
];

export const PHONE_NUMBER_TYPE_LABELS: Record<PhoneNumberType, string> = {
  temporary: "Temporary",
  permanent: "Permanent",
};

const ASSIGNED_STATUSES = new Set<string>([
  "active",
  "inactive",
  "banned",
  "banned_with_balance",
  "assigned",
  "flagged",
]);

export function normalizePhoneStatus(status: string): PhoneStatus {
  if (status === "assigned" || status === "active") return "active";
  if (
    status === "flagged" ||
    status === "banned" ||
    status === "banned_with_balance" ||
    status === "inactive"
  ) {
    return "inactive";
  }
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
  return normalized === "inactive";
}

export function phoneStatusMatchesTab(
  status: string,
  tab: "active" | "inactive" | "banned" | "banned_with_balance"
): boolean {
  const normalized = normalizePhoneStatus(status);
  if (tab === "inactive") {
    return normalized === "inactive";
  }
  if (tab === "active") {
    return normalized === "active";
  }
  return status === tab;
}
