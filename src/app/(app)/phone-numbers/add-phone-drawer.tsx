"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import type { AppUser, Country, PhoneAccountStatus, PhoneNumber, Proxy, PhoneNumberType } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import type { PoolResponse } from "@/app/api/proxies/mine/route";
import {
  PHONE_ACCOUNT_STATUSES,
  PHONE_ACCOUNT_STATUS_LABELS,
} from "@/lib/phone-utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Shield } from "lucide-react";

interface AddPhoneDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultProxyId?: string;
  isSalesman?: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function oneMonthFromTodayIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function AddPhoneDrawer({
  open,
  onClose,
  defaultProxyId,
  isSalesman: isSalesmanProp,
}: AddPhoneDrawerProps) {
  const queryClient = useQueryClient();
  const { appUser } = useAuth();
  const isSalesman = isSalesmanProp ?? (appUser?.role === "salesman");

  const [assignedTo, setAssignedTo] = useState("");
  const [proxyId, setProxyId] = useState(defaultProxyId ?? "");
  const [status, setStatus] = useState<PhoneAccountStatus>("active");
  const [numberType, setNumberType] = useState<PhoneNumberType>("temporary");
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [provider, setProvider] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIso);
  const [expiresAt, setExpiresAt] = useState(oneMonthFromTodayIso);
  const [notes, setNotes] = useState("");

  // Admin/manager users list
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
    enabled: open && !isSalesman,
  });

  const assignableUsers = useMemo(
    () => users?.filter((u) => u.status === "active" && u.role !== "admin") ?? [],
    [users]
  );

  // Salesman's own proxies
  const { data: poolData, isLoading: isLoadingSalesmanProxies } = useQuery({
    queryKey: ["my-proxies"],
    queryFn: () => api.get<PoolResponse>("/api/proxies/mine"),
    enabled: open && isSalesman,
  });

  const [proxySearch, setProxySearch] = useState("");
  const [proxyDropdownOpen, setProxyDropdownOpen] = useState(false);

  const salesmanProxies: Proxy[] = useMemo(() => {
    if (!poolData?.pools) return [];
    return Object.values(poolData.pools).flatMap((lane) => [
      ...(lane?.backup ?? []),
      ...(lane?.active ?? []),
    ]);
  }, [poolData]);

  // Filtered proxies for salesman using proxySearch
  const filteredSalesmanProxies = useMemo(() => {
    if (!proxySearch) return salesmanProxies;
    const term = proxySearch.toLowerCase();
    return salesmanProxies.filter((p) => {
      const hostPort = `${p.host}:${p.port}`.toLowerCase();
      const vinted = p.vintedUsername ? p.vintedUsername.toLowerCase() : "";
      return hostPort.includes(term) || vinted.includes(term);
    });
  }, [proxySearch, salesmanProxies]);

  // Admin/manager user's proxies (must be declared before filteredAdminProxies)
  const { data: adminUserProxies } = useQuery({
    queryKey: ["proxies", "user", assignedTo],
    queryFn: () => api.get<Proxy[]>(`/api/proxies?assignedTo=${assignedTo}`),
    enabled: open && !isSalesman && !!assignedTo,
  });

  // Filtered proxies for admin using proxySearch
  const filteredAdminProxies = useMemo(() => {
    if (!adminUserProxies) return [];
    if (!proxySearch) return adminUserProxies;
    const term = proxySearch.toLowerCase();
    return adminUserProxies.filter((p) => {
      const hostPort = `${p.host}:${p.port}`.toLowerCase();
      const vinted = p.vintedUsername ? p.vintedUsername.toLowerCase() : "";
      return hostPort.includes(term) || vinted.includes(term);
    });
  }, [proxySearch, adminUserProxies]);


  useEffect(() => {
    if (open) {
      if (defaultProxyId) {
        setProxyId(defaultProxyId);
      }
    } else {
      setAssignedTo("");
      setProxyId("");
      setProxySearch("");
      setProxyDropdownOpen(false);
      setStatus("active");
      setNumberType("temporary");
      setNumber("");
      setCountry("UK");
      setProvider("");
      setPurchasedAt(todayIso());
      setExpiresAt(oneMonthFromTodayIso());
      setNotes("");
    }
  }, [open, defaultProxyId]);

  // Handle proxy selection and auto-set country
  const handleSelectProxy = (selectedId: string | null) => {
    if (!selectedId || selectedId === "none") {
      setProxyId("");
      return;
    }
    setProxyId(selectedId);
    const availableProxies = isSalesman ? salesmanProxies : (adminUserProxies ?? []);
    const match = availableProxies.find((p) => p.id === selectedId);
    if (match && match.country) {
      setCountry(match.country as Country);
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<PhoneNumber>("/api/phone-numbers", {
        assignedTo: isSalesman ? (appUser?.uid ?? "") : assignedTo,
        proxyId: proxyId || null,
        status,
        numberType,
        number: number.trim(),
        country,
        provider: provider.trim(),
        purchasedAt,
        expiresAt,
        notes: notes.trim(),
      }),
    onSuccess: (phone) => {
      toast.success(`Added ${phone.number}`);
      queryClient.invalidateQueries({ queryKey: ["phones"] });
      queryClient.invalidateQueries({ queryKey: ["my-phones"] });
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    (isSalesman ? proxyId.length > 0 : assignedTo.length > 0) &&
    number.trim().length > 0 &&
    provider.trim().length > 0 &&
    purchasedAt.length > 0 &&
    expiresAt.length > 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add phone number
          </SheetTitle>
          <SheetDescription>
            {isSalesman
              ? "Select the proxy for which this number was purchased and enter its details."
              : "Assign the number to a user and optionally link it to a proxy."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-4">
          {/* Salesman: Proxy selector is required */}
          {isSalesman ? (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-600" />
                Purchased for Proxy <span className="text-destructive">*</span>
              </Label>
              {/* Search input ABOVE the Select so keyboard events work */}
              <Input
                placeholder="Search host or Vinted username…"
                value={proxySearch}
                onChange={(e) => {
                  setProxySearch(e.target.value);
                  setProxyDropdownOpen(true);
                }}
              />
              <Select
                value={proxyId}
                onValueChange={handleSelectProxy}
                open={proxyDropdownOpen}
                onOpenChange={setProxyDropdownOpen}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue>
                    {(() => {
                      const p = salesmanProxies.find((pr) => pr.id === proxyId);
                      return p ? `${p.host}:${p.port} — ${COUNTRY_LABELS[p.country as Country] ?? p.country}` : undefined;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="w-[var(--anchor-width)] min-w-[340px]">
                  {salesmanProxies.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-muted-foreground">
                      No proxies assigned to your account
                    </div>
                  ) : filteredSalesmanProxies.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-muted-foreground">No results</div>
                  ) : (
                    filteredSalesmanProxies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.host}:{p.port} — {COUNTRY_LABELS[p.country as Country] ?? p.country} ({p.lane === "active" ? "Active" : "Backup"}){p.vintedUsername ? ` — Vinted: ${p.vintedUsername}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                The phone number will be associated with this proxy.
              </p>
            </div>
          ) : (
            /* Admin/Manager: User selector is required */
            <>
              <div className="space-y-1.5">
                <Label>Assigned to <span className="text-destructive">*</span></Label>
                <Select
                  value={assignedTo}
                  onValueChange={(v) => {
                    setAssignedTo(v ?? "");
                    setProxyId("");
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select user…" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--anchor-width)] min-w-[280px]">
                    {assignableUsers.map((user) => (
                      <SelectItem key={user.uid} value={user.uid}>
                        {user.name} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assignedTo && (
                <div className="flex flex-col space-y-1.5">
                  {/* Search input ABOVE the Select so keyboard events work */}
                  <Input
                    placeholder="Search host or Vinted username…"
                    value={proxySearch}
                    onChange={(e) => {
                      setProxySearch(e.target.value);
                      setProxyDropdownOpen(true);
                    }}
                  />
                  <Select
                    value={proxyId || "none"}
                    onValueChange={handleSelectProxy}
                    open={proxyDropdownOpen}
                    onOpenChange={setProxyDropdownOpen}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select user proxy (optional)…" />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--anchor-width)] min-w-[320px]">
                      <SelectItem value="none">None / Unlinked</SelectItem>
                      {filteredAdminProxies.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.host}:{p.port} — {COUNTRY_LABELS[p.country as Country]} ({p.lane ?? p.status}){p.vintedUsername ? ` — Vinted: ${p.vintedUsername}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as PhoneAccountStatus)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-[var(--anchor-width)] min-w-[160px]">
                {PHONE_ACCOUNT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PHONE_ACCOUNT_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Number Type</Label>
            <Select value={numberType} onValueChange={(v) => setNumberType(v as PhoneNumberType)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent className="w-[var(--anchor-width)] min-w-[160px]">
                <SelectItem value="temporary">Temporary</SelectItem>
                <SelectItem value="permanent">Permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone-number">Number <span className="text-destructive">*</span></Label>
            <Input
              id="phone-number"
              placeholder="+447700900001"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Country <span className="text-destructive">*</span></Label>
            <Select value={country} onValueChange={(v) => setCountry(v as Country)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="w-[var(--anchor-width)] min-w-[160px]">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {COUNTRY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone-provider">Provider <span className="text-destructive">*</span></Label>
            <Input
              id="phone-provider"
              placeholder="SMSPVA, OnlineSIM, Grizzly…"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone-purchased">Purchased <span className="text-destructive">*</span></Label>
              <Input
                id="phone-purchased"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone-expires">Expires <span className="text-destructive">*</span></Label>
              <Input
                id="phone-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone-notes">Notes (optional)</Label>
            <Textarea
              id="phone-notes"
              placeholder="Any extra details (e.g. Vinted verification)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </SheetBody>

        <SheetFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Adding…" : "Add number"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
