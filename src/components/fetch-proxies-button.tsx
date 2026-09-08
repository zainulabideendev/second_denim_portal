"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface FetchProxyCheapResult {
  fetched: number;
  created: number;
  skippedExisting: number;
  skippedOther: number;
  accountsUsed: string[];
  byAccount: Array<{
    accountId: string;
    country: string;
    fetched: number;
    skippedOther: number;
    error?: string;
  }>;
}

export function FetchProxiesButton() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post<FetchProxyCheapResult>("/api/proxies/fetch-proxy-cheap", {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["proxies"] });

      const accountErrors = result.byAccount?.filter((a) => a.error) ?? [];
      if (accountErrors.length) {
        toast.warning(
          `Partial sync: ${accountErrors.map((a) => `${a.accountId} failed`).join(", ")}`
        );
      }

      if (result.created === 0) {
        toast.info(
          `No new proxies — fetched ${result.fetched}, ${result.skippedExisting} already in inventory.`
        );
        return;
      }

      toast.success(
        `Fetched ${result.fetched} · added ${result.created} new · skipped ${result.skippedExisting} existing` +
          (result.accountsUsed?.length
            ? ` · ${result.byAccount
                ?.map((a) => `${a.accountId}:${a.fetched}`)
                .join(" ")}`
            : "")
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
      <Download className="h-3.5 w-3.5 mr-1.5" />
      {mutation.isPending ? "Fetching…" : "Fetch Proxies"}
    </Button>
  );
}
