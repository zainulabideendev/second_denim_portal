"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

interface AutoSyncResult {
  paired: number;
  freshProxies: number;
  freshEmails: number;
}

export function AutoSyncButton() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post<AutoSyncResult>("/api/sync/auto", {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });

      if (result.paired === 0) {
        toast.info(
          `No pairs created — ${result.freshProxies} fresh proxy(ies) and ${result.freshEmails} fresh email(s) available (unsynced).`
        );
        return;
      }

      const leftover =
        result.freshProxies !== result.freshEmails
          ? ` ${Math.abs(result.freshProxies - result.freshEmails)} item(s) left unmatched.`
          : "";

      toast.success(
        `Auto-synced ${result.paired} proxy–email pair(s).${leftover}`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <Link2 className="h-3.5 w-3.5 mr-1.5" />
      {mutation.isPending ? "Syncing…" : "Auto Sync Fresh"}
    </Button>
  );
}
