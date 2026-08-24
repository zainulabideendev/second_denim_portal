"use client";

import React from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/date-utils";
import type { Country } from "@/lib/types";
import { SalesmanPage, SalesmanPageHeader, SectionCard } from "@/components/salesman/ui";

interface Props {
  user: AppUser;
}

function PhoneCard({ phone }: { phone: PhoneNumber }) {
  const queryClient = useQueryClient();
  const country = phone.country as Country;
  const currentStatus = normalizePhoneStatus(phone.status);
  const accountStatus: PhoneAccountStatus =
    currentStatus === "banned" ||
    currentStatus === "banned_with_balance" ||
    currentStatus === "active"
      ? currentStatus
      : "active";

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
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            description="Your manager will assign numbers when you need them."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Assigned numbers"
          description="Update status: active, banned, or banned with balance"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {phones.map((phone) => (
              <PhoneCard key={phone.id} phone={phone} />
            ))}
          </div>
        </SectionCard>
      )}
    </SalesmanPage>
  );
}
