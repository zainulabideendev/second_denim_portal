"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, Country } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface CreatePoolDrawerProps {
  open: boolean;
  onClose: () => void;
}

type CountryLimits = Record<Country, { active: number; backup: number }>;

function defaultLimits(): CountryLimits {
  return {
    FR: { active: 3, backup: 6 },
    BE: { active: 3, backup: 6 },
    UK: { active: 3, backup: 6 },
    DE: { active: 3, backup: 6 },
  };
}

export function CreatePoolDrawer({ open, onClose }: CreatePoolDrawerProps) {
  const queryClient = useQueryClient();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<Country[]>([]);
  const [limits, setLimits] = useState<CountryLimits>(defaultLimits);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
    enabled: open,
  });

  const salesmen = users?.filter((u) => u.role === "salesman" && u.status === "active") ?? [];

  useEffect(() => {
    if (!open) {
      setSelectedUserIds([]);
      setSelectedCountries([]);
      setLimits(defaultLimits());
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ created: number; filled: number }>("/api/pools", {
        userIds: selectedUserIds,
        countrySizes: selectedCountries.map((country) => ({
          country,
          sizePerLane: limits[country].active,
          backupLimit: limits[country].backup,
        })),
      }),
    onSuccess: (result) => {
      toast.success(
        `Created ${result.created} pool(s)${result.filled ? ` — ${result.filled} proxy(ies) assigned` : ""}`
      );
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleUser(uid: string) {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  function toggleCountry(country: Country) {
    setSelectedCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    );
  }

  function setLimit(country: Country, field: "active" | "backup", value: number) {
    const max = field === "active" ? 10 : 20;
    setLimits((prev) => ({
      ...prev,
      [country]: {
        ...prev[country],
        [field]: Math.max(field === "backup" ? 0 : 1, Math.min(max, value || 0)),
      },
    }));
  }

  const canSubmit =
    selectedUserIds.length > 0 &&
    selectedCountries.length > 0 &&
    selectedCountries.every((c) => limits[c].active >= 1 && limits[c].backup >= 0);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Pool
          </SheetTitle>
          <SheetDescription>
            Assign country pools to one or more salesmen. Set active and backup limits separately.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">1. Select users</Label>
            <p className="text-xs text-muted-foreground">Choose one or more salesmen</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-md border p-2">
              {salesmen.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No active salesmen</p>
              ) : (
                salesmen.map((user) => {
                  const checked = selectedUserIds.includes(user.uid);
                  return (
                    <label
                      key={user.uid}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-muted/50",
                        checked && "bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleUser(user.uid)}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{user.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">2. Select countries</Label>
            <p className="text-xs text-muted-foreground">Choose one or more countries</p>
            <div className="grid grid-cols-2 gap-2">
              {COUNTRIES.map((country) => {
                const checked = selectedCountries.includes(country);
                return (
                  <label
                    key={country}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm",
                      checked ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleCountry(country)}
                    />
                    {COUNTRY_LABELS[country]}
                  </label>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">3. Active & backup per country</Label>
            <p className="text-xs text-muted-foreground">
              Active = live accounts. Backup = staging slots auto-filled from inventory.
            </p>
            {selectedCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select countries above</p>
            ) : (
              <div className="space-y-2">
                {selectedCountries.map((country) => {
                  const { active, backup } = limits[country];
                  return (
                    <div
                      key={country}
                      className="rounded-md border px-3 py-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{COUNTRY_LABELS[country]}</span>
                        <span className="text-xs text-muted-foreground">
                          {active + backup} total slots
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Active</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            className="h-8"
                            value={active}
                            onChange={(e) =>
                              setLimit(country, "active", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Backup</Label>
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            className="h-8"
                            value={backup}
                            onChange={(e) =>
                              setLimit(country, "backup", Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
            {createMutation.isPending ? "Creating…" : "Create pool"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
