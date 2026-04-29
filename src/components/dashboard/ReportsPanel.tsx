"use client";

import { useEffect, useState } from "react";
import type { MonthlyReport } from "@/components/dashboard/types";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function ReportsPanel({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState<MonthlyReport | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadReport() {
      const response = await fetch(
        `/api/reports/monthly?month=${month}&year=${year}`,
        { credentials: "include", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        report?: MonthlyReport;
        error?: string;
      } | null;

      if (!isActive) {
        return;
      }

      if (response.ok && payload?.report) {
        setReport(payload.report);
        return;
      }

      onNotice(payload?.error ?? "Could not load monthly report.");
    }

    void loadReport();

    return () => {
      isActive = false;
    };
  }, [month, onNotice, year]);

  async function saveVatSummary() {
    const response = await fetch(`/api/tax/summary?month=${month}&year=${year}`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    onNotice(
      response.ok
        ? payload?.message ?? "VAT summary saved."
        : payload?.error ?? "Could not save VAT summary.",
    );
  }

  const exportUrl = `/api/reports/monthly/export?month=${month}&year=${year}`;

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-black/55">Reports</p>
          <h2 className="text-xl font-semibold">Monthly report</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {String(value).padStart(2, "0")}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-xl border border-black/10 px-3 text-sm"
            max="2100"
            min="2000"
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </div>
      </div>

      {report ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReportTile label="Money in" value={formatNaira(report.salesTotal)} />
            <ReportTile label="Money out" value={formatNaira(report.expensesTotal)} />
            <ReportTile label="Profit" value={formatNaira(report.profitTotal)} />
            <ReportTile
              label={`VAT estimate (${report.vatRate}%)`}
              value={formatNaira(report.vatTotal)}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Customers owing: <strong>{formatNaira(report.customerDebtTotal)}</strong>
            </p>
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Supplier bills: <strong>{formatNaira(report.supplierDebtTotal)}</strong>
            </p>
            <p className="rounded-xl bg-[#F5F3EF] p-3 text-sm text-black/65">
              Entries: <strong>{report.transactionCount}</strong>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
              type="button"
              onClick={saveVatSummary}
            >
              Save VAT summary
            </button>
            <a
              className="inline-flex h-11 items-center rounded-xl bg-[#F5F3EF] px-4 text-sm font-semibold text-black/70"
              href={exportUrl}
            >
              Export CSV
            </a>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-[#F5F3EF] p-4 text-sm text-black/60">
          Loading monthly report...
        </p>
      )}
    </section>
  );
}

function ReportTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F5F3EF] p-3">
      <p className="text-xs text-black/50">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold">{value}</p>
    </div>
  );
}
