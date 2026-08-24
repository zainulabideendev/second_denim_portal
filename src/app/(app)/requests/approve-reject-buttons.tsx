"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  requestId: string;
  compact?: boolean;
}

export function ApproveRejectButtons({ requestId, compact }: Props) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["requests"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/requests/${requestId}/approve`, {}),
    onSuccess: () => {
      toast.success("Request approved and item assigned");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/requests/${requestId}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      toast.success("Request rejected");
      setShowRejectDialog(false);
      setRejectReason("");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (compact) {
    return (
      <div className="flex gap-1 shrink-0">
        <Button
          size="icon"
          className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
          title="Approve"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => setShowRejectDialog(true)}
          title="Reject"
        >
          <X className="h-3.5 w-3.5" />
        </Button>

        <RejectDialog
          open={showRejectDialog}
          onOpenChange={setShowRejectDialog}
          reason={rejectReason}
          setReason={setRejectReason}
          onConfirm={() => rejectMutation.mutate()}
          loading={rejectMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700"
        onClick={() => approveMutation.mutate()}
        disabled={approveMutation.isPending}
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => setShowRejectDialog(true)}
      >
        <X className="h-3.5 w-3.5 mr-1" />
        Reject
      </Button>

      <RejectDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        reason={rejectReason}
        setReason={setRejectReason}
        onConfirm={() => rejectMutation.mutate()}
        loading={rejectMutation.isPending}
      />
    </div>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  reason,
  setReason,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason: string;
  setReason: (v: string) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Reason (optional)</Label>
          <Textarea
            placeholder="Explain why this request is being rejected…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Rejecting…" : "Reject Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
