"use client";

import React, { useState } from "react";
import type { Proxy, Email, PhoneNumber, AppUser, Country } from "@/lib/types";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody,
} from "@/components/ui/sheet";
import { CountryBadge } from "@/components/ui/country-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { normalizeLane } from "@/lib/pool-utils";
import { Eye, EyeOff, Link2, Link2Off } from "lucide-react";

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[120px_1fr] gap-3 py-2.5 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SecretValue({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <span className="break-all">{show ? value : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyButton value={value} />
    </div>
  );
}

function AssignedUserBlock({ user }: { user?: AppUser }) {
  if (!user) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <p className="font-medium">{user.name}</p>
      <p className="text-xs text-muted-foreground">{user.email}</p>
    </div>
  );
}

const LANE_LABELS: Record<string, string> = {
  backup: "Backup",
  active: "Active",
  fresh: "Backup",
  staging: "Backup",
};

// ─── Proxy ────────────────────────────────────────────────────────────────────

export function ProxyDetailSheet({
  proxy,
  user,
  onClose,
}: {
  proxy: Proxy | null;
  user?: AppUser;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!proxy} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Proxy details</SheetTitle>
          <SheetDescription className="font-mono">
            {proxy ? `${proxy.host}:${proxy.port}` : ""}
          </SheetDescription>
        </SheetHeader>
        {proxy && (
          <SheetBody className="space-y-1">
            <DetailRow label="Country">
              <CountryBadge country={proxy.country as Country} />
            </DetailRow>
            <DetailRow label="Host">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span>{proxy.host}:{proxy.port}</span>
                <CopyButton value={`${proxy.host}:${proxy.port}`} />
              </div>
            </DetailRow>
            <DetailRow label="Username">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span>{proxy.username}</span>
                <CopyButton value={proxy.username} />
              </div>
            </DetailRow>
            <DetailRow label="Password">
              <SecretValue value={proxy.password} />
            </DetailRow>
            <DetailRow label="Full string">
              <div className="flex items-center gap-1">
                <CopyButton
                  value={`${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`}
                />
                <span className="text-xs text-muted-foreground">Copy credentials</span>
              </div>
            </DetailRow>
            <Separator className="my-2" />
            <DetailRow label="Provider">
              <span>{proxy.provider}</span>
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={proxy.status} />
            </DetailRow>
            {proxy.lane && (
              <DetailRow label="Lane">
                <span>{LANE_LABELS[proxy.lane] ?? proxy.lane}</span>
              </DetailRow>
            )}
            {proxy.lane && normalizeLane(proxy.lane) === "backup" && (
              <DetailRow label="Account created">
                <span>
                  {proxy.accountsCreated || proxy.stagingDone ? "Yes" : "No"}
                </span>
              </DetailRow>
            )}
            {proxy.lane && normalizeLane(proxy.lane) === "active" && (
              <DetailRow label="Restricted">
                <span>{proxy.restricted ? "Yes" : "No"}</span>
              </DetailRow>
            )}
            <DetailRow label="Assigned to">
              <AssignedUserBlock user={user} />
            </DetailRow>
            <DetailRow label="Email sync">
              {proxy.syncedEmail ? (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Link2 className="h-3 w-3" /> Synced
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="break-all">{proxy.syncedEmail.email}</span>
                    <CopyButton value={proxy.syncedEmail.email} />
                  </div>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2Off className="h-3 w-3" /> Not synced
                </span>
              )}
            </DetailRow>
            {proxy.syncedEmail && (
              <DetailRow label="Gmail password">
                <SecretValue value={proxy.syncedEmail.password} />
              </DetailRow>
            )}
            <Separator className="my-2" />
            <DetailRow label="Purchased">
              <span>{formatDate(proxy.purchasedAt)}</span>
            </DetailRow>
            <DetailRow label="Expires">
              <ExpiryBadge expiresAt={proxy.expiresAt} />
            </DetailRow>
            {proxy.notes && (
              <DetailRow label="Notes">
                <span className="text-xs">{proxy.notes}</span>
              </DetailRow>
            )}
            <DetailRow label="ID">
              <span className="font-mono text-[10px] text-muted-foreground break-all">{proxy.id}</span>
            </DetailRow>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function EmailDetailSheet({
  email,
  user,
  onClose,
}: {
  email: Email | null;
  user?: AppUser;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!email} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Email details</SheetTitle>
          <SheetDescription className="font-mono break-all">
            {email?.email}
          </SheetDescription>
        </SheetHeader>
        {email && (
          <SheetBody className="space-y-1">
            <DetailRow label="Email">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span className="break-all">{email.email}</span>
                <CopyButton value={email.email} />
              </div>
            </DetailRow>
            <DetailRow label="Password">
              <SecretValue value={email.password} />
            </DetailRow>
            <Separator className="my-2" />
            <DetailRow label="Status">
              <StatusBadge status={email.status} />
            </DetailRow>
            <DetailRow label="Assigned to">
              <AssignedUserBlock user={user} />
            </DetailRow>
            <DetailRow label="Proxy sync">
              {email.syncedProxy ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Link2 className="h-3 w-3" /> Synced
                  </span>
                  <p className="font-mono text-xs">
                    {email.syncedProxy.host}:{email.syncedProxy.port}
                  </p>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2Off className="h-3 w-3" /> Not synced
                </span>
              )}
            </DetailRow>
            {email.notes && (
              <DetailRow label="Notes">
                <span className="text-xs">{email.notes}</span>
              </DetailRow>
            )}
            <DetailRow label="Created">
              <span>{formatDate(email.createdAt)}</span>
            </DetailRow>
            <DetailRow label="ID">
              <span className="font-mono text-[10px] text-muted-foreground break-all">{email.id}</span>
            </DetailRow>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Phone ────────────────────────────────────────────────────────────────────

export function PhoneDetailSheet({
  phone,
  user,
  onClose,
}: {
  phone: PhoneNumber | null;
  user?: AppUser;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!phone} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Phone details</SheetTitle>
          <SheetDescription className="font-mono">
            {phone?.number}
          </SheetDescription>
        </SheetHeader>
        {phone && (
          <SheetBody className="space-y-1">
            <DetailRow label="Country">
              <CountryBadge country={phone.country as Country} />
            </DetailRow>
            <DetailRow label="Number">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span>{phone.number}</span>
                <CopyButton value={phone.number} />
              </div>
            </DetailRow>
            <DetailRow label="Provider">
              <span>{phone.provider}</span>
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={phone.status} />
            </DetailRow>
            <DetailRow label="Assigned to">
              <AssignedUserBlock user={user} />
            </DetailRow>
            <Separator className="my-2" />
            <DetailRow label="Purchased">
              <span>{formatDate(phone.purchasedAt)}</span>
            </DetailRow>
            <DetailRow label="Expires">
              <ExpiryBadge expiresAt={phone.expiresAt} />
            </DetailRow>
            {phone.notes && (
              <DetailRow label="Notes">
                <span className="text-xs">{phone.notes}</span>
              </DetailRow>
            )}
            <DetailRow label="ID">
              <span className="font-mono text-[10px] text-muted-foreground break-all">{phone.id}</span>
            </DetailRow>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}
