"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy, AppUser } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CountryBadge } from "@/components/ui/country-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, MoreHorizontal, Search, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncEmailDialog } from "@/components/sync-dialogs";
import type { Email } from "@/lib/types";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";
import { AssignDialog } from "./assign-dialog";
import { BulkImportButton } from "@/components/bulk-import-dialog";
import { AutoSyncButton } from "@/components/auto-sync-button";
import { FetchProxiesButton } from "@/components/fetch-proxies-button";
import { AddProxyButton } from "@/components/add-proxy-sheet";
import { ProxyDetailSheet } from "@/components/inventory-detail-sheet";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { Country, ProxyLane } from "@/lib/types";
import { normalizeLane } from "@/lib/pool-utils";
import {
  TablePagination,
  TableFilterSelect,
  usePagination,
} from "@/components/ui/table-pagination";

const LANE_BADGES: Record<ProxyLane, { label: string; className: string }> = {
  backup: { label: "Backup", className: "bg-blue-50 text-blue-700 border-blue-200" },
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "fresh", label: "Fresh" },
  { value: "available", label: "Available" },
  { value: "assigned", label: "Active" },
  { value: "flagged", label: "Banned / Flagged" },
  { value: "expired", label: "Expired" },
  { value: "retired", label: "Retired" },
];

const LANE_OPTIONS = [
  { value: "all", label: "All lanes" },
  { value: "backup", label: "Backup" },
  { value: "active", label: "Active" },
  { value: "none", label: "Unassigned" },
];

const SYNC_OPTIONS = [
  { value: "all", label: "All sync" },
  { value: "synced", label: "Synced" },
  { value: "unsynced", label: "Not synced" },
];

export function ProxyInventoryTable({ defaultUser }: { defaultUser?: string }) {
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [userFilter, setUserFilter] = useState(defaultUser ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [laneFilter, setLaneFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [assignTarget, setAssignTarget] = useState<Proxy | null>(null);
  const [syncTarget, setSyncTarget] = useState<Proxy | null>(null);
  const [detailTarget, setDetailTarget] = useState<Proxy | null>(null);
  const queryClient = useQueryClient();

  const { data: proxies, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => api.get<Proxy[]>("/api/proxies"),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
  });

  const { data: emails } = useQuery({
    queryKey: ["emails"],
    queryFn: () => api.get<Email[]>("/api/emails"),
  });

  const userMap = useMemo(
    () => new Map(users?.map((u) => [u.uid, u])),
    [users]
  );

  const salesmen = users?.filter((u) => u.status === "active") ?? [];

  const userOptions = useMemo(
    () => [
      { value: "all", label: "All users" },
      { value: "unassigned", label: "Unassigned" },
      ...salesmen.map((u) => ({ value: u.uid, label: u.name })),
    ],
    [salesmen]
  );

  const countryOptions = useMemo(
    () => [
      { value: "all", label: "All countries" },
      ...COUNTRIES.map((c) => ({ value: c, label: COUNTRY_LABELS[c] })),
    ],
    []
  );

  const revokeMutation = useMutation({
    mutationFn: ({ id, retire }: { id: string; retire: boolean }) =>
      api.post(`/api/proxies/${id}/revoke`, { retire }),
    onSuccess: (_, { retire }) => {
      toast.success(retire ? "Proxy retired" : "Proxy revoked — back to available");
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!proxies) return [];
    let list = proxies;

    if (countryFilter !== "all") {
      list = list.filter((p) => p.country === countryFilter);
    }
    if (userFilter === "unassigned") {
      list = list.filter((p) => !p.assignedTo);
    } else if (userFilter !== "all") {
      list = list.filter((p) => p.assignedTo === userFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (laneFilter === "none") {
      list = list.filter((p) => !p.lane);
    } else if (laneFilter !== "all") {
      list = list.filter((p) => normalizeLane(p.lane) === laneFilter);
    }
    if (syncFilter === "synced") {
      list = list.filter((p) => !!p.syncedEmailId);
    } else if (syncFilter === "unsynced") {
      list = list.filter((p) => !p.syncedEmailId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.host.includes(q) ||
          p.provider.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q) ||
          p.syncedEmail?.email?.toLowerCase().includes(q) ||
          userMap.get(p.assignedTo ?? "")?.name?.toLowerCase().includes(q) ||
          userMap.get(p.assignedTo ?? "")?.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [proxies, countryFilter, userFilter, statusFilter, laneFilter, syncFilter, search, userMap]);

  const { paginated, total, safePage } = usePagination(filtered, pageSize, page);

  useEffect(() => {
    if (defaultUser) setUserFilter(defaultUser);
  }, [defaultUser]);

  useEffect(() => {
    setPage(1);
  }, [search, countryFilter, userFilter, statusFilter, laneFilter, syncFilter, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function clearFilters() {
    setSearch("");
    setCountryFilter("all");
    setUserFilter("all");
    setStatusFilter("all");
    setLaneFilter("all");
    setSyncFilter("all");
    setPage(1);
  }

  const hasActiveFilters =
    search ||
    countryFilter !== "all" ||
    userFilter !== "all" ||
    statusFilter !== "all" ||
    laneFilter !== "all" ||
    syncFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search host, provider, username, user…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
          <FetchProxiesButton />
          <AutoSyncButton />
          <AddProxyButton />
          <BulkImportButton type="proxy" />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Country</TableHead>
              <TableHead>Host : Port</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lane</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Email Sync</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="py-2">
                <TableFilterSelect
                  value={countryFilter}
                  onValueChange={setCountryFilter}
                  placeholder="Country"
                  options={countryOptions}
                />
              </TableHead>
              <TableHead colSpan={2} />
              <TableHead className="py-2">
                <TableFilterSelect
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  placeholder="Status"
                  options={STATUS_OPTIONS}
                />
              </TableHead>
              <TableHead className="py-2">
                <TableFilterSelect
                  value={laneFilter}
                  onValueChange={setLaneFilter}
                  placeholder="Lane"
                  options={LANE_OPTIONS}
                />
              </TableHead>
              <TableHead className="py-2">
                <TableFilterSelect
                  value={userFilter}
                  onValueChange={setUserFilter}
                  placeholder="User"
                  options={userOptions}
                />
              </TableHead>
              <TableHead className="py-2">
                <TableFilterSelect
                  value={syncFilter}
                  onValueChange={setSyncFilter}
                  placeholder="Email sync"
                  options={SYNC_OPTIONS}
                />
              </TableHead>
              <TableHead colSpan={3} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={10} className="h-48 text-center">
                  <EmptyState
                    icon={Shield}
                    title="Failed to load proxies"
                    description={error?.message ?? "Something went wrong. Try refreshing the page."}
                    action={
                      <Button variant="outline" size="sm" onClick={() => refetch()}>
                        Retry
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : !paginated.length ? (
              <TableRow>
                <TableCell colSpan={10} className="h-48 text-center">
                  <EmptyState
                    icon={Shield}
                    title="No proxies found"
                    description={
                      hasActiveFilters && (proxies?.length ?? 0) > 0
                        ? "No proxies match your filters. Clear filters to see all inventory."
                        : "Try different filters or import new proxies."
                    }
                    action={
                      hasActiveFilters ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((proxy) => {
                const assignedUser = userMap.get(proxy.assignedTo ?? "");
                const laneBadge = proxy.lane ? LANE_BADGES[normalizeLane(proxy.lane)] : null;
                return (
                  <TableRow key={proxy.id} className="group">
                    <TableCell>
                      <CountryBadge country={proxy.country as Country} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-medium">
                          {proxy.host}:{proxy.port}
                        </span>
                        <CopyButton
                          value={`${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`}
                        />
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {proxy.username}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {proxy.provider}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={proxy.status} />
                    </TableCell>
                    <TableCell>
                      {laneBadge ? (
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", laneBadge.className)}>
                          {laneBadge.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {assignedUser ? (
                        <div>
                          <p className="font-medium">{assignedUser.name}</p>
                          <p className="text-muted-foreground text-[11px]">{assignedUser.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        {proxy.syncedEmailId && proxy.syncedEmail ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <Link2 className="h-3 w-3" />
                            Synced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <Link2Off className="h-3 w-3" />
                            Not synced
                          </span>
                        )}
                        {proxy.syncedEmail && (
                          <p className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                            {proxy.syncedEmail.email}
                          </p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => setSyncTarget(proxy)}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          {proxy.syncedEmailId ? "Change" : "Sync email"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(proxy.purchasedAt)}
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge expiresAt={proxy.expiresAt} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-7 w-7 opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailTarget(proxy)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setAssignTarget(proxy)}>
                            Assign to user
                          </DropdownMenuItem>
                          {proxy.assignedTo && (
                            <DropdownMenuItem
                              onClick={() =>
                                revokeMutation.mutate({ id: proxy.id, retire: false })
                              }
                            >
                              Revoke (back to available)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() =>
                              revokeMutation.mutate({ id: proxy.id, retire: true })
                            }
                          >
                            Retire proxy
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={safePage}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <AssignDialog
        item={assignTarget}
        type="proxy"
        users={salesmen}
        onClose={() => {
          setAssignTarget(null);
          queryClient.invalidateQueries({ queryKey: ["proxies"] });
          queryClient.invalidateQueries({ queryKey: ["users-summary"] });
        }}
      />

      <SyncEmailDialog
        proxy={syncTarget}
        emails={emails ?? []}
        onClose={() => setSyncTarget(null)}
      />

      <ProxyDetailSheet
        proxy={detailTarget}
        user={detailTarget ? userMap.get(detailTarget.assignedTo ?? "") : undefined}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}
