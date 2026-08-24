"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ItemRequest } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import { formatRelative } from "@/lib/date-utils";
import type { Country } from "@/lib/types";
import { SalesmanPage, SalesmanPageHeader, SectionCard } from "@/components/salesman/ui";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function MyRequestsPage() {
  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => api.get<ItemRequest[]>("/api/requests/my"),
  });

  return (
    <SalesmanPage>
      <SalesmanPageHeader
        title="My Requests"
        description="Track proxy and phone number requests submitted to your manager."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Requests" }]}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !requests?.length ? (
        <SectionCard title="Request history" description="Nothing submitted yet">
          <EmptyState
            icon={ClipboardList}
            title="No requests yet"
            description="Submit requests from My Proxies or My Numbers when you need more resources."
          />
        </SectionCard>
      ) : (
        <SectionCard title="Request history" description={`${requests.length} total`}>
          <ul className="divide-y divide-border/60">
            {requests.map((req) => (
              <li key={req.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold capitalize">
                      {req.type} · {COUNTRY_LABELS[req.country as Country]}
                    </span>
                    <Badge
                      variant="outline"
                      className={`capitalize text-[10px] border ${statusStyles[req.status] ?? ""}`}
                    >
                      {req.status}
                    </Badge>
                  </div>
                  {req.reason && (
                    <p className="text-sm text-muted-foreground">&ldquo;{req.reason}&rdquo;</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatRelative(req.createdAt)}
                    {req.reviewedAt && ` · Reviewed ${formatRelative(req.reviewedAt)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </SalesmanPage>
  );
}
