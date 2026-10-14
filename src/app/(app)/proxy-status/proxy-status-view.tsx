"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { api } from "@/lib/api-client";
import type {
  ProxyStatusTotals,
  UserProxyStatusRow,
} from "@/app/api/dashboard/proxy-status/route";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CountryBadge } from "@/components/ui/country-badge";
import {
  Shield,
  AlertTriangle,
  Layers,
  Lock,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Country } from "@/lib/types";

interface ProxyStatusData {
  rows: UserProxyStatusRow[];
  totals: ProxyStatusTotals;
  filters: { from: string | null; to: string | null };
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function daysAgoStr(n: number) {
  return format(subDays(new Date(), n), "yyyy-MM-dd");
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value?: number;
  icon: React.ElementType;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className={cn("text-2xl font-bold mt-0.5", accent)}>{value ?? 0}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CountCell({
  value,
  accent,
}: {
  value: number;
  accent?: string;
}) {
  if (value === 0) {
    return <span className="text-muted-foreground/50 tabular-nums">0</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums", accent)}>{value}</span>
  );
}

export function ProxyStatusView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryKey = useMemo(
    () => ["proxy-status", appliedFrom, appliedTo] as const,
    [appliedFrom, appliedTo]
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (appliedFrom) params.set("from", appliedFrom);
      if (appliedTo) params.set("to", appliedTo);
      const qs = params.toString();
      return api.get<ProxyStatusData>(
        `/api/dashboard/proxy-status${qs ? `?${qs}` : ""}`
      );
    },
  });

  function applyFilters() {
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setAppliedFrom("");
    setAppliedTo("");
  }

  function preset(days: number | "all") {
    if (days === "all") {
      clearFilters();
      return;
    }
    const nextFrom = daysAgoStr(days);
    const nextTo = todayStr();
    setFrom(nextFrom);
    setTo(nextTo);
    setAppliedFrom(nextFrom);
    setAppliedTo(nextTo);
  }

  function toggleExpand(uid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
    );
  }, [data?.rows, search]);

  const totals = data?.totals;
  const loading = isLoading || isFetching;
  const hasDateFilter = Boolean(appliedFrom || appliedTo);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="border-border">
        <CardContent className="pt-5 pb-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="status-from" className="text-xs">
                Assigned from
              </Label>
              <Input
                id="status-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status-to" className="text-xs">
                Assigned to
              </Label>
              <Input
                id="status-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <Button onClick={applyFilters} disabled={loading}>
              <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
              Apply
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Clear
            </Button>
            <div className="flex flex-wrap gap-1.5 sm:ml-auto">
              <Button variant="outline" size="sm" onClick={() => preset("all")}>
                All time
              </Button>
              <Button variant="outline" size="sm" onClick={() => preset(0)}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => preset(7)}>
                Last 7 days
              </Button>
              <Button variant="outline" size="sm" onClick={() => preset(30)}>
                Last 30 days
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasDateFilter
              ? `Showing proxies assigned${appliedFrom ? ` from ${appliedFrom}` : ""}${appliedTo ? ` to ${appliedTo}` : ""}.`
              : "Showing all currently assigned / banned / expired proxies linked to each salesman."}
          </p>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Active" value={totals?.active} icon={Shield} loading={loading} accent="text-emerald-700" />
        <StatCard label="Backup" value={totals?.backup} icon={Layers} loading={loading} accent="text-blue-700" />
        <StatCard label="Restricted" value={totals?.restricted} icon={Lock} loading={loading} accent="text-amber-700" />
        <StatCard label="Banned" value={totals?.banned} icon={AlertTriangle} loading={loading} accent="text-orange-700" />
        <StatCard label="Expired" value={totals?.expired} icon={Clock} loading={loading} />
        <StatCard label="Total linked" value={totals?.total} icon={Shield} loading={loading} />
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="pt-4 pb-2 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <p className="text-sm font-medium">
              Salesmen{" "}
              <span className="text-muted-foreground font-normal">
                ({rows.length})
              </span>
            </p>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No proxy data"
              description={
                hasDateFilter
                  ? "No proxies were assigned to salesmen in this date range."
                  : "No salesmen have assigned proxies yet."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Salesman</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Backup</TableHead>
                    <TableHead className="text-right">Restricted</TableHead>
                    <TableHead className="text-right">Banned</TableHead>
                    <TableHead className="text-right">Expired</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const open = expanded.has(row.uid);
                    return (
                      <React.Fragment key={row.uid}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggleExpand(row.uid)}
                        >
                          <TableCell className="pr-0">
                            {row.byCountry.length > 0 ? (
                              open ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )
                            ) : (
                              <span className="inline-block w-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{row.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {row.email}
                                </p>
                              </div>
                              {row.status === "disabled" && (
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.active} accent="text-emerald-700" />
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.backup} accent="text-blue-700" />
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.restricted} accent="text-amber-700" />
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.banned} accent="text-orange-700" />
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.expired} />
                          </TableCell>
                          <TableCell className="text-right">
                            <CountCell value={row.total} />
                          </TableCell>
                        </TableRow>
                        {open && row.byCountry.length > 0 && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={8} className="py-3">
                              <div className="flex flex-wrap gap-2 pl-6">
                                {row.byCountry.map((c) => (
                                  <div
                                    key={c.country}
                                    className="rounded-lg border border-border bg-background px-3 py-2 text-xs space-y-1.5 min-w-[140px]"
                                  >
                                    <CountryBadge country={c.country as Country} />
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                                      <span>Active</span>
                                      <span className="text-right tabular-nums text-emerald-700 font-medium">
                                        {c.active}
                                      </span>
                                      <span>Backup</span>
                                      <span className="text-right tabular-nums text-blue-700 font-medium">
                                        {c.backup}
                                      </span>
                                      <span>Restricted</span>
                                      <span className="text-right tabular-nums text-amber-700 font-medium">
                                        {c.restricted}
                                      </span>
                                      <span>Banned</span>
                                      <span className="text-right tabular-nums text-orange-700 font-medium">
                                        {c.banned}
                                      </span>
                                      {c.expired > 0 && (
                                        <>
                                          <span>Expired</span>
                                          <span className="text-right tabular-nums font-medium">
                                            {c.expired}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
