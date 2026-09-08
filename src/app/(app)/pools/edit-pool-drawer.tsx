"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, Country, UserCountryPoolRow } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

interface EditPoolDrawerProps {
  pool: UserCountryPoolRow | null;
  open: boolean;
  onClose: () => void;
}

function userLabel(u: Pick<AppUser, "name" | "email">) {
  return `${u.name} (${u.email})`;
}

export function EditPoolDrawer({ pool, open, onClose }: EditPoolDrawerProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [active, setActive] = useState(3);
  const [backup, setBackup] = useState(6);

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
    enabled: open,
  });

  const userOptions = useMemo(() => {
    const salesmen =
      users?.filter((u) => u.role === "salesman" && u.status === "active") ?? [];
    const byId = new Map(salesmen.map((u) => [u.uid, u]));

    // Always include the pool's current user so the trigger shows their name
    if (pool && !byId.has(pool.userId)) {
      byId.set(pool.userId, {
        uid: pool.userId,
        name: pool.userName,
        email: pool.userEmail,
        role: "salesman",
        status: "active",
        createdAt: "",
        activeProxyLimit: 0,
      } as AppUser);
    }

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, pool]);

  const selectedUser = userOptions.find((u) => u.uid === userId);

  useEffect(() => {
    if (!pool || !open) return;
    setUserId(pool.userId);
    setCountry(pool.country);
    setActive(pool.sizePerLane);
    setBackup(pool.backupLimit ?? pool.sizePerLane * 2);
  }, [pool, open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/pools/${pool!.id}`, {
        userId,
        country,
        sizePerLane: active,
        backupLimit: backup,
      }),
    onSuccess: () => {
      toast.success("Pool updated");
      queryClient.invalidateQueries({ queryKey: ["pools"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const busy = saveMutation.isPending;
  const canSave = !!userId && active >= 1 && backup >= 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Pool
          </SheetTitle>
          <SheetDescription>
            Update user, country, or active/backup limits. Proxies are not auto-reassigned.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex-1 space-y-5">
          {pool && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Current fill: {pool.filled}/{pool.total} · B {pool.byLane.backup} · A{" "}
              {pool.byLane.active}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>User</Label>
            <Select value={userId || undefined} onValueChange={(v) => setUserId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select salesman">
                  {selectedUser ? userLabel(selectedUser) : pool?.userName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {userOptions.map((u) => (
                  <SelectItem key={u.uid} value={u.uid} label={userLabel(u)}>
                    {userLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                  <SelectItem key={c} value={c} label={COUNTRY_LABELS[c]}>
                    {COUNTRY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-pool-active">Active</Label>
              <Input
                id="edit-pool-active"
                type="number"
                min={1}
                max={10}
                value={active}
                onChange={(e) =>
                  setActive(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pool-backup">Backup</Label>
              <Input
                id="edit-pool-backup"
                type="number"
                min={0}
                max={20}
                value={backup}
                onChange={(e) =>
                  setBackup(Math.max(0, Math.min(20, Number(e.target.value) || 0)))
                }
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Total slots: {active + backup}
          </p>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || busy}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
