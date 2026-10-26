"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { COUNTRIES, COUNTRY_LABELS, type Country } from "@/lib/types";
import type { AccountCreationNumber } from "@/lib/account-creation-numbers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryBadge } from "@/components/ui/country-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  FileUp,
} from "lucide-react";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "available", label: "Available", color: "text-emerald-600" },
  { key: "assigned", label: "Assigned", color: "text-blue-600" },
  { key: "changed", label: "Changed", color: "text-amber-700" },
  { key: "retired", label: "Retired", color: "text-muted-foreground" },
] as const;

type StatusTab = (typeof STATUS_TABS)[number]["key"];

const statusStyles: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  changed: "bg-amber-50 text-amber-800 border-amber-200",
  retired: "bg-slate-50 text-slate-600 border-slate-200",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AccountCreationNumbersTable() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountCreationNumber | null>(
    null
  );

  const { data: numbers, isLoading } = useQuery({
    queryKey: ["account-creation-numbers", countryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryFilter !== "all") params.set("country", countryFilter);
      return api.get<AccountCreationNumber[]>(
        `/api/account-creation-numbers?${params}`
      );
    },
  });

  const counts = useMemo(() => {
    const list = numbers ?? [];
    return {
      all: list.length,
      available: list.filter((n) => n.status === "available").length,
      assigned: list.filter((n) => n.status === "assigned").length,
      changed: list.filter((n) => n.status === "changed").length,
      retired: list.filter((n) => n.status === "retired").length,
    };
  }, [numbers]);

  const filtered = useMemo(() => {
    let list = numbers ?? [];
    if (activeTab !== "all") {
      list = list.filter((n) => n.status === activeTab);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.number.toLowerCase().includes(q) ||
          n.provider.toLowerCase().includes(q) ||
          `${n.proxyHost ?? ""}:${n.proxyPort ?? ""}`
            .toLowerCase()
            .includes(q)
      );
    }
    return list;
  }, [numbers, activeTab, search]);

  const revokeMutation = useMutation({
    mutationFn: ({ id, retire }: { id: string; retire: boolean }) =>
      api.post(`/api/account-creation-numbers/${id}/revoke`, { retire }),
    onSuccess: (_, { retire }) => {
      toast.success(retire ? "Number retired" : "Number returned to available");
      qc.invalidateQueries({ queryKey: ["account-creation-numbers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add number
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <FileUp className="h-3.5 w-3.5 mr-1.5" />
          Import CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search number, provider, proxy…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={countryFilter}
          onValueChange={(v) => setCountryFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {COUNTRIES.map((c) => (
              <SelectItem key={c} value={c}>
                {COUNTRY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.key];
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
              <span
                className={
                  isActive
                    ? undefined
                    : "color" in tab
                      ? tab.color
                      : undefined
                }
              >
                {tab.label}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-bold",
                    isActive
                      ? "bg-background/20 text-background"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Country</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Proxy</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !filtered.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <EmptyState
                    icon={Phone}
                    title="No account creation numbers yet"
                    description="Add or import permanent numbers for account creation."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell>
                      <CountryBadge country={row.country as Country} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-medium">
                          {row.number}
                        </span>
                        <CopyButton value={row.number} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{row.provider}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] border",
                          statusStyles[row.status]
                        )}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {row.proxyHost && row.proxyPort
                        ? `${row.proxyHost}:${row.proxyPort}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-7 w-7 opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditTarget(row)}>
                            Edit
                          </DropdownMenuItem>
                          {row.proxyId && row.status !== "retired" && (
                            <DropdownMenuItem
                              onClick={() =>
                                revokeMutation.mutate({
                                  id: row.id,
                                  retire: false,
                                })
                              }
                            >
                              Unlink / return to available
                            </DropdownMenuItem>
                          )}
                          {row.status !== "retired" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  revokeMutation.mutate({
                                    id: row.id,
                                    retire: true,
                                  })
                                }
                              >
                                Retire number
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {numbers && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {numbers.length} numbers
        </p>
      )}

      <AddNumberSheet open={addOpen} onClose={() => setAddOpen(false)} />

      <EditNumberSheet
        number={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ImportNumbersDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

function NumberFormFields({
  number,
  setNumber,
  country,
  setCountry,
  provider,
  setProvider,
  notes,
  setNotes,
}: {
  number: string;
  setNumber: (v: string) => void;
  country: Country;
  setCountry: (v: Country) => void;
  provider: string;
  setProvider: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>
          Number <span className="text-destructive">*</span>
        </Label>
        <Input
          placeholder="+447700900001"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          Country <span className="text-destructive">*</span>
        </Label>
        <Select
          value={country}
          onValueChange={(v) => setCountry((v ?? "UK") as Country)}
        >
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
        <Label>
          Provider <span className="text-destructive">*</span>
        </Label>
        <Input
          placeholder="Provider name"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
        />
      </div>
    </>
  );
}

function AddNumberSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.post<AccountCreationNumber>("/api/account-creation-numbers", {
        number: number.trim(),
        country,
        provider: provider.trim(),
        notes: notes.trim(),
      }),
    onSuccess: (row) => {
      toast.success(`Added ${row.number}`);
      qc.invalidateQueries({ queryKey: ["account-creation-numbers"] });
      setNumber("");
      setProvider("");
      setNotes("");
      setCountry("UK");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = number.trim().length > 0 && provider.trim().length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add account creation number
          </SheetTitle>
          <SheetDescription>
            Permanent number stock. Link a number to a proxy from Proxy details.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex-1 space-y-4">
          <NumberFormFields
            number={number}
            setNumber={setNumber}
            country={country}
            setCountry={setCountry}
            provider={provider}
            setProvider={setProvider}
            notes={notes}
            setNotes={setNotes}
          />
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Add number"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EditNumberSheet({
  number: target,
  onClose,
}: {
  number: AccountCreationNumber | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!target) return;
    setValue(target.number);
    setCountry(target.country);
    setProvider(target.provider);
    setNotes(target.notes ?? "");
  }, [target]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<AccountCreationNumber>(
        `/api/account-creation-numbers/${target!.id}`,
        {
          number: value.trim(),
          country,
          provider: provider.trim(),
          notes: notes.trim(),
        }
      ),
    onSuccess: (row) => {
      toast.success(`Updated ${row.number}`);
      qc.invalidateQueries({ queryKey: ["account-creation-numbers"] });
      qc.invalidateQueries({ queryKey: ["proxies"] });
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = value.trim().length > 0 && provider.trim().length > 0;

  return (
    <Sheet
      open={!!target}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Edit account creation number</SheetTitle>
          <SheetDescription>
            Updates stock details. If linked to a proxy, the number shown there
            is updated too.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex-1 space-y-4">
          <NumberFormFields
            number={value}
            setNumber={setValue}
            country={country}
            setCountry={setCountry}
            provider={provider}
            setProvider={setProvider}
            notes={notes}
            setNotes={setNotes}
          />
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ImportNumbersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [defaultCountry, setDefaultCountry] = useState<Country>("UK");
  const [defaultProvider, setDefaultProvider] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.toLowerCase().startsWith("number"));

      const rows = lines.map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const number = parts[0];
        const country = (parts[1]?.toUpperCase() || defaultCountry) as Country;
        const provider = parts[2] || defaultProvider;
        const notes = parts[3] || "";
        if (!number || !provider) {
          throw new Error(
            `Invalid row "${line}". Need number and provider (or set default provider).`
          );
        }
        if (!COUNTRIES.includes(country)) {
          throw new Error(`Invalid country in row "${line}".`);
        }
        return { number, country, provider, notes };
      });

      if (!rows.length) throw new Error("No rows to import.");

      return api.post<{ count: number }>(
        "/api/account-creation-numbers/import",
        {
          rows,
          rawFileName: `paste-${todayIso()}.csv`,
        }
      );
    },
    onSuccess: (data) => {
      toast.success(`${data.count} numbers imported`);
      qc.invalidateQueries({ queryKey: ["account-creation-numbers"] });
      setRawText("");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import account creation numbers</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            One per line:{" "}
            <code className="text-[11px]">number,country,provider,notes</code>
            . Country/provider can use defaults below.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Default country</Label>
              <Select
                value={defaultCountry}
                onValueChange={(v) =>
                  setDefaultCountry((v ?? "UK") as Country)
                }
              >
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
              <Label>Default provider</Label>
              <Input
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                placeholder="Required if missing in CSV"
              />
            </div>
          </div>
          <Textarea
            className="min-h-[180px] font-mono text-xs"
            placeholder={"+447700900001,UK,Vodafone\n+447700900002,UK,EE"}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!rawText.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
