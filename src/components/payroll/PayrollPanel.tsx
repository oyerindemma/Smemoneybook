"use client";

import { CalendarDays, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { PayrollDashboard } from "@/lib/phase3/payroll-service";

export function PayrollPanel() {
  const { state, setNotice } = useDashboard();
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [baseSalary, setBaseSalary] = useState("100000");
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd());
  const [payDate, setPayDate] = useState(defaultPayDate());

  async function fetchDashboard() {
    if (!state.businessId) {
      return null;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    if (state.selectedLocationId) {
      params.set("locationId", state.selectedLocationId);
    }

    const response = await fetch(`/api/payroll?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { dashboard?: PayrollDashboard; error?: string }
      | null;

    if (!response.ok || !payload?.dashboard) {
      throw new Error(payload?.error ?? "Could not load payroll.");
    }

    return payload.dashboard;
  }

  useEffect(() => {
    let mounted = true;

    async function loadPayroll() {
      try {
        const nextDashboard = await fetchDashboard();

        if (mounted) {
          setDashboard(nextDashboard);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load payroll.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPayroll();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId, state.selectedLocationId]);

  const latestRun = useMemo(() => dashboard?.runs[0], [dashboard]);

  async function refreshPayroll() {
    setLoading(true);
    try {
      setDashboard(await fetchDashboard());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  }

  async function createEmployee() {
    if (!state.businessId || !employeeName.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_employee",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          displayName: employeeName.trim(),
          baseSalary: Number(baseSalary || 0),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create employee.");
      }

      setEmployeeName("");
      setNotice("Payroll employee created.");
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create employee.");
    } finally {
      setSaving(false);
    }
  }

  async function draftRun() {
    if (!state.businessId || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/payroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft_run",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          periodStart,
          periodEnd,
          payDate,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not draft payroll run.");
      }

      setNotice("Payroll run drafted.");
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not draft payroll run.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Payroll</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${dashboard?.employees.length ?? 0} employees`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Admin-only payroll runs and locked snapshots</p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={refreshPayroll}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_0.5fr_auto]">
        <label className="text-xs font-semibold text-textSecondary">
          Employee
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            value={employeeName}
            onChange={(event) => setEmployeeName(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-textSecondary">
          Base salary
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            inputMode="decimal"
            type="number"
            value={baseSalary}
            onChange={(event) => setBaseSalary(event.target.value)}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="button"
          disabled={saving || !employeeName.trim()}
          onClick={createEmployee}
        >
          <Plus size={16} aria-hidden="true" />
          Add
        </button>
      </div>

      <div className="mt-5 rounded-2xl bg-background p-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} aria-hidden="true" className="text-primary" />
          <h3 className="font-semibold text-textPrimary">Draft payroll run</h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <DateField label="Start" value={periodStart} onChange={setPeriodStart} />
          <DateField label="End" value={periodEnd} onChange={setPeriodEnd} />
          <DateField label="Pay date" value={payDate} onChange={setPayDate} />
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-white disabled:opacity-60"
            type="button"
            disabled={saving || (dashboard?.employees.length ?? 0) === 0}
            onClick={draftRun}
          >
            <Plus size={16} aria-hidden="true" />
            Draft
          </button>
        </div>
      </div>

      {latestRun ? (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Metric label="Latest status" value={latestRun.status} />
          <Metric label="Gross pay" value={formatCurrency(latestRun.grossPay)} />
          <Metric label="Deductions" value={formatCurrency(latestRun.totalDeductions)} />
          <Metric label="Net pay" value={formatCurrency(latestRun.netPay)} />
        </div>
      ) : loading ? (
        <div className="mt-5 h-24 animate-pulse rounded-2xl bg-background" />
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Add employees, then draft a payroll run for review and approval.
        </div>
      )}
    </section>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-textSecondary">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function defaultPeriodStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function defaultPeriodEnd() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function defaultPayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
