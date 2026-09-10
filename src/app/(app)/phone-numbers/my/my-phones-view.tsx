"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, PhoneAccountStatus, PhoneNumber } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import {
  PHONE_ACCOUNT_STATUSES,
  PHONE_ACCOUNT_STATUS_LABELS,
  normalizePhoneStatus,
} from "@/lib/phone-utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Phone, Plus, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/date-utils";
import type { Country } from "@/lib/types";
import { SalesmanPage, SalesmanPageHeader, SectionCard } from "@/components/salesman/ui";
import { AddPhoneDrawer } from "../add-phone-drawer";

interface Props {
  user: AppUser;
}

function PhoneCard({ phone }: { phone: PhoneNumber }) {
  const queryClient = useQueryClient();
  const country = phone.country as Country;
  const currentStatus = normalizePhoneStatus(phone.status);
  const accountStatus: PhoneAccountStatus =
    currentStatus === "inactive" ? "inactive" : "active";

  const statusMutation = useMutation({
    mutationFn: (status: PhoneAccountStatus) =>
      api.post(`/api/phone-numbers/${phone.id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["my-phones"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="border-border/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold">{COUNTRY_LABELS[country]}</p>
            <p className="text-[11px] text-muted-foreground">{phone.provider}</p>
          </div>
          <StatusBadge status={phone.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-muted/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Number</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs font-medium">{phone.number}</span>
              <CopyButton value={phone.number} />
            </div>
          </div>
          {phone.proxy ? (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Shield className="h-3 w-3 text-emerald-600" />
                Proxy
              </span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs font-medium text-foreground">
                  {phone.proxy.host}:{phone.proxy.port}
                </span>
                <CopyButton value={`${phone.proxy.host}:${phone.proxy.port}`} />
              </div>
            </div>
          ) : phone.proxyId ? (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Shield className="h-3 w-3 text-muted-foreground" />
                Proxy
              </span>
              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">
                {phone.proxyId}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Purchased {formatDate(phone.purchasedAt)}</span>
          <ExpiryBadge expiresAt={phone.expiresAt} />
        </div>
        {phone.notes && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">{phone.notes}</p>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={accountStatus}
            onValueChange={(v) => statusMutation.mutate(v as PhoneAccountStatus)}
            disabled={statusMutation.isPending}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start" className="w-(--anchor-width) min-w-[160px]">
              {PHONE_ACCOUNT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PHONE_ACCOUNT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyPhonesView({ user }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: phones, isLoading } = useQuery({
    queryKey: ["my-phones"],
    queryFn: () => api.get<PhoneNumber[]>("/api/phone-numbers/mine"),
  });

  return (
    <SalesmanPage>
      <SalesmanPageHeader
        title="My Numbers"
        description={`${phones?.length ?? 0} of ${user.activeProxyLimit} numbers assigned`}
        breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Numbers" }]}
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add number
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : !phones?.length ? (
        <SectionCard title="Your numbers" description="No numbers assigned yet">
          <EmptyState
            icon={Phone}
            title="No phone numbers yet"
            description="Add a phone number purchased for one of your assigned proxies."
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add number
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Assigned numbers"
          description="Update status: active or inactive"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {phones.map((phone) => (
              <PhoneCard key={phone.id} phone={phone} />
            ))}
          </div>
        </SectionCard>
      )}

      <AddPhoneDrawer open={addOpen} onClose={() => setAddOpen(false)} isSalesman />
    </SalesmanPage>
  );
}
