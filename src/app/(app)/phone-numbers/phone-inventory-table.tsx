"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PhoneNumber, AppUser } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CountryBadge } from "@/components/ui/country-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Phone, MoreHorizontal, Search, Plus, Shield } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BulkImportButton } from "@/components/bulk-import-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";
import { AssignDialog } from "../proxies/assign-dialog";
import { PhoneDetailSheet } from "@/components/inventory-detail-sheet";
import { AddPhoneDrawer } from "./add-phone-drawer";
import { phoneStatusMatchesTab } from "@/lib/phone-utils";
import type { Country } from "@/lib/types";

type StatusTab =
  | "all"
  | "available"
  | "active"
  | "inactive"
  | "banned"
  | "banned_with_balance"
  | "expired"
  | "retired";

const STATUS_TABS: { key: StatusTab; label: string; color?: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available", color: "text-emerald-600" },
  { key: "active", label: "Active", color: "text-blue-600" },
  { key: "inactive", label: "Inactive", color: "text-amber-600" },
  { key: "expired", label: "Expired", color: "text-destructive" },
  { key: "retired", label: "Retired", color: "text-muted-foreground" },
];

export function PhoneInventoryTable({ defaultUser }: { defaultUser?: string }) {
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [userFilter, setUserFilter] = useState(defaultUser ?? "all");
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [assignTarget, setAssignTarget] = useState<PhoneNumber | null>(null);
  const [detailTarget, setDetailTarget] = useState<PhoneNumber | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: phones, isLoading } = useQuery({
    queryKey: ["phones", countryFilter, userFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryFilter !== "all") params.set("country", countryFilter);
      if (userFilter !== "all") params.set("assignedTo", userFilter);
      return api.get<PhoneNumber[]>(`/api/phone-numbers?${params}`);
    },
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
  });

  const userMap = useMemo(() => new Map(users?.map((u) => [u.uid, u])), [users]);
  const salesmen = users?.filter((u) => u.status === "active") ?? [];

  const revokeMutation = useMutation({
    mutationFn: ({ id, retire }: { id: string; retire: boolean }) =>
      api.post(`/api/phone-numbers/${id}/revoke`, { retire }),
    onSuccess: (_, { retire }) => {
      toast.success(retire ? "Number retired" : "Number revoked (back to available)");
      queryClient.invalidateQueries({ queryKey: ["phones"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const counts = useMemo(() => {
    if (!phones) return {} as Record<StatusTab, number>;
    return {
      all: phones.length,
      available: phones.filter((p) => p.status === "available").length,
      active: phones.filter((p) => phoneStatusMatchesTab(p.status, "active")).length,
      inactive: phones.filter((p) => phoneStatusMatchesTab(p.status, "inactive")).length,
      banned: phones.filter((p) => phoneStatusMatchesTab(p.status, "banned")).length,
      banned_with_balance: phones.filter((p) =>
        phoneStatusMatchesTab(p.status, "banned_with_balance")
      ).length,
      expired: phones.filter((p) => p.status === "expired").length,
      retired: phones.filter((p) => p.status === "retired").length,
    } as Record<StatusTab, number>;
  }, [phones]);

  const filtered = useMemo(() => {
    if (!phones) return [];
    let list = phones;
    if (activeTab === "active" || activeTab === "inactive" || activeTab === "banned" || activeTab === "banned_with_balance") {
      list = list.filter((p) => phoneStatusMatchesTab(p.status, activeTab));
    } else if (activeTab !== "all") {
      list = list.filter((p) => p.status === activeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.number.includes(q) ||
          p.provider.toLowerCase().includes(q) ||
          userMap.get(p.assignedTo ?? "")?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [phones, activeTab, search, userMap]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add phone number
        </Button>
        <BulkImportButton type="phone" />
      </div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search number, provider, user…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={userFilter} onValueChange={(v) => setUserFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by user" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {salesmen.map((u) => (
              <SelectItem key={u.uid} value={u.uid}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={(v) => setCountryFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>{COUNTRY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.key] ?? 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
              )}
            >
              <span className={isActive ? undefined : tab.color}>{tab.label}</span>
              {count > 0 && (
                <span className={cn("rounded-full px-1.5 py-0 text-[10px] font-bold",
                  isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Country</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Number Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !filtered.length ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center">
                  <EmptyState
                    icon={Phone}
                    title={activeTab === "all" ? "No numbers found" : `No ${activeTab} numbers`}
                    description="Try a different filter or import new numbers."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((phone) => {
                const assignedUser = userMap.get(phone.assignedTo ?? "");
                return (
                  <TableRow key={phone.id} className="group">
                    <TableCell>
                      <CountryBadge country={phone.country as Country} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-medium">{phone.number}</span>
                        <CopyButton value={phone.number} />
                      </div>
                      {phone.proxy && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono mt-0.5">
                          <Shield className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{phone.proxy.host}:{phone.proxy.port}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{phone.numberType ?? "temporary"}</TableCell>
                    <TableCell><StatusBadge status={phone.status} /></TableCell>
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
                    <TableCell className="text-xs text-muted-foreground">{formatDate(phone.purchasedAt)}</TableCell>
                    <TableCell><ExpiryBadge expiresAt={phone.expiresAt} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 opacity-0 group-hover:opacity-100")}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailTarget(phone)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setAssignTarget(phone)}>Assign to user</DropdownMenuItem>
                          {phone.assignedTo && (
                            <DropdownMenuItem onClick={() => revokeMutation.mutate({ id: phone.id, retire: false })}>
                              Revoke (back to available)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => revokeMutation.mutate({ id: phone.id, retire: true })}>
                            Retire number
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

      {phones && (
        <p className="text-xs text-muted-foreground">Showing {filtered.length} of {phones.length} numbers</p>
      )}

      <AssignDialog
        item={assignTarget}
        type="phone"
        users={salesmen}
        onClose={() => {
          setAssignTarget(null);
          queryClient.invalidateQueries({ queryKey: ["phones"] });
          queryClient.invalidateQueries({ queryKey: ["users-summary"] });
        }}
      />

      <PhoneDetailSheet
        phone={detailTarget}
        user={detailTarget ? userMap.get(detailTarget.assignedTo ?? "") : undefined}
        onClose={() => setDetailTarget(null)}
      />

      <AddPhoneDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
