"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, Proxy, PhoneNumber } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  item: Proxy | PhoneNumber | null;
  type: "proxy" | "phone";
  users: AppUser[];
  onClose: () => void;
}

export function AssignDialog({ item, type, users, onClose }: Props) {
  const [selectedUid, setSelectedUid] = useState("");
  const queryClient = useQueryClient();
  const endpoint = type === "proxy" ? "proxies" : "phone-numbers";

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/${endpoint}/${item!.id}/assign`, { assignedTo: selectedUid }),
    onSuccess: () => {
      toast.success("Item assigned successfully");
      queryClient.invalidateQueries({ queryKey: [type === "proxy" ? "proxies" : "phones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      onClose();
      setSelectedUid("");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!item) return null;

  const salesmen = users.filter((u) => u.status === "active");

  return (
    <Dialog open={!!item} onOpenChange={() => { onClose(); setSelectedUid(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {type === "proxy" ? "Proxy" : "Phone Number"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Assign to user</Label>
              <Select value={selectedUid} onValueChange={(v) => setSelectedUid(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user…" />
              </SelectTrigger>
              <SelectContent>
                {salesmen.map((u) => (
                  <SelectItem key={u.uid} value={u.uid}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setSelectedUid(""); }}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedUid || mutation.isPending}
          >
            {mutation.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
