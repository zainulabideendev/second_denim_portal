"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Live countdown for 24 hours after an account creation number was linked.
 */
export function AcnLinkTimer({
  linkedAt,
  className,
}: {
  linkedAt: string | null | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!linkedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [linkedAt]);

  if (!linkedAt) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const end = new Date(linkedAt).getTime() + TWENTY_FOUR_HOURS_MS;
  const remaining = end - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining < 2 * 60 * 60 * 1000;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums",
        expired
          ? "border-red-200 bg-red-50 text-red-700"
          : urgent
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-blue-200 bg-blue-50 text-blue-700",
        className
      )}
      title={
        expired
          ? "24h window ended"
          : `Linked ${new Date(linkedAt).toLocaleString()} — 24h window`
      }
    >
      {formatRemaining(remaining)}
    </span>
  );
}
