"use client";

import React, { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Notification } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell } from "lucide-react";
import { formatRelative } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, string> = {
  request_pending: "📋",
  request_reviewed: "✅",
  proxy_flagged: "⚠️",
  expiry_warning: "⏰",
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/api/notifications"),
  });

  const markReadMutation = useMutation({
    mutationFn: () => fetch("/api/notifications", { method: "PATCH" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Mark all as read when page opens
  useEffect(() => {
    const unread = notifications?.filter((n) => !n.read) ?? [];
    if (unread.length > 0) {
      markReadMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications?.length]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your recent in-app notifications
          </p>
        </div>
        {(notifications?.filter((n) => !n.read).length ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markReadMutation.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !notifications?.length ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll receive notifications here for requests, approvals, and expiry warnings."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={cn(
                "border-border transition-colors",
                !n.read && "border-primary/30 bg-primary/5"
              )}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <span className="text-xl mt-0.5">{typeIcons[n.type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
