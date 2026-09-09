"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail } from "lucide-react";

interface AddGmailDialogProps {
  proxy: Proxy | null;
  onClose: () => void;
}

export function AddGmailDialog({ proxy, onClose }: AddGmailDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();

  function resetAndClose() {
    setEmail("");
    setPassword("");
    onClose();
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ emailId: string; proxyId: string; email: string; synced: boolean }>(
        `/api/proxies/${proxy!.id}/add-gmail`,
        { email: email.trim(), password }
      ),
    onSuccess: (data) => {
      toast.success(`Gmail saved and synced: ${data.email}`);
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      resetAndClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!proxy) return null;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !mutation.isPending;

  return (
    <Dialog
      open={!!proxy}
      onOpenChange={(v) => {
        if (!v) resetAndClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Add Gmail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground font-mono">
            {proxy.host}:{proxy.port}
          </p>
          {proxy.syncedEmail && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This proxy is already synced to{" "}
              <span className="font-mono">{proxy.syncedEmail.email}</span>. Adding a new
              Gmail will replace that sync.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="add-gmail-email">Gmail</Label>
            <Input
              id="add-gmail-email"
              type="email"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-gmail-password">Password</Label>
            <Input
              id="add-gmail-password"
              type="text"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save & Sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
