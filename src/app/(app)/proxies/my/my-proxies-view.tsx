"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, Proxy, Country } from "@/lib/types";
import type { PoolResponse } from "@/app/api/proxies/mine/route";
import { COUNTRY_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Shield, AlertTriangle, Eye, EyeOff, ArrowUpCircle,
  ExternalLink, Mail, Link2, CheckCircle2, Lock, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { normalizeLane } from "@/lib/pool-utils";
import {
  SalesmanPage,
  SalesmanPageHeader,
  MetricStrip,
  SectionCard,
  WorkflowHint,
  CompactSegmentedSwitch,
} from "@/components/salesman/ui";
import { ProxyDetailSheet } from "@/components/inventory-detail-sheet";

type LaneTab = "backup" | "active" | "banned";

function ProxyRow({
  proxy,
  onDetails,
  children,
}: {
  proxy: Proxy;
  onDetails: () => void;
  children?: React.ReactNode;
}) {
  const [showPass, setShowPass] = useState(false);
  const created = proxy.accountsCreated ?? proxy.stagingDone;
  const lane = normalizeLane(proxy.lane);

  const status = proxy.restricted
    ? { label: "Restricted", className: "bg-amber-50 text-amber-700 border-amber-200" }
    : lane === "active"
      ? { label: "Live", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : created
        ? { label: "Ready", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
        : { label: "Setup needed", className: "bg-blue-50 text-blue-700 border-blue-200" };

  return (
    <article className="rounded-xl border border-border/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {COUNTRY_LABELS[proxy.country as Country]}
            </span>
            <Badge variant="outline" className={cn("text-[10px] h-5 font-medium border", status.className)}>
              {status.label}
            </Badge>
            <span className="text-xs text-muted-foreground">{proxy.provider}</span>
          </div>

          <div className="rounded-lg border bg-slate-50/80 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Proxy</p>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="truncate">{proxy.host}:{proxy.port}</span>
                  <CopyButton value={`${proxy.host}:${proxy.port}`} />
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Password</p>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span>{showPass ? proxy.password : "••••••••"}</span>
                  <button type="button" onClick={() => setShowPass((s) => !s)} className="text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <CopyButton value={proxy.password} />
                </div>
              </div>
            </div>
            {proxy.syncedEmail && (
              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-xs truncate flex-1">{proxy.syncedEmail.email}</span>
                <Link2 className="h-3 w-3 text-emerald-600" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>Purchased {formatDate(proxy.purchasedAt)}</span>
            <ExpiryBadge expiresAt={proxy.expiresAt} />
          </div>
        </div>

        <div className="flex sm:flex-col gap-2 sm:w-[200px] shrink-0">
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={onDetails}>
            <ExternalLink className="h-3 w-3 mr-1.5" />
            View details
          </Button>
          {children}
        </div>
      </div>
    </article>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8">
      <div className="rounded-full bg-muted p-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Empty slot</p>
        <p className="text-xs text-muted-foreground">Waiting for a proxy from the pool</p>
      </div>
    </div>
  );
}

export function MyProxiesView({ user }: { user: AppUser }) {
  const queryClient = useQueryClient();
  const [banTarget, setBanTarget] = useState<Proxy | null>(null);
  const [banNotes, setBanNotes] = useState("");
  const [detailProxy, setDetailProxy] = useState<Proxy | null>(null);
  const [activeCountry, setActiveCountry] = useState<Country>("UK");
  const [laneTab, setLaneTab] = useState<LaneTab>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["my-proxies"],
    queryFn: () => api.get<PoolResponse>("/api/proxies/mine"),
    refetchInterval: 30_000,
  });

  const poolCountries = data?.poolCountries ?? [];
  const selectedCountry: Country | null =
    poolCountries.length === 0
      ? null
      : poolCountries.includes(activeCountry)
        ? activeCountry
        : poolCountries[0];

  useEffect(() => {
    if (poolCountries.length > 0 && !poolCountries.includes(activeCountry)) {
      setActiveCountry(poolCountries[0]);
    }
  }, [poolCountries, activeCountry]);

  const countryPool = selectedCountry ? data?.pools?.[selectedCountry] : undefined;
  const banned = data?.banned ?? [];
  const countryBanned = selectedCountry
    ? banned.filter((b) => b.country === selectedCountry)
    : banned;

  const promoteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/proxies/${id}/promote-active`, {}),
    onSuccess: () => {
      toast.success("Moved to active");
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      setLaneTab("active");
    },
    onError: (err) => toast.error(err.message),
  });

  const markCreatedMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/proxies/${id}/mark-done`, {}),
    onSuccess: () => {
      toast.success("Account marked as created");
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const restrictMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/proxies/${id}/restrict`, {}),
    onSuccess: () => {
      toast.success("Account restricted — promote a backup if needed");
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const unrestrictMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/proxies/${id}/unrestrict`, {}),
    onSuccess: () => {
      toast.success("Account restored to active");
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const banMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post(`/api/proxies/${id}/flag`, { notes }),
    onSuccess: (res) => {
      const r = res as { cascade: { refilled: boolean } };
      toast.success(
        r?.cascade?.refilled
          ? "Ban reported — new backup added"
          : "Ban reported — pool is low on stock"
      );
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      setBanTarget(null);
      setBanNotes("");
    },
    onError: (err) => toast.error(err.message),
  });

  const renderBackupActions = (proxy: Proxy) => {
    if (!countryPool) return null;
    const created = proxy.accountsCreated ?? proxy.stagingDone;

    if (!created) {
      return (
        <Button
          size="sm"
          className="w-full"
          onClick={() => markCreatedMutation.mutate(proxy.id)}
          disabled={markCreatedMutation.isPending}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Mark created
        </Button>
      );
    }

    if (countryPool.canPromote) {
      return (
        <Button
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => promoteMutation.mutate(proxy.id)}
          disabled={promoteMutation.isPending}
        >
          <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
          Move to active
        </Button>
      );
    }

    return (
      <p className="text-[11px] text-center text-muted-foreground px-1">
        Active full — restrict or ban an account first
      </p>
    );
  };

  const renderActiveActions = (proxy: Proxy) => {
    if (!countryPool) return null;

    return (
      <>
        {proxy.restricted ? (
          <Button
            size="sm"
            className="w-full"
            onClick={() => unrestrictMutation.mutate(proxy.id)}
            disabled={
              unrestrictMutation.isPending ||
              countryPool.activeWorkingCount >= countryPool.activeLimit + 1
            }
          >
            <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
            Restore active
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => restrictMutation.mutate(proxy.id)}
            disabled={restrictMutation.isPending || !countryPool.canRestrict}
          >
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Restrict
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-amber-800 border-amber-200 hover:bg-amber-50"
          onClick={() => setBanTarget(proxy)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Report ban
        </Button>
      </>
    );
  };

  return (
    <SalesmanPage>
      <SalesmanPageHeader
        title="My Proxies"
        description="Set up backup accounts, promote them to active, and manage restrictions or bans."
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Proxies" }]}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : poolCountries.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No pool assigned"
          description="Your admin will configure your country pools. Check back soon."
        />
      ) : selectedCountry && countryPool ? (
        <>
          {/* Country picker */}
          {poolCountries.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {poolCountries.map((country) => {
                const pool = data?.pools?.[country];
                const active = selectedCountry === country;
                return (
                  <button
                    key={country}
                    type="button"
                    onClick={() => setActiveCountry(country)}
                    className={cn(
                      "rounded-lg border px-3.5 py-2 text-sm font-medium transition-all",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border/70 bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {COUNTRY_LABELS[country]}
                    <span className={cn("ml-2 text-xs", active ? "text-primary-foreground/80" : "opacity-60")}>
                      {pool?.poolSize ?? 0}/{pool?.totalSlots ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <MetricStrip
            items={[
              {
                label: "Backup",
                value: `${countryPool.backup.length}/${countryPool.backupLimit}`,
                hint: "Setup queue",
                variant: "default",
              },
              {
                label: "Active",
                value: `${countryPool.activeWorkingCount}/${countryPool.activeLimit}`,
                hint: "Live accounts",
                variant: "success",
              },
              {
                label: "Restricted",
                value: countryPool.restrictedCount,
                hint: `Max ${countryPool.restrictedLimit}`,
                variant: "warning",
              },
              {
                label: "Banned",
                value: banned.filter((b) => b.country === selectedCountry).length,
                hint: "This country",
                variant: "danger",
              },
            ]}
          />

          <WorkflowHint
            steps={[
              {
                label: "Backup",
                detail: "Create Gmail + Vinted, then mark account created",
              },
              {
                label: "Promote",
                detail: "Move ready backups to active when a slot is free",
              },
              {
                label: "Restrict",
                detail: "Pause a live account to free a slot — restore later (up to pool+1)",
              },
            ]}
          />

          <SectionCard
            title={COUNTRY_LABELS[selectedCountry]}
            description={`${countryPool.poolSize}/${countryPool.totalSlots} assigned`}
            toolbar={
              <CompactSegmentedSwitch
                value={laneTab}
                onChange={(v) => setLaneTab(v as LaneTab)}
                options={[
                  {
                    value: "active",
                    label: "Active",
                    tone: "blue",
                    count: countryPool.restrictedCount > 0
                      ? `${countryPool.activeWorkingCount}/${countryPool.activeLimit} · ${countryPool.restrictedCount}R`
                      : `${countryPool.activeWorkingCount}/${countryPool.activeLimit}`,
                  },
                  {
                    value: "backup",
                    label: "Backup",
                    tone: "green",
                    count: `${countryPool.backup.length}/${countryPool.backupLimit}`,
                  },
                  ...(countryBanned.length > 0
                    ? [{
                        value: "banned" as const,
                        label: "Banned",
                        tone: "red" as const,
                        count: String(countryBanned.length),
                      }]
                    : []),
                ]}
              />
            }
          >
            {!countryPool.backup.length && !countryPool.active.length && laneTab !== "banned" ? (
              <EmptyState
                icon={Shield}
                title="No proxies in this country yet"
                description="Your admin will assign proxies to this pool."
              />
            ) : laneTab === "backup" ? (
              <div className="space-y-3">
                {countryPool.backup.length === 0 && <EmptySlot />}
                {countryPool.backup.map((proxy) => (
                  <ProxyRow
                    key={proxy.id}
                    proxy={proxy}
                    onDetails={() => setDetailProxy(proxy)}
                  >
                    {renderBackupActions(proxy)}
                  </ProxyRow>
                ))}
                {Array.from({
                  length: Math.max(0, countryPool.backupLimit - countryPool.backup.length),
                }).map((_, i) => (
                  <EmptySlot key={`empty-b-${i}`} />
                ))}
              </div>
            ) : laneTab === "active" ? (
              <div className="space-y-3">
                {countryPool.active.length === 0 && (
                  <EmptyState
                    icon={Shield}
                    title="No active accounts"
                    description="Promote a ready backup account to fill this lane."
                  />
                )}
                {countryPool.active.map((proxy) => (
                  <ProxyRow
                    key={proxy.id}
                    proxy={proxy}
                    onDetails={() => setDetailProxy(proxy)}
                  >
                    {renderActiveActions(proxy)}
                  </ProxyRow>
                ))}
                {countryPool.activeWorkingCount < countryPool.activeLimit &&
                  Array.from({
                    length: countryPool.activeLimit - countryPool.activeWorkingCount,
                  }).map((_, i) => (
                    <EmptySlot key={`empty-a-${i}`} />
                  ))}
              </div>
            ) : (
              <div className="space-y-3">
                {countryBanned.length === 0 ? (
                  <EmptyState
                    icon={Shield}
                    title="No banned accounts"
                    description="Banned proxies for this country will appear here."
                  />
                ) : (
                  countryBanned.map((proxy) => (
                    <ProxyRow
                      key={proxy.id}
                      proxy={proxy}
                      onDetails={() => setDetailProxy(proxy)}
                    />
                  ))
                )}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      <ProxyDetailSheet proxy={detailProxy} user={user} onClose={() => setDetailProxy(null)} />

      <Dialog open={!!banTarget} onOpenChange={(v) => { if (!v) { setBanTarget(null); setBanNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Report ban
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This marks the account as banned and pulls a new backup from the pool if available.
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>What happened? <span className="text-destructive">*</span></Label>
                <span className={cn("text-[11px] tabular-nums", banNotes.length >= 10 ? "text-emerald-600" : "text-muted-foreground")}>
                  {banNotes.length}/10
                </span>
              </div>
              <Textarea
                placeholder="Describe what happened with the account…"
                value={banNotes}
                onChange={(e) => setBanNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBanTarget(null); setBanNotes(""); }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={banMutation.isPending || banNotes.length < 10}
              onClick={() => banTarget && banMutation.mutate({ id: banTarget.id, notes: banNotes })}
            >
              {banMutation.isPending ? "Submitting…" : "Confirm ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalesmanPage>
  );
}
