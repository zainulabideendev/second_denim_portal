"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser } from "@/lib/types";
import type { UserProxyStat } from "@/app/api/dashboard/users-summary/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Users,
  Shield,
  Phone,
  AlertTriangle,
  Plus,
  MoreHorizontal,
  Search,
  Mail,
  UserCheck,
  UserX,
  TrendingUp,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryData {
  stats: UserProxyStat[];
  totals: {
    proxies: { available: number; assigned: number; expired: number; flagged: number; total: number };
    phones: { available: number; assigned: number; expired: number; flagged: number; total: number };
    users: { total: number; active: number; disabled: number };
  };
}

// ─── Create User form ─────────────────────────────────────────────────────────

const createUserSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Min 8 characters"),
  role: z.enum(["admin", "manager", "salesman"]),
  activeProxyLimit: z.coerce.number().int().min(1).max(20),
});
type CreateUserForm = z.infer<typeof createUserSchema>;

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value?: number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className={cn("text-2xl font-bold mt-0.5", accent)}>{value ?? 0}</p>
            )}
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Usage bar ───────────────────────────────────────────────────────────────

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
  const color =
    pct >= 100
      ? "bg-destructive"
      : pct >= 75
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {used}/{limit}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminDashboard({ user }: { user: AppUser }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["users-summary"],
    queryFn: () => api.get<SummaryData>("/api/dashboard/users-summary"),
    refetchInterval: 30_000,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "salesman", activeProxyLimit: 4 },
  });

  const createMutation = useMutation({
    mutationFn: (d: CreateUserForm) => api.post("/api/users", d),
    onSuccess: () => {
      toast.success("User created");
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      reset();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ uid, updates }: { uid: string; updates: Record<string, unknown> }) =>
      api.patch(`/api/users/${uid}`, updates),
    onSuccess: () => {
      toast.success("User updated");
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const { totals } = data ?? {};

  const filteredStats = data?.stats.filter((s) => {
    const matchRole = roleFilter === "all" || s.role === roleFilter;
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchStatus && matchSearch;
  });

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    manager: "Manager/Director",
    salesman: "Salesman",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin Control Panel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage users, proxies, and phone numbers
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New User
          </Button>
        </div>
      </div>

      {/* Global stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Users"
          value={totals?.users.active}
          sub={`${totals?.users.disabled ?? 0} disabled`}
          icon={Users}
          loading={isLoading}
        />
        <StatCard
          label="Proxies in Stock"
          value={totals?.proxies.available}
          sub={`${totals?.proxies.assigned ?? 0} assigned`}
          icon={Shield}
          accent="text-emerald-600"
          loading={isLoading}
        />
        <StatCard
          label="Numbers in Stock"
          value={totals?.phones.available}
          sub={`${totals?.phones.assigned ?? 0} assigned`}
          icon={Phone}
          accent="text-emerald-600"
          loading={isLoading}
        />
        <StatCard
          label="Flagged / Expired"
          value={(totals?.proxies.flagged ?? 0) + (totals?.proxies.expired ?? 0)}
          sub="Proxies needing action"
          icon={AlertTriangle}
          accent={(totals?.proxies.flagged ?? 0) + (totals?.proxies.expired ?? 0) > 0 ? "text-amber-600" : undefined}
          loading={isLoading}
        />
      </div>

      {/* Quick-action links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <LinkButton
          href="/proxies"
          variant="outline"
          className="h-auto py-4 flex-col gap-1 items-start px-4"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-medium">Proxy Inventory</span>
          </div>
          <span className="text-xs text-muted-foreground font-normal">
            View, assign, revoke, retire proxies
          </span>
        </LinkButton>
        <LinkButton
          href="/phone-numbers"
          variant="outline"
          className="h-auto py-4 flex-col gap-1 items-start px-4"
        >
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="font-medium">Phone Inventory</span>
          </div>
          <span className="text-xs text-muted-foreground font-normal">
            View, assign, revoke, retire numbers
          </span>
        </LinkButton>
        <LinkButton
          href="/emails"
          variant="outline"
          className="h-auto py-4 flex-col gap-1 items-start px-4"
        >
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium">Email Inventory</span>
          </div>
          <span className="text-xs text-muted-foreground font-normal">
            View, assign, import email accounts
          </span>
        </LinkButton>
      </div>

      {/* Per-user usage table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              User Proxy Usage
            </CardTitle>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search users…"
                  className="pl-8 h-7 text-xs w-44"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {/* Role filter */}
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="salesman">Salesman</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proxy Usage</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-center">Flagged</TableHead>
                  <TableHead className="text-center">Expired</TableHead>
                  <TableHead className="text-center">Phones</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !filteredStats?.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-40">
                      <EmptyState icon={Users} title="No users found" description="Try adjusting your filters or create a new user." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStats.map((s) => (
                    <TableRow key={s.uid} className="group">
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground">{s.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{ROLE_LABELS[s.role]}</span>
                      </TableCell>
                      <TableCell>
                        {s.status === "active" ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5 border">
                            <UserCheck className="h-3 w-3 mr-1" />Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] h-5">
                            <UserX className="h-3 w-3 mr-1" />Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <UsageBar used={s.activeProxies} limit={s.activeProxyLimit} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          s.activeProxies > 0 ? "text-blue-600" : "text-muted-foreground"
                        )}>
                          {s.activeProxies}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          s.flaggedProxies > 0 ? "text-amber-600" : "text-muted-foreground"
                        )}>
                          {s.flaggedProxies}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          s.expiredProxies > 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {s.expiredProxies}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          s.activePhones > 0 ? "text-blue-600" : "text-muted-foreground"
                        )}>
                          {s.activePhones}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 opacity-0 group-hover:opacity-100")}>
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { window.location.href = `/proxies?assignedTo=${s.uid}`; }}>
                              View proxies
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { window.location.href = `/phone-numbers?assignedTo=${s.uid}`; }}>
                              View numbers
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => updateMutation.mutate({ uid: s.uid, updates: { role: "salesman" } })}
                            >
                              Set as Salesman
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateMutation.mutate({ uid: s.uid, updates: { role: "manager" } })}
                            >
                              Set as Manager
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {s.status === "active" ? (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => updateMutation.mutate({ uid: s.uid, updates: { status: "disabled" } })}
                              >
                                Disable account
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => updateMutation.mutate({ uid: s.uid, updates: { status: "active" } })}
                              >
                                Enable account
                              </DropdownMenuItem>
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
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate({ ...d, activeProxyLimit: d.activeProxyLimit ?? 4 }))} className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="Jane Doe" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="jane@company.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="Min. 8 characters" {...register("password")} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select defaultValue="salesman" onValueChange={(v) => setValue("role", (v ?? "salesman") as "admin" | "manager" | "salesman")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salesman">Salesman</SelectItem>
                    <SelectItem value="manager">Manager/Director</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Proxy Limit</Label>
                <Input type="number" min={1} max={20} defaultValue={4} {...register("activeProxyLimit")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); reset(); }}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
