"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { UserCountryPoolRow } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Layers, Plus, RefreshCw, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { CreatePoolDrawer } from "./create-pool-drawer";
import { EditPoolDrawer } from "./edit-pool-drawer";
import { AssignPoolProxyDrawer } from "./assign-pool-proxy-drawer";

export function PoolsAdminView() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editPool, setEditPool] = useState<UserCountryPoolRow | null>(null);
  const [assignPool, setAssignPool] = useState<UserCountryPoolRow | null>(null);

  const { data: pools, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pools"],
    queryFn: () => api.get<UserCountryPoolRow[]>("/api/pools"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {pools?.length
            ? `${pools.length} pool assignment(s)`
            : "No pools created yet"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create Pool
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>User</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Backup</TableHead>
              <TableHead>Total slots</TableHead>
              <TableHead>Fill status</TableHead>
              <TableHead>Lanes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !pools?.length ? (
              <TableRow>
                <TableCell colSpan={9} className="h-56">
                  <EmptyState
                    icon={Layers}
                    title="No pools yet"
                    description="Create a pool to assign country-based proxy lanes to your salesmen."
                    action={
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Create Pool
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              pools.map((pool) => {
                const backupLimit = pool.backupLimit ?? pool.sizePerLane * 2;
                const poolFull = pool.filled >= pool.total;
                return (
                  <TableRow
                    key={pool.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setEditPool(pool)}
                  >
                    <TableCell>
                      <p className="font-medium text-sm">{pool.userName}</p>
                      <p className="text-[11px] text-muted-foreground">{pool.userEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{COUNTRY_LABELS[pool.country]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{pool.sizePerLane}</TableCell>
                    <TableCell className="text-sm">{backupLimit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pool.total}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          pool.filled >= pool.total
                            ? "text-emerald-600"
                            : pool.filled > 0
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        )}
                      >
                        {pool.filled}/{pool.total}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      B {pool.byLane.backup} · A {pool.byLane.active}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(pool.createdAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={poolFull}
                        onClick={() => setAssignPool(pool)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Assign
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreatePoolDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditPoolDrawer
        pool={editPool}
        open={!!editPool}
        onClose={() => setEditPool(null)}
      />
      <AssignPoolProxyDrawer
        pool={assignPool}
        open={!!assignPool}
        onClose={() => setAssignPool(null)}
      />
    </div>
  );
}
