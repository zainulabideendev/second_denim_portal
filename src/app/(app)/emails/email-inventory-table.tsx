"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Email, AppUser } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MoreHorizontal, Search, Eye, EyeOff, Link2, Link2Off } from "lucide-react";
import { SyncProxyDialog } from "@/components/sync-dialogs";
import type { Proxy } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BulkImportButton } from "@/components/bulk-import-dialog";
// import { AutoSyncButton } from "@/components/auto-sync-button";
import { EmailDetailSheet } from "@/components/inventory-detail-sheet";
import {
  TablePagination,
  TableFilterSelect,
  usePagination,
} from "@/components/ui/table-pagination";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "fresh", label: "Fresh" },
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "flagged", label: "Flagged" },
  { value: "retired", label: "Retired" },
];

const SYNC_OPTIONS = [
  { value: "all", label: "All sync" },
  { value: "synced", label: "Synced" },
  { value: "unsynced", label: "Not synced" },
];

const STATUS_BADGE: Record<string, string> = {
  fresh: "bg-cyan-50 text-cyan-700 border-cyan-200",
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  flagged: "bg-amber-50 text-amber-700 border-amber-200",
  retired: "bg-muted text-muted-foreground border-border",
};

function PasswordCell({ password }: { password: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      <span>{show ? password : "••••••••"}</span>
      <button onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
      <CopyButton value={password} />
    </div>
  );
}

export function EmailInventoryTable() {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [assignTarget, setAssignTarget] = useState<Email | null>(null);
  const [syncTarget, setSyncTarget] = useState<Email | null>(null);
  const [detailTarget, setDetailTarget] = useState<Email | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: () => api.get<Email[]>("/api/emails"),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AppUser[]>("/api/users"),
  });

  const { data: proxies } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => api.get<Proxy[]>("/api/proxies"),
  });

  const userMap = useMemo(() => new Map(users?.map((u) => [u.uid, u])), [users]);
  const salesmen = users?.filter((u) => u.status === "active") ?? [];

  const userOptions = useMemo(
    () => [
      { value: "all", label: "All users" },
      { value: "unassigned", label: "Unassigned" },
      ...salesmen.map((u) => ({ value: u.uid, label: u.name })),
    ],
    [salesmen]
  );

  const filtered = useMemo(() => {
    if (!emails) return [];
    let list = emails;

    if (statusFilter !== "all") {
      list = list.filter((e) => e.status === statusFilter);
    }
    if (userFilter === "unassigned") {
      list = list.filter((e) => !e.assignedTo);
    } else if (userFilter !== "all") {
      list = list.filter((e) => e.assignedTo === userFilter);
    }
    if (syncFilter === "synced") {
      list = list.filter((e) => !!e.syncedProxyId);
    } else if (syncFilter === "unsynced") {
      list = list.filter((e) => !e.syncedProxyId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.email.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q) ||
          e.syncedProxy?.host?.includes(q) ||
          userMap.get(e.assignedTo ?? "")?.name?.toLowerCase().includes(q) ||
          userMap.get(e.assignedTo ?? "")?.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [emails, statusFilter, userFilter, syncFilter, search, userMap]);

  const { paginated, total, safePage } = usePagination(filtered, pageSize, page);

  useEffect(() => {
    setPage(1);
  }, [search, userFilter, statusFilter, syncFilter, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function clearFilters() {
    setSearch("");
    setUserFilter("all");
    setStatusFilter("all");
    setSyncFilter("all");
    setPage(1);
  }

  const hasActiveFilters =
    search || userFilter !== "all" || statusFilter !== "all" || syncFilter !== "all";

  const assignMutation = useMutation({
    mutationFn: ({ id, uid }: { id: string; uid: string }) =>
      api.post(`/api/emails/${id}/assign`, { assignedTo: uid }),
    onSuccess: () => {
      toast.success("Email assigned");
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setAssignTarget(null);
      setAssignUserId("");
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, retire }: { id: string; retire: boolean }) =>
      api.post(`/api/emails/${id}/revoke`, { retire }),
    onSuccess: (_, { retire }) => {
      toast.success(retire ? "Email retired" : "Email revoked");
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const flagMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/emails/${id}/flag`, {}),
    onSuccess: () => {
      toast.success("Email flagged");
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search email, notes, or user…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filters
            </button>
          )}
          {/* <AutoSyncButton /> */}
          <BulkImportButton type="email" />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Email</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Proxy Sync</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead colSpan={2} />
              <TableHead className="py-2">
                <TableFilterSelect
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  placeholder="Status"
                  options={STATUS_OPTIONS}
                />
              </TableHead>
              <TableHead className="py-2">
                <TableFilterSelect
                  value={userFilter}
                  onValueChange={setUserFilter}
                  placeholder="User"
                  options={userOptions}
                />
              </TableHead>
              <TableHead className="py-2">
                <TableFilterSelect
                  value={syncFilter}
                  onValueChange={setSyncFilter}
                  placeholder="Proxy sync"
                  options={SYNC_OPTIONS}
                />
              </TableHead>
              <TableHead colSpan={2} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !paginated.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48">
                  <EmptyState
                    icon={Mail}
                    title="No emails found"
                    description="Try different filters or import a CSV."
                  />
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((email) => {
                const assignedUser = userMap.get(email.assignedTo ?? "");
                return (
                  <TableRow key={email.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium">{email.email}</span>
                        <CopyButton value={email.email} />
                      </div>
                    </TableCell>
                    <TableCell><PasswordCell password={email.password} /></TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[email.status] ?? "")}>
                        {email.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {assignedUser ? (
                        <div>
                          <p className="font-medium">{assignedUser.name}</p>
                          <p className="text-muted-foreground text-[11px]">{assignedUser.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        {email.syncedProxyId && email.syncedProxy ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <Link2 className="h-3 w-3" />
                            Synced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            <Link2Off className="h-3 w-3" />
                            Not synced
                          </span>
                        )}
                        {email.syncedProxy && (
                          <p className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                            {email.syncedProxy.host}:{email.syncedProxy.port}
                          </p>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => setSyncTarget(email)}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          {email.syncedProxyId ? "Change" : "Sync proxy"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {email.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 opacity-0 group-hover:opacity-100")}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailTarget(email)}>
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setAssignTarget(email); setAssignUserId(""); }}>
                            Assign to user
                          </DropdownMenuItem>
                          {email.assignedTo && (
                            <DropdownMenuItem onClick={() => revokeMutation.mutate({ id: email.id, retire: false })}>
                              Revoke (back to available)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => flagMutation.mutate(email.id)}>
                            Flag email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => revokeMutation.mutate({ id: email.id, retire: true })}
                          >
                            Retire email
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={safePage}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <Dialog open={!!assignTarget} onOpenChange={(v) => { if (!v) { setAssignTarget(null); setAssignUserId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Email to User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground font-mono">{assignTarget?.email}</p>
            <div className="space-y-1.5">
              <Label>Select user</Label>
              <Select value={assignUserId} onValueChange={(v) => setAssignUserId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Choose a salesman…" /></SelectTrigger>
                <SelectContent>
                  {salesmen.map((u) => (
                    <SelectItem key={u.uid} value={u.uid}>{u.name} — {u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button
              disabled={!assignUserId || assignMutation.isPending}
              onClick={() => assignTarget && assignMutation.mutate({ id: assignTarget.id, uid: assignUserId })}
            >
              {assignMutation.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SyncProxyDialog
        email={syncTarget}
        proxies={proxies ?? []}
        onClose={() => setSyncTarget(null)}
      />

      <EmailDetailSheet
        email={detailTarget}
        user={detailTarget ? userMap.get(detailTarget.assignedTo ?? "") : undefined}
        onClose={() => setDetailTarget(null)}
      />
    </div>
  );
}
