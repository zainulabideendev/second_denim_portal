"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy, Email, PhoneNumber, AppUser, Country } from "@/lib/types";
import { COUNTRY_LABELS } from "@/lib/types";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from "@/components/ui/sheet";
import { CountryBadge } from "@/components/ui/country-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { normalizeLane } from "@/lib/pool-utils";
import { Eye, EyeOff, Link2, Link2Off, Pencil } from "lucide-react";
import { toast } from "sonner";

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
  editable = false,
}: {
  proxy: Proxy | null;
  user?: AppUser;
  onClose: () => void;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [vintedUsername, setVintedUsername] = useState("");
  const [vintedPassword, setVintedPassword] = useState("");
  const [saved, setSaved] = useState<Partial<Proxy> | null>(null);
  const queryClient = useQueryClient();
  const view = proxy ? { ...proxy, ...saved } : null;

  useEffect(() => {
    if (!proxy) {
      setEditing(false);
      setSaved(null);
      return;
    }
    setHost(proxy.host);
    setPort(proxy.port);
    setUsername(proxy.username);
    setPassword(proxy.password);
    setNotes(proxy.notes ?? "");
    setVintedUsername(proxy.vintedUsername ?? "");
    setVintedPassword(proxy.vintedPassword ?? "");
    setEditing(false);
    setSaved(null);
  }, [proxy?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<Proxy>(`/api/proxies/${proxy!.id}`, {
        host: host.trim(),
        port: port.trim(),
        username: username.trim(),
        password,
        notes,
        vintedUsername: vintedUsername.trim(),
        vintedPassword,
      }),
    onSuccess: (data) => {
      toast.success("Proxy details saved");
      setSaved(data);
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      setEditing(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave =
    host.trim().length > 0 &&
    port.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0 &&
    !mutation.isPending;

  return (
    <Sheet open={!!proxy} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Proxy details</SheetTitle>
          <SheetDescription className="font-mono">
            {view ? `${view.host}:${view.port}` : ""}
          </SheetDescription>
        </SheetHeader>
        {view && (
          <SheetBody className="space-y-1">
            {editing ? (
              <div className="space-y-3 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="proxy-host">Host</Label>
                    <Input id="proxy-host" value={host} onChange={(e) => setHost(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proxy-port">Port</Label>
                    <Input id="proxy-port" value={port} onChange={(e) => setPort(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proxy-username">Username</Label>
                  <Input id="proxy-username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proxy-password">Password</Label>
                  <Input id="proxy-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <Label htmlFor="vinted-username">Vinted username</Label>
                  <Input
                    id="vinted-username"
                    value={vintedUsername}
                    onChange={(e) => setVintedUsername(e.target.value)}
                    placeholder="Vinted account name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vinted-password">Vinted password</Label>
                  <Input
                    id="vinted-password"
                    value={vintedPassword}
                    onChange={(e) => setVintedPassword(e.target.value)}
                    placeholder="Vinted password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="proxy-notes">Notes</Label>
                  <Textarea
                    id="proxy-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <>
            <DetailRow label="Country">
              <CountryBadge country={view.country as Country} />
            </DetailRow>
            <DetailRow label="Host">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span>{view.host}:{view.port}</span>
                <CopyButton value={`${view.host}:${view.port}`} />
              </div>
            </DetailRow>
            <DetailRow label="Username">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span>{view.username}</span>
                <CopyButton value={view.username} />
              </div>
            </DetailRow>
            <DetailRow label="Password">
              <SecretValue value={view.password} />
            </DetailRow>
            <DetailRow label="Full string">
              <div className="flex items-center gap-1">
                <CopyButton
                  value={`${view.host}:${view.port}:${view.username}:${view.password}`}
                />
                <span className="text-xs text-muted-foreground">Copy credentials</span>
              </div>
            </DetailRow>
            <Separator className="my-2" />
            <DetailRow label="Provider">
              <span>{view.provider}</span>
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={view.status} />
            </DetailRow>
            {view.lane && (
              <DetailRow label="Lane">
                <span>{LANE_LABELS[view.lane] ?? view.lane}</span>
              </DetailRow>
            )}
            {view.lane && normalizeLane(view.lane) === "backup" && (
              <DetailRow label="Account created">
                <span>
                  {view.accountsCreated || view.stagingDone ? "Yes" : "No"}
                </span>
              </DetailRow>
            )}
            {view.lane && normalizeLane(view.lane) === "active" && (
              <DetailRow label="Restricted">
                <span>{view.restricted ? "Yes" : "No"}</span>
              </DetailRow>
            )}
            <DetailRow label="Assigned to">
              <AssignedUserBlock user={user} />
            </DetailRow>
            <DetailRow label="Email sync">
              {view.syncedEmail ? (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Link2 className="h-3 w-3" /> Synced
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="break-all">{view.syncedEmail.email}</span>
                    <CopyButton value={view.syncedEmail.email} />
                  </div>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2Off className="h-3 w-3" /> Not synced
                </span>
              )}
            </DetailRow>
            {view.syncedEmail && (
              <DetailRow label="Gmail password">
                <SecretValue value={view.syncedEmail.password} />
              </DetailRow>
            )}
            <Separator className="my-2" />
            <DetailRow label="Vinted user">
              {view.vintedUsername ? (
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="break-all">{view.vintedUsername}</span>
                  <CopyButton value={view.vintedUsername} />
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Vinted password">
              {view.vintedPassword ? (
                <SecretValue value={view.vintedPassword} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            {view.phoneNumber && (
              <DetailRow label="Phone number">
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="break-all">{view.phoneNumber}</span>
                  <CopyButton value={view.phoneNumber} />
                </div>
              </DetailRow>
            )}
            <Separator className="my-2" />
            <DetailRow label="Purchased">
              <span>{formatDate(view.purchasedAt)}</span>
            </DetailRow>
            <DetailRow label="Expires">
              <ExpiryBadge expiresAt={view.expiresAt} />
            </DetailRow>
            {view.notes && (
              <DetailRow label="Notes">
                <span className="text-xs">{view.notes}</span>
              </DetailRow>
            )}
            <DetailRow label="ID">
              <span className="font-mono text-[10px] text-muted-foreground break-all">{view.id}</span>
            </DetailRow>
              </>
            )}
          </SheetBody>
        )}
        {proxy && editable && (
          <SheetFooter>
            {editing ? (
              <>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={mutation.isPending}>
                  Cancel
                </Button>
                <Button disabled={!canSave} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit details
              </Button>
            )}
          </SheetFooter>
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
            {phone.proxy ? (
              <DetailRow label="Linked proxy">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-mono text-xs">
                    <span>{phone.proxy.host}:{phone.proxy.port}</span>
                    <CopyButton value={`${phone.proxy.host}:${phone.proxy.port}`} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {COUNTRY_LABELS[phone.proxy.country as Country]}
                  </p>
                </div>
              </DetailRow>
            ) : phone.proxyId ? (
              <DetailRow label="Proxy ID">
                <span className="font-mono text-xs text-muted-foreground">{phone.proxyId}</span>
              </DetailRow>
            ) : null}
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
