"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, DashboardSummary, ItemRequestWithUsers } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Phone, ClipboardList, AlertTriangle } from "lucide-react";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CountryBadge } from "@/components/ui/country-badge";
import { COUNTRY_LABELS, COUNTRIES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { ApproveRejectButtons } from "../requests/approve-reject-buttons";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/date-utils";
import type { Country } from "@/lib/types";

interface Props {
  user: AppUser;
}

export function ManagerDashboard({ user }: Props) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/api/dashboard/summary"),
  });

  const { data: pendingRequests, isLoading: reqLoading } = useQuery({
    queryKey: ["requests", "pending"],
    queryFn: () => api.get<ItemRequestWithUsers[]>("/api/requests?status=pending"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Full inventory across all markets
        </p>
      </div>

      {/* Pending requests banner */}
      {!reqLoading && (pendingRequests?.length ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-400">
              {pendingRequests!.length} pending request
              {pendingRequests!.length !== 1 ? "s" : ""} need your review
            </span>
          </div>
          <LinkButton href="/requests" size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100">Review requests</LinkButton>
        </div>
      )}

      {/* Inventory by country */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Proxy Inventory
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? COUNTRIES.map((c) => (
                <Card key={c}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            : summary?.proxyStats.map((stat) => (
                <Card key={stat.country} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <CountryBadge country={stat.country as Country} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Available</span>
                      <span className="font-semibold text-emerald-600">{stat.available}</span>
                      <span className="text-muted-foreground">Assigned</span>
                      <span className="font-semibold text-blue-600">{stat.assigned}</span>
                      <span className="text-muted-foreground">Expired</span>
                      <span className="font-semibold text-muted-foreground">{stat.expired}</span>
                      <span className="text-muted-foreground">Flagged</span>
                      <span className="font-semibold text-amber-600">{stat.flagged}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Phone Number Inventory
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? COUNTRIES.map((c) => (
                <Card key={c}>
                  <CardContent className="p-4">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            : summary?.phoneStats.map((stat) => (
                <Card key={stat.country} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <CountryBadge country={stat.country as Country} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Available</span>
                      <span className="font-semibold text-emerald-600">{stat.available}</span>
                      <span className="text-muted-foreground">Assigned</span>
                      <span className="font-semibold text-blue-600">{stat.assigned}</span>
                      <span className="text-muted-foreground">Expired</span>
                      <span className="font-semibold text-muted-foreground">{stat.expired}</span>
                      <span className="text-muted-foreground">Flagged</span>
                      <span className="font-semibold text-amber-600">{stat.flagged}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending requests queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Pending Requests</CardTitle>
            <LinkButton href="/requests" variant="ghost" size="sm" className="text-xs h-7">View all</LinkButton>
          </CardHeader>
          <CardContent className="p-0">
            {reqLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !pendingRequests?.length ? (
              <EmptyState
                icon={ClipboardList}
                title="No pending requests"
                description="All caught up!"
              />
            ) : (
              <div className="divide-y divide-border">
                {pendingRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-medium">{COUNTRY_LABELS[req.country as Country]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {req.requestedByUser?.name ?? "Unknown"} · {req.type} ({req.country})
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {req.reason || "No reason provided"}
                      </p>
                    </div>
                    <ApproveRejectButtons requestId={req.id} compact />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring soon */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Expiring Within 7 Days</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !summary?.expiringSoon.length ? (
              <EmptyState
                icon={Shield}
                title="Nothing expiring soon"
                description="All proxies and numbers are valid for more than 7 days."
              />
            ) : (
              <div className="divide-y divide-border">
                {summary.expiringSoon.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{COUNTRY_LABELS[item.country as Country]}</span>
                      <span className="text-xs font-medium capitalize">{item.type}</span>
                    </div>
                    <ExpiryBadge expiresAt={item.expiresAt} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
