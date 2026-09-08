"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { api } from "@/lib/api-client";
import { COUNTRIES, COUNTRY_LABELS, type Country } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface FormState {
  host: string;
  port: string;
  username: string;
  password: string;
  country: Country;
  provider: string;
  purchasedAt: string;
  expiresAt: string;
  notes: string;
}

function emptyForm(): FormState {
  const today = format(new Date(), "yyyy-MM-dd");
  const expiry = format(addDays(new Date(), 30), "yyyy-MM-dd");
  return {
    host: "",
    port: "",
    username: "",
    password: "",
    country: "UK",
    provider: "proxy-cheap",
    purchasedAt: today,
    expiresAt: expiry,
    notes: "",
  };
}

export function AddProxySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const queryClient = useQueryClient();

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose(next: boolean) {
    if (!next) setForm(emptyForm());
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ count: number }>("/api/proxies/import", {
        rows: [
          {
            host: form.host.trim(),
            port: form.port.trim(),
            username: form.username.trim(),
            password: form.password.trim(),
            country: form.country,
            provider: form.provider.trim() || "proxy-cheap",
            purchasedAt: form.purchasedAt,
            expiresAt: form.expiresAt,
            notes: form.notes.trim(),
          },
        ],
        rawFileName: "manual-add",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      toast.success("Proxy added");
      handleClose(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.host.trim() || !form.port.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error("Host, port, username, and password are required");
      return;
    }
    if (!form.provider.trim()) {
      toast.error("Provider is required");
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader>
          <SheetTitle>Add Proxy</SheetTitle>
          <SheetDescription>Manually add a single proxy to inventory</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="add-proxy-host">Host</Label>
                <Input
                  id="add-proxy-host"
                  placeholder="1.2.3.4"
                  value={form.host}
                  onChange={(e) => setField("host", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="add-proxy-port">Port</Label>
                <Input
                  id="add-proxy-port"
                  placeholder="8000"
                  value={form.port}
                  onChange={(e) => setField("port", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-proxy-username">Username</Label>
              <Input
                id="add-proxy-username"
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-proxy-password">Password</Label>
              <Input
                id="add-proxy-password"
                type="text"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Select
                  value={form.country}
                  onValueChange={(v) => setField("country", (v ?? "UK") as Country)}
                >
                  <SelectTrigger className="w-full">
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
                <Label htmlFor="add-proxy-provider">Provider</Label>
                <Input
                  id="add-proxy-provider"
                  value={form.provider}
                  onChange={(e) => setField("provider", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-proxy-purchased">Purchased</Label>
                <Input
                  id="add-proxy-purchased"
                  type="date"
                  value={form.purchasedAt}
                  onChange={(e) => setField("purchasedAt", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-proxy-expires">Expires</Label>
                <Input
                  id="add-proxy-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setField("expiresAt", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-proxy-notes">Notes</Label>
              <Textarea
                id="add-proxy-notes"
                rows={3}
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </div>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Add Proxy"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Toolbar button that opens the add-proxy drawer */
export function AddProxyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Proxy
      </Button>
      <AddProxySheet open={open} onOpenChange={setOpen} />
    </>
  );
}
