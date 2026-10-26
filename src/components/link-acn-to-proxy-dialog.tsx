"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy } from "@/lib/types";
import { COUNTRY_LABELS, type Country } from "@/lib/types";
import type { AccountCreationNumber } from "@/lib/account-creation-numbers";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Phone } from "lucide-react";

interface Props {
  proxy: Proxy | null;
  onClose: () => void;
  onSaved?: (data: {
    proxyId: string;
    accountCreationNumberId: string;
    number: string;
    linkedAt?: string;
  }) => void;
}

export function LinkAcnToProxyDialog({ proxy, onClose, onSaved }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    if (!proxy) return;
    setSelectedId("");
    setSearch("");
  }, [proxy?.id]);

  const { data: numbers, isLoading } = useQuery({
    queryKey: ["account-creation-numbers", "available", proxy?.country],
    queryFn: () => {
      const params = new URLSearchParams({ status: "available" });
      if (proxy?.country) params.set("country", proxy.country);
      return api.get<AccountCreationNumber[]>(
        `/api/account-creation-numbers?${params}`
      );
    },
    enabled: !!proxy,
  });

  const options = useMemo(() => {
    let list = numbers ?? [];
    // Also include numbers already linked to this proxy
    if (proxy?.accountCreationNumberId) {
      // keep available list; linked one may not be in available
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.number.toLowerCase().includes(q) ||
          n.provider.toLowerCase().includes(q)
      );
    }
    return list;
  }, [numbers, search, proxy?.accountCreationNumberId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{
        proxyId: string;
        accountCreationNumberId: string;
        number: string;
        linkedAt: string;
      }>(`/api/proxies/${proxy!.id}/link-account-creation-number`, {
        accountCreationNumberId: selectedId,
      }),
    onSuccess: (data) => {
      toast.success(`Linked number ${data.number}`);
      qc.invalidateQueries({ queryKey: ["proxies"] });
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
      qc.invalidateQueries({ queryKey: ["account-creation-numbers"] });
      onSaved?.(data);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!proxy) return null;

  return (
    <Dialog
      open={!!proxy}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Link account creation number
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">
            Pick a permanent number from stock for{" "}
            <span className="font-medium text-foreground">
              {proxy.host}:{proxy.port}
            </span>{" "}
            ({COUNTRY_LABELS[proxy.country as Country]}). The assigned salesman
            will see it on My Proxies.
          </p>

          <div className="space-y-1.5">
            <Label>Search</Label>
            <Input
              placeholder="Filter by number or provider…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Available number</Label>
            <Select
              value={selectedId}
              onValueChange={(v) => setSelectedId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoading ? "Loading…" : "Select a number…"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {options.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No available numbers for this country. Add some under
                    Account creation numbers.
                  </div>
                ) : (
                  options.map((n) => (
                    <SelectItem key={n.id} value={n.id} label={n.number}>
                      {n.number} · {n.provider}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Linking…" : "Link number"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
