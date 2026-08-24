"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PoolResponse } from "@/app/api/proxies/mine/route";
import type { AppUser, DashboardSummary, Proxy, PhoneNumber, ItemRequest } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Shield, Phone, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { formatRelative } from "@/lib/date-utils";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import type { Country } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import {
  SalesmanPage,
  SalesmanPageHeader,
  MetricStrip,
  SectionCard,
  QuickLinkCard,
} from "@/components/salesman/ui";

interface Props {
  user: AppUser;
}

export function SalesmanDashboard({ user }: Props) {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/api/dashboard/summary"),
  });

  const { data: poolData, isLoading: proxiesLoading } = useQuery({
    queryKey: ["my-proxies"],
    queryFn: () => api.get<PoolResponse>("/api/proxies/mine"),
  });

  const { data: phones, isLoading: phonesLoading } = useQuery({
    queryKey: ["my-phones"],
    queryFn: () => api.get<PhoneNumber[]>("/api/phone-numbers/mine"),
  });

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => api.get<ItemRequest[]>("/api/requests/my"),
  });

  const proxies: Proxy[] = poolData
    ? poolData.poolCountries.flatMap((country) => {
        const pool = poolData.pools[country];
        if (!pool) return [];
        return [...pool.backup, ...pool.active];
      })
    : [];

  const pendingRequests = requests?.filter((r) => r.status === "pending") ?? [];
  const firstName = user.name.split(" ")[0];

  return (
    <SalesmanPage>
      <SalesmanPageHeader
        title={`Good to see you, ${firstName}`}
        description="Your workspace for proxies, phone numbers, and requests."
      />

      <MetricStrip
        items={[
          {
            label: "Proxies",
            value: summaryLoading ? "—" : (summary?.myActiveProxies ?? 0),
            hint: `Limit ${user.activeProxyLimit}`,
            variant: "success",
          },
          {
            label: "Numbers",
            value: summaryLoading ? "—" : (summary?.myActivePhones ?? 0),
            hint: "Assigned",
            variant: "default",
          },
          {
            label: "Pending",
            value: summaryLoading ? "—" : (summary?.myPendingRequests ?? 0),
            hint: "Requests",
            variant: "warning",
          },
          {
            label: "Expiring",
            value: summaryLoading ? "—" : (summary?.myExpiringSoon ?? 0),
            hint: "Within 7 days",
            variant: "danger",
          },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLinkCard
          href="/proxies/my"
          icon={Shield}
          title="Manage proxies"
          description="Set up backups, promote to active, restrict or report bans"
        />
        <QuickLinkCard
          href="/phone-numbers/my"
          icon={Phone}
          title="My numbers"
          description="View assigned numbers and flag issues"
        />
        <QuickLinkCard
          href="/requests/my"
          icon={Clock}
          title="My requests"
          description="Track proxy and phone number requests"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent proxies"
          badge={
            <Link href="/proxies/my" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {proxiesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : !proxies.length ? (
            <EmptyState icon={Shield} title="No proxies yet" description="Go to My Proxies to get started." />
          ) : (
            <ul className="divide-y divide-border/60">
              {proxies.slice(0, 5).map((proxy) => (
                <li key={proxy.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{COUNTRY_LABELS[proxy.country as Country]}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{proxy.host}:{proxy.port}</p>
                  </div>
                  <ExpiryBadge expiresAt={proxy.expiresAt} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent numbers"
          badge={
            <Link href="/phone-numbers/my" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {phonesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : !phones?.length ? (
            <EmptyState icon={Phone} title="No numbers yet" description="Numbers will appear here once assigned." />
          ) : (
            <ul className="divide-y divide-border/60">
              {phones.slice(0, 5).map((phone) => (
                <li key={phone.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{COUNTRY_LABELS[phone.country as Country]}</p>
                    <p className="text-xs font-mono text-muted-foreground">{phone.number}</p>
                  </div>
                  <ExpiryBadge expiresAt={phone.expiresAt} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {(requestsLoading || (requests && requests.length > 0)) && (
        <SectionCard title="Recent requests">
          {requestsLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <ul className="divide-y divide-border/60">
              {requests!.slice(0, 4).map((req) => (
                <li key={req.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium capitalize">{req.type} · {req.country}</p>
                    <p className="text-xs text-muted-foreground">{formatRelative(req.createdAt)}</p>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">{req.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {pendingRequests.length > 0 && (
            <p className="text-xs text-amber-700 mt-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pendingRequests.length} request(s) awaiting approval
            </p>
          )}
        </SectionCard>
      )}
    </SalesmanPage>
  );
}
