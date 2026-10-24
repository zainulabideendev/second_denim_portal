"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import type { SmsPvaOrder } from "@/lib/sms-pva-orders";
import { COUNTRY_LABELS } from "@/lib/types";
import { SalesmanPage, SalesmanPageHeader, SectionCard } from "@/components/salesman/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/date-utils";

const statusStyles: Record<string, string> = {
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

type StatsPayload = {
  days: number;
  totals: {
    asked: number;
    successful: number;
    notReceived: number;
    failed: number;
    waiting: number;
  };
  byDate: Array<{
    date: string;
    asked: number;
    successful: number;
    notReceived: number;
    failed: number;
  }>;
  recent: SmsPvaOrder[];
  balance: number | null;
  balanceError: string | null;
};

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setLeft(
        Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      );
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className="tabular-nums">
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

function OrderCard({
  order,
  onCancel,
  cancelling,
}: {
  order: SmsPvaOrder;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {order.serviceName}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {COUNTRY_LABELS[order.country]} · Vodafone
          </Badge>
          <Badge
            variant="outline"
            className={cn("capitalize text-[10px] border", statusStyles[order.status])}
          >
            {order.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatRelative(order.createdAt)}
        </p>
      </div>

      {order.phoneNumber && (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-lg font-semibold tracking-wide">
            {order.phoneNumber}
          </span>
          <CopyButton value={order.phoneNumber} />
        </div>
      )}

      {order.status === "waiting" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Waiting for Vinted SMS…{" "}
            <Countdown expiresAt={order.expiresAt} /> left
          </span>
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8"
              disabled={cancelling}
              onClick={onCancel}
            >
              {cancelling ? "Cancelling…" : "Cancel number"}
            </Button>
          )}
        </div>
      )}

      {order.status === "received" && order.smsCode && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-3">
          <p className="text-xs font-medium text-emerald-800 mb-1">Verification code</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold tracking-[0.2em] text-emerald-900">
              {order.smsCode}
            </span>
            <CopyButton value={order.smsCode} />
          </div>
        </div>
      )}

      {(order.status === "expired" ||
        order.status === "cancelled" ||
        order.status === "failed") &&
        order.errorMessage && (
          <p className="text-sm text-rose-700">{order.errorMessage}</p>
        )}
    </div>
  );
}

export function GetNumberView() {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === "admin";
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["sms-pva", "mine"],
    queryFn: () => api.get<SmsPvaOrder[]>("/api/sms-pva/mine?limit=40"),
  });

  const activeOrder = useMemo(() => {
    const list = historyQuery.data ?? [];
    if (activeId) {
      const found = list.find((o) => o.id === activeId);
      if (found) return found;
    }
    return list.find((o) => o.status === "waiting") ?? null;
  }, [historyQuery.data, activeId]);

  const pollId = activeOrder?.status === "waiting" ? activeOrder.id : null;

  const pollQuery = useQuery({
    queryKey: ["sms-pva", "order", pollId],
    queryFn: () => api.get<SmsPvaOrder>(`/api/sms-pva/${pollId}`),
    enabled: !!pollId,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d || d.status === "waiting") return 20_000;
      return false;
    },
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!pollQuery.data) return;
    qc.setQueryData<SmsPvaOrder[]>(["sms-pva", "mine"], (prev) => {
      if (!prev) return [pollQuery.data!];
      return prev.map((o) => (o.id === pollQuery.data!.id ? pollQuery.data! : o));
    });
    if (pollQuery.data.status === "received") {
      toast.success("SMS code received");
      qc.invalidateQueries({ queryKey: ["sms-pva", "stats"] });
    } else if (pollQuery.data.status === "expired") {
      toast.error("No SMS received — number expired");
      qc.invalidateQueries({ queryKey: ["sms-pva", "stats"] });
    }
  }, [pollQuery.data, qc]);

  const statsQuery = useQuery({
    queryKey: ["sms-pva", "stats"],
    queryFn: () => api.get<StatsPayload>("/api/sms-pva/stats?days=30"),
    enabled: isAdmin,
  });

  const requestMutation = useMutation({
    mutationFn: () => api.post<SmsPvaOrder>("/api/sms-pva/request", {}),
    onSuccess: (order) => {
      setActiveId(order.id);
      toast.success("Number ready — enter it on Vinted and wait for the code");
      qc.invalidateQueries({ queryKey: ["sms-pva", "mine"] });
      qc.invalidateQueries({ queryKey: ["sms-pva", "stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<SmsPvaOrder>(`/api/sms-pva/${id}/cancel`, {}),
    onSuccess: () => {
      toast.message("Number cancelled");
      setActiveId(null);
      qc.invalidateQueries({ queryKey: ["sms-pva", "mine"] });
      qc.invalidateQueries({ queryKey: ["sms-pva", "stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const displayOrder =
    pollQuery.data && pollQuery.data.id === activeOrder?.id
      ? pollQuery.data
      : activeOrder;

  const history = (historyQuery.data ?? []).filter(
    (o) => !displayOrder || o.id !== displayOrder.id
  );

  return (
    <SalesmanPage>
      <SalesmanPageHeader
        title="Get number"
        description="Second Chance number service — request a UK Vodafone number for Vinted, then wait for the verification code here."
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Get number" },
        ]}
      />

      {isAdmin && (
        <SectionCard
          title="Number service stats (last 30 days)"
          description={
            statsQuery.data?.balance != null
              ? `Service credit: $${Number(statsQuery.data.balance).toFixed(2)}`
              : statsQuery.data?.balanceError
                ? statsQuery.data.balanceError
                : "Usage across the portal"
          }
        >
          {statsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : statsQuery.data ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label="Codes asked"
                  value={statsQuery.data.totals.asked}
                  icon={MessageSquare}
                />
                <StatTile
                  label="Successful"
                  value={statsQuery.data.totals.successful}
                  icon={CheckCircle2}
                  accent="text-emerald-700"
                />
                <StatTile
                  label="Code not received"
                  value={statsQuery.data.totals.notReceived}
                  icon={XCircle}
                  accent="text-rose-700"
                />
                <StatTile
                  label="Failed / waiting"
                  value={
                    statsQuery.data.totals.failed + statsQuery.data.totals.waiting
                  }
                  icon={Ban}
                  accent="text-amber-700"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Asked</th>
                      <th className="px-3 py-2 font-medium">Successful</th>
                      <th className="px-3 py-2 font-medium">Not received</th>
                      <th className="px-3 py-2 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {statsQuery.data.byDate.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          No number requests in this period yet.
                        </td>
                      </tr>
                    ) : (
                      statsQuery.data.byDate.map((d) => (
                        <tr key={d.date}>
                          <td className="px-3 py-2 tabular-nums">{d.date}</td>
                          <td className="px-3 py-2 tabular-nums">{d.asked}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-700">
                            {d.successful}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-rose-700">
                            {d.notReceived}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{d.failed}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-rose-700">
              {(statsQuery.error as Error)?.message ?? "Could not load stats."}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Request a number"
        description="Second Chance provides a UK Vodafone number for Vinted verification. Paste it into Vinted, then wait for the code here (up to ~10 minutes)."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 w-full sm:w-40">
            <label className="text-xs font-medium text-muted-foreground">
              Country
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
              United Kingdom
            </div>
          </div>
          <div className="space-y-1.5 w-full sm:w-40">
            <label className="text-xs font-medium text-muted-foreground">
              Network
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
              Vodafone
            </div>
          </div>
          <div className="space-y-1.5 w-full sm:w-40">
            <label className="text-xs font-medium text-muted-foreground">
              For
            </label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
              Vinted
            </div>
          </div>
          <Button
            className="sm:mb-0.5"
            disabled={
              requestMutation.isPending ||
              (!!displayOrder && displayOrder.status === "waiting")
            }
            onClick={() => requestMutation.mutate()}
          >
            {requestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Requesting…
              </>
            ) : (
              "Get number"
            )}
          </Button>
        </div>
      </SectionCard>

      {displayOrder && (
        <SectionCard
          title="Active number"
          description="Copy the number into Vinted, then copy the code when it arrives."
        >
          <OrderCard
            order={displayOrder}
            cancelling={cancelMutation.isPending}
            onCancel={
              displayOrder.status === "waiting"
                ? () => cancelMutation.mutate(displayOrder.id)
                : undefined
            }
          />
        </SectionCard>
      )}

      <SectionCard
        title="Your history"
        description="Recent number requests on your account"
      >
        {historyQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : history.length === 0 && !displayOrder ? (
          <EmptyState
            icon={Clock}
            title="No numbers requested yet"
            description="Use Get number above when you need a Vinted verification code."
          />
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No older requests.</p>
        ) : (
          <ul className="space-y-3">
            {history.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </SalesmanPage>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        {label}
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums", accent)}>{value}</p>
    </div>
  );
}
