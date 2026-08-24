import React from "react";
import { Badge } from "@/components/ui/badge";
import { getDaysLeft, formatExpiry } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface ExpiryBadgeProps {
  expiresAt: string;
  className?: string;
}

export function ExpiryBadge({ expiresAt, className }: ExpiryBadgeProps) {
  const days = getDaysLeft(expiresAt);

  const colorClass =
    days < 0
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : days <= 2
        ? "bg-destructive/10 text-destructive border-destructive/20"
        : days <= 7
          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
          : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {formatExpiry(expiresAt)}
    </span>
  );
}
