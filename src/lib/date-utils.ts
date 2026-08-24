import { differenceInDays, format, formatDistanceToNow } from "date-fns";

export function getDaysLeft(expiresAt: string): number {
  return differenceInDays(new Date(expiresAt), new Date());
}

export function getExpiryVariant(
  daysLeft: number
): "success" | "warning" | "destructive" | "secondary" {
  if (daysLeft < 0) return "destructive";
  if (daysLeft <= 2) return "destructive";
  if (daysLeft <= 7) return "warning";
  return "success";
}

export function formatExpiry(expiresAt: string): string {
  const days = getDaysLeft(expiresAt);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function formatDate(date: string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
