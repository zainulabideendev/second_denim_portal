"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Proxy, Email, PhoneNumber, AppUser, Country } from "@/lib/types";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { AddGmailDialog } from "@/components/add-gmail-dialog";
import { AddPhoneToProxyDialog } from "@/components/add-phone-to-proxy-dialog";
import { LinkAcnToProxyDialog } from "@/components/link-acn-to-proxy-dialog";
import { SyncEmailDialog } from "@/components/sync-dialogs";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { normalizeLane } from "@/lib/pool-utils";
import { Copy, Eye, EyeOff, Link2, Link2Off, Mail, Pencil, Phone, RefreshCw, UserPlus } from "lucide-react";
import { AcnLinkTimer } from "@/components/ui/acn-link-timer";
import { toast } from "sonner";

function proxyCredentialsString(p: Pick<Proxy, "host" | "port" | "username" | "password">) {
  return `${p.host}:${p.port}:${p.username}:${p.password}`;
}

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
  const { appUser } = useAuth();
  const canChangeCountry = appUser?.role === "admin";
  const canManageLinks =
    appUser?.role === "admin" || appUser?.role === "manager";
  const canAddPhone =
    canManageLinks ||
    (appUser?.role === "salesman" &&
      !!proxy?.assignedTo &&
      proxy.assignedTo === appUser.uid);
  const canMarkNumberChanged =
    appUser?.role === "admin" ||
    appUser?.role === "manager" ||
    (appUser?.role === "salesman" &&
      !!proxy?.assignedTo &&
      proxy.assignedTo === appUser.uid);
  const [editing, setEditing] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState<Country>("UK");
  const [notes, setNotes] = useState("");
  const [vintedUsername, setVintedUsername] = useState("");
  const [vintedPassword, setVintedPassword] = useState("");
  const [saved, setSaved] = useState<Partial<Proxy> | null>(null);
  const [addGmailOpen, setAddGmailOpen] = useState(false);
  const [syncEmailOpen, setSyncEmailOpen] = useState(false);
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [linkAcnOpen, setLinkAcnOpen] = useState(false);
  const queryClient = useQueryClient();
  const view = proxy ? { ...proxy, ...saved } : null;

  const { data: emails } = useQuery({
    queryKey: ["emails"],
    queryFn: () => api.get<Email[]>("/api/emails"),
    enabled: canManageLinks && !!proxy,
  });

  useEffect(() => {
    if (!proxy) {
      setEditing(false);
      setSaved(null);
      setAddGmailOpen(false);
      setSyncEmailOpen(false);
      setAddPhoneOpen(false);
      setLinkAcnOpen(false);
      return;
    }
    setHost(proxy.host);
    setPort(proxy.port);
    setUsername(proxy.username);
    setPassword(proxy.password);
    setCountry(proxy.country as Country);
    setNotes(proxy.notes ?? "");
    setVintedUsername(proxy.vintedUsername ?? "");
    setVintedPassword(proxy.vintedPassword ?? "");
    setEditing(false);
    setSaved(null);
  }, [proxy?.id]);

  async function refreshFromList() {
    if (!proxy) return;
    try {
      const list = await queryClient.fetchQuery({
        queryKey: ["proxies"],
        queryFn: () => api.get<Proxy[]>("/api/proxies"),
      });
      const updated = list.find((p) => p.id === proxy.id);
      if (updated) setSaved(updated);
    } catch {
      /* ignore — list invalidate still runs in dialogs */
    }
  }

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
        ...(canChangeCountry ? { country } : {}),
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

  const markNumberChangedMutation = useMutation({
    mutationFn: () =>
      api.post<{
        proxyId: string;
        accountCreationNumberId: string;
        number: string | null;
        status: string;
      }>(`/api/proxies/${proxy!.id}/mark-number-changed`, {}),
    onSuccess: () => {
      toast.success("Number set to available — unlinked from this proxy");
      setSaved((prev) => ({
        ...(view ?? {}),
        ...prev,
        accountCreationNumberId: null,
        accountCreationNumber: null,
        accountCreationNumberStatus: null,
      }));
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
      queryClient.invalidateQueries({ queryKey: ["account-creation-numbers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave =
    host.trim().length > 0 &&
    port.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0 &&
    !mutation.isPending;

  const salesmanPhoneActions = canAddPhone && !canManageLinks && view && (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Phone number
      </p>
      <div className="text-sm">
        {view.phoneNumber ? (
          <p className="font-mono text-xs truncate">{view.phoneNumber}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No phone linked</p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setAddPhoneOpen(true)}
      >
        <Phone className="h-3.5 w-3.5 mr-1.5" />
        {view.phoneNumber ? "Replace phone" : "Add phone"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Add a temporary or permanent number. It will appear under Phone numbers
        and link to this proxy.
      </p>
    </div>
  );

  const linkActions = canManageLinks && view && (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Linked accounts
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Email</p>
            {view.syncedEmail ? (
              <p className="font-mono text-xs truncate">{view.syncedEmail.email}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Not linked</p>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Phone</p>
            {view.phoneNumber ? (
              <p className="font-mono text-xs truncate">{view.phoneNumber}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Not linked</p>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Account creation number</p>
            {view.accountCreationNumber ? (
              <p className="font-mono text-xs truncate">
                {view.accountCreationNumber}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Not linked</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAddGmailOpen(true)}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />
          Add Gmail
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setSyncEmailOpen(true)}
        >
          <Link2 className="h-3.5 w-3.5 mr-1.5" />
          Sync from inventory
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setAddPhoneOpen(true)}
        >
          <Phone className="h-3.5 w-3.5 mr-1.5" />
          Add phone
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setLinkAcnOpen(true)}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          {view.accountCreationNumber
            ? "Change creation number"
            : "Link creation number"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
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
                {canChangeCountry && (
                  <div className="space-y-1.5">
                    <Label>Country</Label>
                    <Select
                      value={country}
                      onValueChange={(v) => setCountry((v ?? country) as Country)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{COUNTRY_LABELS[country]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {COUNTRY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                {linkActions}
                {salesmanPhoneActions}
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
            <DetailRow label="Proxy details">
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground break-all">
                  {view.host}:{view.port}:{view.username}:••••••••
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      proxyCredentialsString(view)
                    );
                    toast.success("Proxy details copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy proxy details
                </Button>
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
            <DetailRow label="Phone number">
              {view.phoneNumber ? (
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="break-all">{view.phoneNumber}</span>
                  <CopyButton value={view.phoneNumber} />
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Creation number">
              {view.accountCreationNumber ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 font-mono text-xs">
                    <span className="break-all">{view.accountCreationNumber}</span>
                    <CopyButton value={view.accountCreationNumber} />
                  </div>
                  <AcnLinkTimer
                    linkedAt={view.accountCreationNumberLinkedAt}
                  />
                  {canMarkNumberChanged && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={markNumberChangedMutation.isPending}
                      onClick={() => markNumberChangedMutation.mutate()}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      {markNumberChangedMutation.isPending
                        ? "Updating…"
                        : "Mark number changed"}
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    After you change this number on the Vinted account, mark it
                    so it becomes available for another proxy.
                  </p>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            {canManageLinks && (
              <div className="py-2">{linkActions}</div>
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
        {proxy && view && (
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      proxyCredentialsString(view)
                    );
                    toast.success("Proxy details copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy proxy details
                </Button>
                {editable && (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit details
                  </Button>
                )}
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>

    {canManageLinks && (
      <>
        <AddGmailDialog
          proxy={addGmailOpen ? view : null}
          onClose={() => setAddGmailOpen(false)}
          onSaved={async (data) => {
            setSaved((prev) => ({
              ...(view ?? {}),
              ...prev,
              syncedEmailId: data.emailId,
              syncedEmail: {
                id: data.emailId,
                email: data.email,
                password: "",
              },
            }));
            await refreshFromList();
          }}
        />
        <SyncEmailDialog
          proxy={syncEmailOpen ? view : null}
          emails={emails ?? []}
          onClose={() => setSyncEmailOpen(false)}
          onSaved={() => {
            void refreshFromList();
          }}
        />
        <LinkAcnToProxyDialog
          proxy={linkAcnOpen ? view : null}
          onClose={() => setLinkAcnOpen(false)}
          onSaved={async (data) => {
            setSaved((prev) => ({
              ...(view ?? {}),
              ...prev,
              accountCreationNumberId: data.accountCreationNumberId,
              accountCreationNumber: data.number,
              accountCreationNumberLinkedAt: data.linkedAt ?? new Date().toISOString(),
            }));
            await refreshFromList();
          }}
        />
      </>
    )}
    {canAddPhone && (
      <AddPhoneToProxyDialog
        proxy={addPhoneOpen ? view : null}
        onClose={() => setAddPhoneOpen(false)}
        onSaved={async (data) => {
          setSaved((prev) => ({
            ...(view ?? {}),
            ...prev,
            phoneId: data.phoneId,
            phoneNumber: data.number,
          }));
          if (canManageLinks) await refreshFromList();
          else {
            queryClient.invalidateQueries({ queryKey: ["my-proxies"] });
            queryClient.invalidateQueries({ queryKey: ["phones"] });
          }
        }}
      />
    )}
    </>
  );
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function EmailDetailSheet({
  email,
  user,
  onClose,
  editable = false,
}: {
  email: Email | null;
  user?: AppUser;
  onClose: () => void;
  editable?: boolean;
}) {
  const { appUser } = useAuth();
  const canEdit =
    editable && (appUser?.role === "admin" || appUser?.role === "manager");
  const [editing, setEditing] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [saved, setSaved] = useState<Partial<Email> | null>(null);
  const queryClient = useQueryClient();
  const view = email ? { ...email, ...saved } : null;

  useEffect(() => {
    if (!email) {
      setEditing(false);
      setSaved(null);
      return;
    }
    setEmailValue(email.email);
    setPasswordValue(email.password);
    setNotesValue(email.notes ?? "");
    setEditing(false);
    setSaved(null);
  }, [email?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<Email>(`/api/emails/${email!.id}`, {
        email: emailValue.trim().toLowerCase(),
        password: passwordValue,
        notes: notesValue,
      }),
    onSuccess: (data) => {
      toast.success("Email details saved");
      setSaved(data);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      setEditing(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave =
    emailValue.trim().length > 0 &&
    passwordValue.length > 0 &&
    !mutation.isPending;

  return (
    <Sheet open={!!email} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Email details</SheetTitle>
          <SheetDescription className="font-mono break-all">
            {view?.email}
          </SheetDescription>
        </SheetHeader>
        {view && (
          <SheetBody className="space-y-1">
            {editing ? (
              <div className="space-y-3 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="email-address">Email</Label>
                  <Input
                    id="email-address"
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-password">Password</Label>
                  <Input
                    id="email-password"
                    type="text"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-notes">Notes</Label>
                  <Textarea
                    id="email-notes"
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <>
            <DetailRow label="Email">
              <div className="flex items-center gap-1 font-mono text-xs">
                <span className="break-all">{view.email}</span>
                <CopyButton value={view.email} />
              </div>
            </DetailRow>
            <DetailRow label="Password">
              <SecretValue value={view.password} />
            </DetailRow>
            <Separator className="my-2" />
            <DetailRow label="Status">
              <StatusBadge status={view.status} />
            </DetailRow>
            <DetailRow label="Assigned to">
              <AssignedUserBlock user={user} />
            </DetailRow>
            <DetailRow label="Proxy sync">
              {view.syncedProxy ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Link2 className="h-3 w-3" /> Synced
                  </span>
                  <p className="font-mono text-xs">
                    {view.syncedProxy.host}:{view.syncedProxy.port}
                  </p>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Link2Off className="h-3 w-3" /> Not synced
                </span>
              )}
            </DetailRow>
            {view.notes && (
              <DetailRow label="Notes">
                <span className="text-xs">{view.notes}</span>
              </DetailRow>
            )}
            <DetailRow label="Created">
              <span>{formatDate(view.createdAt)}</span>
            </DetailRow>
            <DetailRow label="ID">
              <span className="font-mono text-[10px] text-muted-foreground break-all">{view.id}</span>
            </DetailRow>
              </>
            )}
          </SheetBody>
        )}
        {email && canEdit && (
          <SheetFooter>
            {editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button disabled={!canSave} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit email &amp; password
              </Button>
            )}
          </SheetFooter>
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
