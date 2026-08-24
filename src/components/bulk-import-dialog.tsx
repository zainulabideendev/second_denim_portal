"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { COUNTRIES, COUNTRY_LABELS } from "@/lib/types";
import type { Country } from "@/lib/types";
import {
  type ImportKind,
  type ParsedProxyRow,
  type ParsedPhoneRow,
  type ParsedEmailRow,
  parseProxyCsv,
  parsePhoneCsv,
  parseEmailCsv,
  IMPORT_FORMATS,
  SAMPLE_CSV_PATHS,
} from "@/lib/csv-import";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Upload, FileUp, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "sonner";

interface BulkImportDialogProps {
  type: ImportKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TITLES: Record<ImportKind, string> = {
  proxy: "Import Proxies",
  phone: "Import Phone Numbers",
  email: "Import Emails",
};

const QUERY_KEYS: Record<ImportKind, string> = {
  proxy: "proxies",
  phone: "phones",
  email: "emails",
};

export function BulkImportDialog({ type, open, onOpenChange }: BulkImportDialogProps) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState("");
  const [defaultCountry, setDefaultCountry] = useState<Country>("UK");
  const [defaultProvider, setDefaultProvider] = useState("");
  const [rows, setRows] = useState<(ParsedProxyRow | ParsedPhoneRow | ParsedEmailRow)[] | null>(null);

  const queryClient = useQueryClient();

  function reset() {
    setStep("input");
    setRawText("");
    setFileName("");
    setRows(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const importMutation = useMutation({
    mutationFn: async (validRows: ParsedProxyRow[] | ParsedPhoneRow[] | ParsedEmailRow[]) => {
      if (type === "proxy") {
        return api.post<{ count: number }>("/api/proxies/import", {
          rows: validRows,
          rawFileName: fileName || "import.csv",
        });
      }
      if (type === "phone") {
        return api.post<{ count: number }>("/api/phone-numbers/import", {
          rows: validRows,
          rawFileName: fileName || "import.csv",
        });
      }
      return api.post<{ imported: number }>("/api/emails/import", { rows: validRows });
    },
    onSuccess: (data) => {
      const count = "count" in data ? data.count : data.imported;
      toast.success(`${count} ${type === "proxy" ? "proxies" : type === "phone" ? "numbers" : "emails"} imported`);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS[type]] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      handleClose(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setRawText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handlePreview() {
    if (!rawText.trim()) {
      toast.error("Paste or upload CSV data first");
      return;
    }
    if (type === "proxy") setRows(parseProxyCsv(rawText, defaultCountry, defaultProvider));
    else if (type === "phone") setRows(parsePhoneCsv(rawText, defaultCountry, defaultProvider));
    else setRows(parseEmailCsv(rawText));
    setStep("preview");
  }

  function handleConfirm() {
    const valid = rows?.filter((r) => !r._errors?.length) ?? [];
    if (!valid.length) {
      toast.error("No valid rows to import");
      return;
    }
    if (type === "proxy") importMutation.mutate(valid as ParsedProxyRow[]);
    else if (type === "phone") importMutation.mutate(valid as ParsedPhoneRow[]);
    else importMutation.mutate(valid as ParsedEmailRow[]);
  }

  const errorCount = rows?.filter((r) => r._errors?.length).length ?? 0;
  const validCount = (rows?.length ?? 0) - errorCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITLES[type]}</DialogTitle>
        </DialogHeader>

        {step === "input" ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">CSV columns:</p>
              <code className="font-mono">{IMPORT_FORMATS[type]}</code>
            </div>

            <a
              href={SAMPLE_CSV_PATHS[type]}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download sample CSV
            </a>

            {type !== "email" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Default country</Label>
                  <Select value={defaultCountry} onValueChange={(v) => setDefaultCountry((v ?? "UK") as Country)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>{COUNTRY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Default provider</Label>
                  <Input placeholder="e.g. Bright Data" value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Upload CSV</Label>
              <Input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
              {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Or paste CSV</Label>
              <Textarea rows={6} className="font-mono text-xs" value={rawText} onChange={(e) => setRawText(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {validCount} valid
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {errorCount} skipped
                </span>
              )}
            </div>

            <div className="rounded-lg border overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-8">#</TableHead>
                    {type === "proxy" && (
                      <>
                        <TableHead>Host</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Expires</TableHead>
                      </>
                    )}
                    {type === "phone" && (
                      <>
                        <TableHead>Number</TableHead>
                        <TableHead>Country</TableHead>
                      </>
                    )}
                    {type === "email" && (
                      <>
                        <TableHead>Email</TableHead>
                        <TableHead>Password</TableHead>
                      </>
                    )}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows?.slice(0, 20).map((row, i) => (
                    <TableRow key={i} className={row._errors?.length ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      {type === "proxy" && (() => {
                        const r = row as ParsedProxyRow;
                        return (
                          <>
                            <TableCell className="font-mono text-xs">{r.host}:{r.port}</TableCell>
                            <TableCell className="text-xs">{COUNTRY_LABELS[r.country]}</TableCell>
                            <TableCell className="text-xs">{r.expiresAt}</TableCell>
                          </>
                        );
                      })()}
                      {type === "phone" && (() => {
                        const r = row as ParsedPhoneRow;
                        return (
                          <>
                            <TableCell className="font-mono text-xs">{r.number}</TableCell>
                            <TableCell className="text-xs">{COUNTRY_LABELS[r.country]}</TableCell>
                          </>
                        );
                      })()}
                      {type === "email" && (() => {
                        const r = row as ParsedEmailRow;
                        return (
                          <>
                            <TableCell className="text-xs">{r.email}</TableCell>
                            <TableCell className="font-mono text-xs">{"•".repeat(8)}</TableCell>
                          </>
                        );
                      })()}
                      <TableCell>
                        {row._errors?.length ? (
                          <Badge variant="destructive" className="text-[10px]">{row._errors[0]}</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-0">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {(rows?.length ?? 0) > 20 && (
              <p className="text-xs text-muted-foreground">Showing first 20 of {rows?.length} rows</p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "input" ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handlePreview} disabled={!rawText.trim()}>Preview</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("input")}>Back</Button>
              <Button onClick={handleConfirm} disabled={importMutation.isPending || validCount === 0} className="gap-2">
                <Upload className="h-4 w-4" />
                {importMutation.isPending ? "Importing…" : `Import ${validCount} rows`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Toolbar button that opens the import dialog */
export function BulkImportButton({ type, label }: { type: ImportKind; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="h-3.5 w-3.5 mr-1.5" />
        {label ?? "Import CSV"}
      </Button>
      <BulkImportDialog type={type} open={open} onOpenChange={setOpen} />
    </>
  );
}
