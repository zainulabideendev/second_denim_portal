"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy, ProxyLane, UserCountryPoolRow } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssignPoolProxyDrawerProps {
  pool: UserCountryPoolRow | null;
  open: boolean;
  onClose: () => void;
}

export function AssignPoolProxyDrawer({
  pool,
  open,
  onClose,
}: AssignPoolProxyDrawerProps) {
  const queryClient = useQueryClient();
  const [proxyId, setProxyId] = useState("");
  const [lane, setLane] = useState<ProxyLane>("backup");
  const [search, setSearch] = useState("");

  const { data: proxies, isLoading } = useQuery({
    queryKey: ["proxies", "available", pool?.country],
    queryFn: () => api.get<Proxy[]>(`/api/proxies?country=${pool!.country}`),
    enabled: open && !!pool,
  });

  const available = useMemo(() => {
    const list = (proxies ?? []).filter(
      (p) => p.status === "fresh" || p.status === "available"
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.host.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.provider.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [proxies, search]);

  const backupLimit = pool?.backupLimit ?? (pool ? pool.sizePerLane * 2 : 0);
  const activeLimit = pool?.sizePerLane ?? 0;
  const backupFull = pool ? pool.byLane.backup >= backupLimit : true;
  const activeFull = pool ? pool.byLane.active >= activeLimit : true;

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/pools/${pool!.id}/assign-proxy`, { proxyId, lane }),
    onSuccess: () => {
      toast.success(`Proxy assigned to ${pool!.userName} (${lane})`);
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      setProxyId("");
      setSearch("");
      setLane("backup");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleClose() {
    setProxyId("");
    setSearch("");
    setLane("backup");
    onClose();
  }

  const canAssign =
    !!proxyId &&
    ((lane === "backup" && !backupFull) || (lane === "active" && !activeFull));

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Assign Proxy
          </SheetTitle>
          <SheetDescription>
            {pool
              ? `Manually assign a ${COUNTRY_LABELS[pool.country]} proxy to ${pool.userName}`
              : "Select a pool"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-4">
          {pool && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p>
                Backup {pool.byLane.backup}/{backupLimit}
                {backupFull ? " · full" : ""}
              </p>
              <p>
                Active {pool.byLane.active}/{activeLimit}
                {activeFull ? " · full" : ""}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Lane</Label>
            <Select
              value={lane}
              onValueChange={(v) => setLane((v ?? "backup") as ProxyLane)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backup" disabled={backupFull}>
                  Backup{backupFull ? " (full)" : ""}
                </SelectItem>
                <SelectItem value="active" disabled={activeFull}>
                  Active{activeFull ? " (full)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Search available proxies</Label>
            <Input
              placeholder="Host, username, provider…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Select proxy</Label>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : available.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No available {pool ? COUNTRY_LABELS[pool.country] : ""} proxies
                </p>
              ) : (
                available.map((p) => {
                  const selected = proxyId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProxyId(p.id)}
                      className={cn(
                        "w-full border-b last:border-b-0 px-3 py-2.5 text-left text-sm hover:bg-muted/50",
                        selected && "bg-primary/5"
                      )}
                    >
                      <p className="font-mono text-xs font-medium">
                        {p.host}:{p.port}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.username} · {p.provider} · {p.status}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={!canAssign || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Assigning…" : "Assign proxy"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
