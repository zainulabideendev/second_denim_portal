import React from "react";
import { COUNTRY_LABELS } from "@/lib/types";
import type { Country } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CountryBadgeProps {
  country: Country;
  /** @deprecated Names are always shown; kept for API compatibility */
  showLabel?: boolean;
  className?: string;
}

export function CountryBadge({ country, className }: CountryBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium text-foreground",
        className
      )}
    >
      {COUNTRY_LABELS[country]}
    </span>
  );
}
