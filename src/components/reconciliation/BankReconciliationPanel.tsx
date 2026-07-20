"use client";

import { FileUp, LockKeyhole, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

type ImportSummary = {
  id: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  matchedCount: number;
  duplicateRowCount: number;
  statementStart: string | null;
  statementEnd: string | null;
  importedAt: string;
  lockedAt: string | null;
  version: number;
};

type ImportResult = {
  importId: string;
  rowCount: number;
  duplicateRowCount: number;
  suggestedMatchCount: number;
  warnings: string[];
  message: string;
};

export function BankReconciliationPanel() {
  const { state, setNotice } = useDashboard();
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(state.accounts[0]?.id ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [latestResult, setLatestResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadImports() {
      if (!state.businessId) {
        return;
      }

      try {
        const response = await fetch(`/api/bank-reconciliation?businessId=${encodeURIComponent(state.businessId)}`, {
          credentials: "include",
          cache: "no-store",
        });
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
          setLoading(false);
        }
      }
    }

    void loadImports();

    return () => {
      mounted = false;
    };
  }, [state.businessId, setNotice]);

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!state.businessId) {
      setNotice("Choose a business before importing a statement.");
      return;
    }

    if (!selectedFile) {
      setNotice("Choose a CSV bank statement first.");
      return;
    }

    setImporting(true);
    try {
      const csv = await selectedFile.text();
      const response = await fetch("/api/bank-reconciliation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          accountId: selectedAccountId || undefined,
          locationId: state.selectedLocationId,
          fileName: selectedFile.name,
          csv,
        }),
      });
      const payload = (await response.json().catch(() => null)) as (ImportResult & { error?: string }) | null;

      if (!response.ok || !payload?.importId) {
        throw new Error(payload?.error ?? "Could not import bank statement.");
      }

      setLatestResult(payload);
      setNotice(payload.message ?? "Bank statement imported for review.");
      setImports((current) => [
        {
          id: payload.importId,
          fileName: selectedFile.name,
          status: "IMPORTED",
          rowCount: payload.rowCount,
          matchedCount: payload.suggestedMatchCount,
          duplicateRowCount: payload.duplicateRowCount,
          statementStart: null,
          statementEnd: null,
          importedAt: new Date().toISOString(),
          lockedAt: null,
          version: 1,
        },
        ...current,
      ]);
      setSelectedFile(null);
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import bank statement.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6" onSubmit={submitImport}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileUp size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Statement import</p>
            <h2 className="text-base font-semibold text-textPrimary">CSV bank statement</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="text-xs font-semibold text-textSecondary">
            SME MoneyBook account
            <select
              className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
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
          <label className="text-xs font-semibold text-textSecondary">
            CSV file
            <input
              className="mt-2 w-full rounded-xl border border-dashed border-gray-300 bg-background px-3 py-3 text-sm font-medium text-textSecondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              accept=".csv,text/csv"
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <button
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="submit"
          disabled={importing}
        >
          {importing ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
          Import
        </button>

        {latestResult ? (
          <div className="mt-5 rounded-2xl bg-background p-4 text-sm text-textSecondary">
            <p className="font-semibold text-textPrimary">{latestResult.rowCount} rows imported</p>
            <p className="mt-1">{latestResult.suggestedMatchCount} suggested matches · {latestResult.duplicateRowCount} duplicates</p>
            {latestResult.warnings[0] ? (
              <p className="mt-2 text-xs text-textMuted">{latestResult.warnings[0]}</p>
            ) : null}
          </div>
        ) : null}
      </form>

      <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-textSecondary">Recent imports</p>
            <h2 className="text-base font-semibold text-textPrimary">
              {loading ? "Loading..." : `${imports.length} statements`}
            </h2>
          </div>
          <LockKeyhole className="text-textMuted" size={18} aria-hidden="true" />
        </div>

        <div className="mt-5 grid gap-3">
          {imports.length === 0 && !loading ? (
            <p className="rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
              No bank statements imported yet.
            </p>
          ) : null}
          {imports.map((item) => (
            <div className="rounded-2xl bg-background p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-textPrimary">{item.fileName ?? "Bank statement"}</p>
                  <p className="mt-1 text-xs text-textMuted">
                    {item.rowCount} rows · {item.matchedCount} matched · v{item.version}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-textMuted">
                  {item.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-textMuted">
                Imported {new Date(item.importedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
