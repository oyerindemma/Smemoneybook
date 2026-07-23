"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  Download,
  FileSpreadsheet,
  FileUp,
  Link2,
  RefreshCw,
  RotateCcw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type ImportSummary = {
  id: string;
  fileName: string | null;
  accountLabel: string | null;
  bankName: string | null;
  status: string;
  rowCount: number;
  matchedCount: number;
  duplicateRowCount: number;
  statementStart: string | null;
  statementEnd: string | null;
  importedAt: string;
  lockedAt: string | null;
  version: number;
  account?: { id: string; name: string; type: string } | null;
  location?: { id: string; name: string } | null;
};

type PreviewRow = {
  rowNumber: number;
  postedAt: string;
  amount: number;
  direction: string;
  description: string;
  reference?: string;
  duplicateStatus: string;
  suggestedCategory?: string;
};

type ImportPreview = {
  headers: string[];
  mapping: Record<string, string>;
  rowCount: number;
  previewRows: PreviewRow[];
  errors: Array<{ rowNumber: number; message: string }>;
  warnings: string[];
  duplicateRowCount: number;
  crossImportDuplicateCount: number;
  totals: { inflow: number; outflow: number; net: number };
};

type Match = {
  id: string;
  status: string;
  matchType: string;
  confidence: number;
  confidenceReasons?: string[];
  transactionId: string | null;
  transaction?: {
    id: string;
    type: string;
    amount: string | number;
    description: string;
    occurredAt: string;
  } | null;
};

type Entry = {
  id: string;
  rowNumber: number;
  postedAt: string;
  amount: string | number;
  direction: string;
  description: string;
  reference: string | null;
  externalReference: string | null;
  balance: string | number | null;
  duplicateStatus: string;
  status: EntryStatus;
  suggestedCategory: string | null;
  statementImport: {
    id: string;
    fileName: string | null;
    bankName: string | null;
    accountLabel: string | null;
    importedAt: string;
    status: string;
  };
  matches: Match[];
};

type EntryStatus = "SUGGESTED" | "UNMATCHED" | "MATCHED" | "IGNORED" | "DUPLICATE";

type EntrySummary = {
  total: number;
  suggested: number;
  unmatched: number;
  matched: number;
  ignored: number;
  duplicates: number;
  unresolved: number;
};

const tabs: Array<{ status: EntryStatus; label: string; countKey: keyof EntrySummary }> = [
  { status: "SUGGESTED", label: "Suggested", countKey: "suggested" },
  { status: "UNMATCHED", label: "Unmatched", countKey: "unmatched" },
  { status: "MATCHED", label: "Matched", countKey: "matched" },
  { status: "IGNORED", label: "Ignored", countKey: "ignored" },
  { status: "DUPLICATE", label: "Duplicates", countKey: "duplicates" },
];

const emptyEntrySummary: EntrySummary = {
  total: 0,
  suggested: 0,
  unmatched: 0,
  matched: 0,
  ignored: 0,
  duplicates: 0,
  unresolved: 0,
};

export function BankReconciliationPanel() {
  const { state, setNotice } = useDashboard();
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<EntrySummary>(emptyEntrySummary);
  const [activeStatus, setActiveStatus] = useState<EntryStatus>("SUGGESTED");
  const [selectedImportId, setSelectedImportId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(state.accounts[0]?.id ?? "");
  const [bankName, setBankName] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [manualTransactionId, setManualTransactionId] = useState("");
  const [loadingImports, setLoadingImports] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [acting, setActing] = useState(false);

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null;
  const canImport = state.permissions?.canImportBankReconciliation !== false;
  const canReview = state.permissions?.canReviewBankReconciliation !== false;
  const canExport = state.permissions?.canExportBankReconciliation !== false;
  const exportQuery = buildQuery({
    businessId: state.businessId,
    importId: selectedImportId,
    status: activeStatus,
    query,
    from,
    to,
  });
  const progress = summary.total > 0 ? Math.round(((summary.matched + summary.ignored) / summary.total) * 100) : 0;

  async function loadImports() {
    if (!state.businessId) {
      return;
    }

    await Promise.resolve();
    setLoadingImports(true);
    try {
      const response = await fetch(
        `/api/bank-reconciliation/imports?businessId=${encodeURIComponent(state.businessId)}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as { imports?: ImportSummary[]; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load bank reconciliation imports.");
      }

      setImports(payload?.imports ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load bank reconciliation imports.");
    } finally {
      setLoadingImports(false);
    }
  }

  async function loadEntries() {
    if (!state.businessId) {
      return;
    }

    await Promise.resolve();
    setLoadingEntries(true);
    try {
      const response = await fetch(`/api/bank-reconciliation/entries?${buildQuery({
        businessId: state.businessId,
        importId: selectedImportId,
        status: activeStatus,
        query,
        from,
        to,
      })}`, { credentials: "include", cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as {
        entries?: Entry[];
        summary?: EntrySummary;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load bank statement entries.");
      }

      setEntries(payload?.entries ?? []);
      setSummary(payload?.summary ?? emptyEntrySummary);
      setSelectedEntryId(payload?.entries?.[0]?.id ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load bank statement entries.");
    } finally {
      setLoadingEntries(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitialImports() {
      if (!state.businessId) {
        return;
      }

      setLoadingImports(true);
      try {
        const response = await fetch(
          `/api/bank-reconciliation/imports?businessId=${encodeURIComponent(state.businessId)}`,
          { credentials: "include", cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as { imports?: ImportSummary[]; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not load bank reconciliation imports.");
        }

        if (mounted) {
          setImports(payload?.imports ?? []);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load bank reconciliation imports.");
        }
      } finally {
        if (mounted) {
          setLoadingImports(false);
        }
      }
    }

    void loadInitialImports();

    return () => {
      mounted = false;
    };
  }, [state.businessId, setNotice]);

  useEffect(() => {
    let mounted = true;

    async function loadInitialEntries() {
      if (!state.businessId) {
        return;
      }

      setLoadingEntries(true);
      try {
        const response = await fetch(`/api/bank-reconciliation/entries?${buildQuery({
          businessId: state.businessId,
          importId: selectedImportId,
          status: activeStatus,
          query,
          from,
          to,
        })}`, { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as {
          entries?: Entry[];
          summary?: EntrySummary;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not load bank statement entries.");
        }

        if (mounted) {
          setEntries(payload?.entries ?? []);
          setSummary(payload?.summary ?? emptyEntrySummary);
          setSelectedEntryId(payload?.entries?.[0]?.id ?? "");
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load bank statement entries.");
        }
      } finally {
        if (mounted) {
          setLoadingEntries(false);
        }
      }
    }

    void loadInitialEntries();

    return () => {
      mounted = false;
    };
  }, [activeStatus, from, query, selectedImportId, state.businessId, setNotice, to]);

  async function previewSelectedFile(file: File, nextMapping = mapping) {
    if (!state.businessId) {
      setNotice("Choose a business before importing a statement.");
      return;
    }

    setPreviewing(true);
    try {
      const csv = await file.text();
      setCsvText(csv);
      const response = await fetch("/api/bank-reconciliation/imports/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          csv,
          mapping: nextMapping,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { preview?: ImportPreview; error?: string } | null;

      if (!response.ok || !payload?.preview) {
        throw new Error(payload?.error ?? "Could not preview bank statement.");
      }

      setPreview(payload.preview);
      setMapping(payload.preview.mapping);
      setNotice("Bank statement preview is ready.");
    } catch (error) {
      setPreview(null);
      setNotice(error instanceof Error ? error.message : "Could not preview bank statement.");
    } finally {
      setPreviewing(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!state.businessId) {
      setNotice("Choose a business before importing a statement.");
      return;
    }

    if (!selectedFile || !csvText) {
      setNotice("Choose and preview a CSV bank statement first.");
      return;
    }

    if (preview?.errors.length) {
      setNotice("Fix the CSV mapping before importing.");
      return;
    }

    setImporting(true);
    try {
      const response = await fetch("/api/bank-reconciliation/imports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          accountId: selectedAccountId || undefined,
          locationId: state.selectedLocationId,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          bankName: bankName || undefined,
          accountLabel: accountLabel || undefined,
          csv: csvText,
          mapping,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        importId?: string;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.importId) {
        throw new Error(payload?.error ?? "Could not import bank statement.");
      }

      setNotice(payload.message ?? "Bank statement imported for review.");
      setPreview(null);
      setSelectedFile(null);
      setCsvText("");
      setSelectedImportId(payload.importId);
      await loadImports();
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import bank statement.");
    } finally {
      setImporting(false);
    }
  }

  async function runMatchAction(path: string, body: Record<string, string | undefined>) {
    if (!state.businessId || acting) {
      return;
    }

    setActing(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, ...body }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update bank reconciliation.");
      }

      setNotice(payload?.message ?? "Bank reconciliation updated.");
      setManualTransactionId("");
      await loadEntries();
      await loadImports();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update bank reconciliation.");
    } finally {
      setActing(false);
    }
  }

  async function exportCsv() {
    if (!state.businessId || !canExport) {
      return;
    }

    try {
      const response = await fetch(`/api/bank-reconciliation/export?${exportQuery}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export bank reconciliation.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bank-reconciliation.csv";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Bank reconciliation CSV exported.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export bank reconciliation.");
    }
  }

  const totals = useMemo(() => preview?.totals ?? { inflow: 0, outflow: 0, net: 0 }, [preview]);

  return (
    <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <form className="rounded-lg border border-gray-200 bg-card p-4 shadow-sm md:p-5" onSubmit={submitImport}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-textSecondary">Statement import</p>
            <h2 className="text-base font-semibold text-textPrimary">CSV review</h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileUp size={18} aria-hidden="true" />
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold text-textSecondary">
            SME MoneyBook account
            <select
              className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              <option value="">No account selected</option>
              {state.accounts.map((account) => (
                <option value={account.id} key={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="text-xs font-semibold text-textSecondary">
              Bank
              <input
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="Bank name"
              />
            </label>
            <label className="text-xs font-semibold text-textSecondary">
              Account label
              <input
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                placeholder="Main bank"
              />
            </label>
          </div>

          <label className="text-xs font-semibold text-textSecondary">
            CSV file
            <input
              className="mt-2 w-full rounded-lg border border-dashed border-gray-300 bg-background px-3 py-3 text-sm font-medium text-textSecondary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              accept=".csv,text/csv"
              type="file"
              disabled={!canImport}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                setPreview(null);
                setCsvText("");
                if (file) {
                  void previewSelectedFile(file, {});
                }
              }}
            />
          </label>
        </div>

        {preview ? (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-100 bg-background p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Rows" value={preview.rowCount} />
              <Metric label="Suggested" value={preview.duplicateRowCount + preview.crossImportDuplicateCount} />
              <Metric label="Net" value={formatMoney(totals.net)} />
            </div>
            <div className="grid gap-2">
              {["postedAt", "description", "amount", "debit", "credit", "reference", "balance"].map((field) => (
                <label className="text-xs font-semibold text-textSecondary" key={field}>
                  {fieldLabel(field)}
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-textPrimary outline-none focus:border-primary"
                    value={mapping[field] ?? ""}
                    onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                  >
                    <option value="">Not mapped</option>
                    {preview.headers.map((header) => (
                      <option value={header} key={`${field}-${header}`}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {preview.errors[0] ? (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {preview.errors[0].message}
              </p>
            ) : null}
            <button
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary transition hover:border-primary disabled:opacity-60"
              type="button"
              disabled={!selectedFile || previewing}
              onClick={() => selectedFile && previewSelectedFile(selectedFile, mapping)}
            >
              <RefreshCw size={16} aria-hidden="true" className={previewing ? "animate-spin" : ""} />
              Preview
            </button>
          </div>
        ) : null}

        <button
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="submit"
          disabled={!canImport || importing || !preview || preview.errors.length > 0}
        >
          {importing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />}
          Import
        </button>
      </form>

      <section className="min-w-0 space-y-5">
        <div className="rounded-lg border border-gray-200 bg-card p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium text-textSecondary">Reconciliation queue</p>
              <h2 className="mt-1 text-lg font-semibold text-textPrimary">{progress}% reviewed</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
                value={selectedImportId}
                onChange={(event) => setSelectedImportId(event.target.value)}
              >
                <option value="">All imports</option>
                {imports.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.fileName ?? "Bank statement"} ({item.rowCount})
                  </option>
                ))}
              </select>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary transition hover:border-primary disabled:opacity-60"
                type="button"
                disabled={loadingEntries}
                onClick={() => loadEntries()}
                aria-label="Refresh reconciliation queue"
                title="Refresh"
              >
                <RefreshCw size={16} aria-hidden="true" className={loadingEntries ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary transition hover:border-primary disabled:opacity-60"
                type="button"
                disabled={!canExport || summary.total === 0}
                onClick={exportCsv}
                aria-label="Export reconciliation CSV"
                title="Export CSV"
              >
                <Download size={16} aria-hidden="true" />
                Export
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px]">
            <label className="relative text-xs font-semibold text-textSecondary">
              Search
              <Search className="pointer-events-none absolute bottom-3 left-3 text-textMuted" size={15} aria-hidden="true" />
              <input
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Description or reference"
              />
            </label>
            <label className="text-xs font-semibold text-textSecondary">
              From
              <input
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-textSecondary">
              To
              <input
                className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <button
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                  activeStatus === tab.status
                    ? "bg-primary text-white"
                    : "border border-gray-200 bg-white text-textSecondary hover:border-primary"
                }`}
                type="button"
                onClick={() => setActiveStatus(tab.status)}
                aria-label={`${tab.label} queue ${summary[tab.countKey]}`}
                key={tab.status}
              >
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${activeStatus === tab.status ? "bg-white/20" : "bg-gray-100"}`}>
                  {summary[tab.countKey]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-h-[440px] gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.8fr)]">
          <section className="rounded-lg border border-gray-200 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-textPrimary">
                {loadingEntries ? "Loading entries" : `${entries.length} visible entries`}
              </p>
              <p className="text-xs font-medium text-textMuted">{summary.unresolved} unresolved</p>
            </div>
            <div className="max-h-[560px] overflow-auto">
              {entries.length === 0 && !loadingEntries ? (
                <EmptyQueue status={activeStatus} />
              ) : null}
              {entries.map((entry) => (
                <button
                  className={`grid w-full gap-2 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-background ${
                    selectedEntry?.id === entry.id ? "bg-background" : "bg-card"
                  }`}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  key={entry.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-textPrimary">{entry.description}</p>
                      <p className="mt-1 text-xs text-textMuted">
                        Row {entry.rowNumber} · {formatDate(entry.postedAt)} · {entry.reference ?? "No reference"}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-bold ${entry.direction === "inflow" ? "text-emerald-700" : "text-red-700"}`}>
                      {entry.direction === "inflow" ? "+" : "-"}{formatMoney(entry.amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={entry.status} />
                    {entry.duplicateStatus !== "UNIQUE" ? <StatusBadge status={entry.duplicateStatus} /> : null}
                    {entry.matches[0]?.transactionId ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        {entry.matches[0].confidence}% {entry.matches[0].matchType}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="rounded-lg border border-gray-200 bg-card shadow-sm">
            {selectedEntry ? (
              <EntryDetail
                entry={selectedEntry}
                acting={acting}
                canReview={canReview}
                manualTransactionId={manualTransactionId}
                setManualTransactionId={setManualTransactionId}
                runMatchAction={runMatchAction}
              />
            ) : (
              <div className="flex min-h-[360px] items-center justify-center p-6 text-center text-sm font-medium text-textSecondary">
                Select an entry to review.
              </div>
            )}
          </aside>
        </div>

        {imports.length === 0 && !loadingImports ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-background p-4 text-sm font-medium text-textSecondary">
            No bank statements imported yet.
          </p>
        ) : null}
      </section>
    </section>
  );
}

function EntryDetail({
  entry,
  acting,
  canReview,
  manualTransactionId,
  setManualTransactionId,
  runMatchAction,
}: {
  entry: Entry;
  acting: boolean;
  canReview: boolean;
  manualTransactionId: string;
  setManualTransactionId: (value: string) => void;
  runMatchAction: (path: string, body: Record<string, string | undefined>) => Promise<void>;
}) {
  const suggestedMatches = entry.matches.filter((match) => match.status === "SUGGESTED" && match.transactionId);
  const confirmedMatch = entry.matches.find((match) => match.status === "CONFIRMED");

  return (
    <div className="grid gap-4 p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-textSecondary">Entry detail</p>
            <h3 className="mt-1 text-base font-semibold text-textPrimary">{entry.description}</h3>
          </div>
          <StatusBadge status={entry.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Detail label="Amount" value={`${entry.direction === "inflow" ? "+" : "-"}${formatMoney(entry.amount)}`} />
          <Detail label="Posted" value={formatDate(entry.postedAt)} />
          <Detail label="Reference" value={entry.reference ?? entry.externalReference ?? "None"} />
          <Detail label="Import" value={entry.statementImport.fileName ?? "Bank statement"} />
        </dl>
      </div>

      <div className="rounded-lg bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Suggested matches</p>
        <div className="mt-3 grid gap-3">
          {suggestedMatches.length === 0 ? (
            <p className="text-sm font-medium text-textSecondary">No active suggestions for this entry.</p>
          ) : null}
          {suggestedMatches.map((match) => (
            <div className="rounded-lg border border-gray-200 bg-white p-3" key={match.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-textPrimary">
                    {match.transaction?.description ?? match.transactionId}
                  </p>
                  <p className="mt-1 text-xs text-textMuted">
                    {match.transaction ? `${formatDate(match.transaction.occurredAt)} · ${formatMoney(match.transaction.amount)}` : "Recorded transaction"}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {match.confidence}%
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                  type="button"
                  disabled={!canReview || acting}
                  onClick={() => runMatchAction(`/api/bank-reconciliation/matches/${match.id}/confirm`, {})}
                  title="Confirm match"
                >
                  <Check size={14} aria-hidden="true" />
                  Confirm
                </button>
                <button
                  className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
                  type="button"
                  disabled={!canReview || acting}
                  onClick={() => runMatchAction(`/api/bank-reconciliation/matches/${match.id}/reject`, {})}
                  title="Reject match"
                >
                  <X size={14} aria-hidden="true" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <label className="text-xs font-semibold text-textSecondary">
          Manual transaction ID
          <input
            className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary outline-none focus:border-primary"
            value={manualTransactionId}
            onChange={(event) => setManualTransactionId(event.target.value)}
            placeholder="Transaction ID"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-60"
            type="button"
            disabled={!canReview || acting || !manualTransactionId.trim() || entry.status === "MATCHED"}
            onClick={() => runMatchAction(`/api/bank-reconciliation/entries/${entry.id}/manual-match`, {
              transactionId: manualTransactionId.trim(),
            })}
            title="Manual match"
          >
            <Link2 size={14} aria-hidden="true" />
            Match
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={!canReview || acting || !confirmedMatch}
            onClick={() => confirmedMatch && runMatchAction(`/api/bank-reconciliation/matches/${confirmedMatch.id}/unmatch`, {})}
            title="Unmatch"
          >
            <Undo2 size={14} aria-hidden="true" />
            Unmatch
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={!canReview || acting || entry.status === "MATCHED" || entry.status === "IGNORED"}
            onClick={() => runMatchAction(`/api/bank-reconciliation/entries/${entry.id}/ignore`, {
              reason: "Reviewer marked this row as not requiring a match.",
            })}
            title="Ignore"
          >
            <Ban size={14} aria-hidden="true" />
            Ignore
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={!canReview || acting || (entry.status !== "IGNORED" && entry.status !== "DUPLICATE")}
            onClick={() => runMatchAction(`/api/bank-reconciliation/entries/${entry.id}/reopen`, {
              reason: "Reviewer reopened this entry.",
            })}
            title="Reopen"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reopen
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-base font-semibold text-textPrimary">{value}</p>
      <p className="text-[11px] font-medium text-textMuted">{label}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <dt className="text-[11px] font-semibold uppercase text-textMuted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-textPrimary">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function EmptyQueue({ status }: { status: EntryStatus }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-textPrimary">No {status.toLowerCase()} entries</p>
        <p className="mt-1 text-sm text-textSecondary">The current import and date filters have no rows in this queue.</p>
      </div>
    </div>
  );
}

function buildQuery(input: {
  businessId?: string;
  importId?: string;
  status?: string;
  query?: string;
  from?: string;
  to?: string;
}) {
  const searchParams = new URLSearchParams();

  Object.entries(input).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  return searchParams.toString();
}

function formatMoney(value: number | string) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    postedAt: "Date",
    description: "Description",
    amount: "Amount",
    debit: "Debit",
    credit: "Credit",
    reference: "Reference",
    balance: "Balance",
  };

  return labels[field] ?? field;
}

function statusColor(status: string) {
  if (status === "MATCHED" || status === "CONFIRMED") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "SUGGESTED") {
    return "bg-blue-50 text-blue-700";
  }

  if (status === "DUPLICATE" || status === "PROBABLE_DUPLICATE" || status === "CONFIRMED_DUPLICATE") {
    return "bg-amber-50 text-amber-700";
  }

  if (status === "IGNORED" || status === "REJECTED" || status === "UNMATCHED") {
    return "bg-gray-100 text-textMuted";
  }

  return "bg-gray-100 text-textMuted";
}
