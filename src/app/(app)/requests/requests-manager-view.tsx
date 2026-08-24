"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ItemRequestWithUsers } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ApproveRejectButtons } from "./approve-reject-buttons";
import { ClipboardList } from "lucide-react";
import { formatRelative, formatDate } from "@/lib/date-utils";
import type { Country } from "@/lib/types";

function RequestCard({
  req,
  showActions,
}: {
  req: ItemRequestWithUsers;
  showActions: boolean;
}) {
  const statusColors: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-blue-50 text-blue-700 border-blue-200",
    fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-sm font-medium mt-0.5">{COUNTRY_LABELS[req.country as Country]}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {req.requestedByUser?.name ?? "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">
                  requested {req.type} · {req.country}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}
                >
                  {req.status}
                </span>
              </div>
              {req.reason && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  &ldquo;{req.reason}&rdquo;
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatRelative(req.createdAt)}
                {req.reviewedByUser && (
                  <> · Reviewed by {req.reviewedByUser.name} {req.reviewedAt ? formatRelative(req.reviewedAt) : ""}</>
                )}
              </p>
            </div>
          </div>
          {showActions && req.status === "pending" && (
            <ApproveRejectButtons requestId={req.id} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RequestsManagerView() {
  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["requests", "pending"],
    queryFn: () => api.get<ItemRequestWithUsers[]>("/api/requests?status=pending"),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["requests", "history"],
    queryFn: () => api.get<ItemRequestWithUsers[]>("/api/requests"),
  });

  const nonPending = history?.filter((r) => r.status !== "pending") ?? [];

  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending" className="gap-2">
          Pending
          {(pending?.length ?? 0) > 0 && (
            <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {pending!.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4 space-y-3">
        {pendingLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : !pending?.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No pending requests"
            description="All caught up! New requests will appear here."
          />
        ) : (
          pending.map((req) => (
            <RequestCard key={req.id} req={req} showActions />
          ))
        )}
      </TabsContent>

      <TabsContent value="history" className="mt-4 space-y-3">
        {historyLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : !nonPending.length ? (
          <EmptyState
            icon={ClipboardList}
            title="No request history"
            description="Processed requests will appear here."
          />
        ) : (
          nonPending.map((req) => (
            <RequestCard key={req.id} req={req} showActions={false} />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}
