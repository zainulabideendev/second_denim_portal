"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy, Email } from "@/lib/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";

interface SyncEmailDialogProps {
  proxy: Proxy | null;
  emails: Email[];
  onClose: () => void;
}

export function SyncEmailDialog({ proxy, emails, onClose }: SyncEmailDialogProps) {
  const [emailId, setEmailId] = useState("");
  const queryClient = useQueryClient();

  const availableEmails = emails.filter(
    (e) => !e.syncedProxyId || e.syncedProxyId === proxy?.id
  );

  const syncMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/proxies/${proxy!.id}/sync-email`, { emailId: id }),
    onSuccess: () => {
      toast.success("Email synced with proxy");
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unsyncMutation = useMutation({
    mutationFn: () => api.delete(`/api/proxies/${proxy!.id}/sync-email`),
    onSuccess: () => {
      toast.success("Email unsynced");
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!proxy) return null;

  const isSynced = !!proxy.syncedEmailId;

  return (
    <Dialog open={!!proxy} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Sync Email with Proxy
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground font-mono">
            {proxy.host}:{proxy.port}
          </p>
          {isSynced && proxy.syncedEmail && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm">
              <p className="font-medium text-emerald-800">Currently synced</p>
              <p className="text-emerald-700 font-mono text-xs mt-1">{proxy.syncedEmail.email}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Select email to link</Label>
            <Select
              value={emailId || proxy.syncedEmailId || ""}
              onValueChange={(v) => setEmailId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an email…" />
              </SelectTrigger>
              <SelectContent>
                {availableEmails.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.email}
                    {e.syncedProxyId === proxy.id ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableEmails.length === 0 && (
              <p className="text-xs text-muted-foreground">No available emails to sync.</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {isSynced && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => unsyncMutation.mutate()}
              disabled={unsyncMutation.isPending}
            >
              <Unlink className="h-3.5 w-3.5 mr-1.5" />
              Unsync
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!emailId || syncMutation.isPending}
            onClick={() => syncMutation.mutate(emailId)}
          >
            {syncMutation.isPending ? "Syncing…" : "Sync Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SyncProxyDialogProps {
  email: Email | null;
  proxies: Proxy[];
  onClose: () => void;
}

export function SyncProxyDialog({ email, proxies, onClose }: SyncProxyDialogProps) {
  const [proxyId, setProxyId] = useState("");
  const queryClient = useQueryClient();

  const availableProxies = proxies.filter(
    (p) => !p.syncedEmailId || p.syncedEmailId === email?.id
  );

  const syncMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/emails/${email!.id}/sync-proxy`, { proxyId: id }),
    onSuccess: () => {
      toast.success("Proxy synced with email");
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unsyncMutation = useMutation({
    mutationFn: () => api.delete(`/api/emails/${email!.id}/sync-proxy`),
    onSuccess: () => {
      toast.success("Proxy unsynced");
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!email) return null;

  const isSynced = !!email.syncedProxyId;

  return (
    <Dialog open={!!email} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Sync Proxy with Email
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground font-mono">{email.email}</p>
          {isSynced && email.syncedProxy && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm">
              <p className="font-medium text-emerald-800">Currently synced</p>
              <p className="text-emerald-700 font-mono text-xs mt-1">
                {email.syncedProxy.host}:{email.syncedProxy.port}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Select proxy to link</Label>
            <Select
              value={proxyId || email.syncedProxyId || ""}
              onValueChange={(v) => setProxyId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a proxy…" />
              </SelectTrigger>
              <SelectContent>
                {availableProxies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.host}:{p.port}
                    {p.syncedEmailId === email.id ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {isSynced && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => unsyncMutation.mutate()}
              disabled={unsyncMutation.isPending}
            >
              <Unlink className="h-3.5 w-3.5 mr-1.5" />
              Unsync
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!proxyId || syncMutation.isPending}
            onClick={() => syncMutation.mutate(proxyId)}
          >
            {syncMutation.isPending ? "Syncing…" : "Sync Proxy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
