"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, Country, PhoneAccountStatus, PhoneNumber } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
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
import { Plus } from "lucide-react";

interface AddPhoneDrawerProps {
  open: boolean;
  onClose: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function oneMonthFromTodayIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function AddPhoneDrawer({ open, onClose }: AddPhoneDrawerProps) {
  const queryClient = useQueryClient();
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<PhoneAccountStatus>("active");
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [provider, setProvider] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayIso);
  const [expiresAt, setExpiresAt] = useState(oneMonthFromTodayIso);
  const [notes, setNotes] = useState("");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
    enabled: open,
  });

  const assignableUsers =
    users?.filter((u) => u.status === "active" && u.role !== "admin") ?? [];

  useEffect(() => {
    if (!open) {
      setAssignedTo("");
      setStatus("active");
      setNumber("");
      setCountry("UK");
      setProvider("");
      setPurchasedAt(todayIso());
      setExpiresAt(oneMonthFromTodayIso());
      setNotes("");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<PhoneNumber>("/api/phone-numbers", {
        assignedTo,
        status,
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
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit =
    assignedTo.length > 0 &&
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
            Assign the number to a user and set its account status.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select value={assignedTo} onValueChange={(v) => setAssignedTo(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select user…" />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((user) => (
                  <SelectItem key={user.uid} value={user.uid}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as PhoneAccountStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHONE_ACCOUNT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PHONE_ACCOUNT_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone-number">Number</Label>
            <Input
              id="phone-number"
              placeholder="+447700900001"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Country</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as Country)}>
              <SelectTrigger>
                <SelectValue />
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
            <Label htmlFor="phone-provider">Provider</Label>
            <Input
              id="phone-provider"
              placeholder="SMSPVA, OnlineSIM…"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone-purchased">Purchased</Label>
              <Input
                id="phone-purchased"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone-expires">Expires</Label>
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
              placeholder="Any extra details…"
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
