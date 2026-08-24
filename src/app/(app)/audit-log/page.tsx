"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import { formatRelative, formatDate } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";

const actionColors: Record<string, string> = {
  "proxy.assigned": "bg-blue-50 text-blue-700",
  "proxy.revoked": "bg-amber-50 text-amber-700",
  "proxy.flagged": "bg-orange-50 text-orange-700",
  "proxy.expired": "bg-zinc-100 text-zinc-600",
  "proxy.retired": "bg-zinc-100 text-zinc-600",
  "proxy.imported": "bg-emerald-50 text-emerald-700",
  "phone.assigned": "bg-blue-50 text-blue-700",
  "phone.revoked": "bg-amber-50 text-amber-700",
  "phone.flagged": "bg-orange-50 text-orange-700",
  "phone.expired": "bg-zinc-100 text-zinc-600",
  "phone.imported": "bg-emerald-50 text-emerald-700",
  "request.created": "bg-purple-50 text-purple-700",
  "request.approved": "bg-emerald-50 text-emerald-700",
  "request.rejected": "bg-red-50 text-red-700",
  "request.fulfilled": "bg-emerald-50 text-emerald-700",
  "user.created": "bg-blue-50 text-blue-700",
  "user.updated": "bg-amber-50 text-amber-700",
  "user.disabled": "bg-red-50 text-red-700",
};

export default function AuditLogPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => api.get<AuditLogEntry[]>("/api/audit-log"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All state-changing actions across the system
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !logs?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48">
                  <EmptyState icon={FileText} title="No audit log entries" description="Actions will appear here once users start using the system." />
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border-0 px-2 py-0.5 text-xs font-medium ${actionColors[log.action] ?? "bg-muted text-muted-foreground"}`}>
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{log.actorName}</TableCell>
                  <TableCell className="text-xs">
                    <span className="capitalize">{log.targetType}</span>
                    <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                      {log.targetId.slice(0, 8)}…
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate">
                    {Object.entries(log.metadata)
                      .filter(([, v]) => v !== null && v !== undefined)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelative(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
