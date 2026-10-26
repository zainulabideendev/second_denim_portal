"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { api } from "@/lib/api-client";
import type { Country, PhoneNumberType, Proxy } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

interface AddPhoneToProxyDialogProps {
  proxy: Proxy | null;
  onClose: () => void;
  /** Called after a successful save (e.g. refresh detail sheet). */
  onSaved?: (data: { phoneId: string; proxyId: string; number: string }) => void;
}

export function AddPhoneToProxyDialog({ proxy, onClose, onSaved }: AddPhoneToProxyDialogProps) {
  const [number, setNumber] = useState("");
  const [provider, setProvider] = useState("manual");
  const [country, setCountry] = useState<Country>("UK");
  const [numberType, setNumberType] = useState<PhoneNumberType>("temporary");
  const [purchasedAt, setPurchasedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expiresAt, setExpiresAt] = useState(
    format(addDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!proxy) return;
    setNumber("");
    setProvider("manual");
    setCountry((proxy.country as Country) || "UK");
    setNumberType("temporary");
    setPurchasedAt(format(new Date(), "yyyy-MM-dd"));
    setExpiresAt(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setNotes("");
  }, [proxy?.id]);

  function resetAndClose() {
    onClose();
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ phoneId: string; proxyId: string; number: string }>(`/api/proxies/${proxy!.id}/add-phone`, {
        number: number.trim(),
        provider: provider.trim() || "manual",
        country,
        numberType,
        purchasedAt,
        expiresAt,
        notes,
      }),
    onSuccess: (data) => {
      toast.success(`Phone added to proxy: ${data.number}`);
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["phones"] });
      queryClient.invalidateQueries({ queryKey: ["my-phones"] });
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      onSaved?.(data);
      resetAndClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!proxy) return null;

  const canSubmit =
    number.trim().length > 0 &&
    provider.trim().length > 0 &&
    !mutation.isPending;

  return (
    <Dialog
      open={!!proxy}
      onOpenChange={(v) => {
        if (!v) resetAndClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Add phone number
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground font-mono">
            {proxy.host}:{proxy.port}
          </p>
          {proxy.phoneNumber && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This proxy already has{" "}
              <span className="font-mono">{proxy.phoneNumber}</span>. Adding a new
              number will replace that link.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="add-phone-number">Phone number</Label>
            <Input
              id="add-phone-number"
              placeholder="+33612345678"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select
                value={country}
                onValueChange={(v) => setCountry((v ?? country) as Country)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{COUNTRY_LABELS[country]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {COUNTRY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={numberType}
                onValueChange={(v) =>
                  setNumberType((v ?? numberType) as PhoneNumberType)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="temporary">Temporary</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-phone-provider">Provider</Label>
            <Input
              id="add-phone-provider"
              placeholder="SMSPVA"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-phone-purchased">Purchased</Label>
              <Input
                id="add-phone-purchased"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-phone-expires">Expires</Label>
              <Input
                id="add-phone-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-phone-notes">Notes (optional)</Label>
            <Input
              id="add-phone-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save phone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
