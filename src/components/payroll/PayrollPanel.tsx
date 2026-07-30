"use client";

import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  WalletCards,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { PayrollDashboard, PayrollPeriodSummary } from "@/lib/payroll/service";

type PayrollResponse = {
  dashboard?: PayrollDashboard;
  employee?: unknown;
  period?: PayrollPeriodSummary;
  periods?: PayrollPeriodSummary[];
  result?: { period?: PayrollPeriodSummary; alreadyPosted?: boolean };
  payslips?: unknown[];
  error?: string;
};

export function PayrollPanel() {
  const { state, setNotice } = useDashboard();
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [baseSalary, setBaseSalary] = useState("100000");
  const [allowanceAmount, setAllowanceAmount] = useState("10000");
  const [deductionAmount, setDeductionAmount] = useState("3000");
  const [bankAccount, setBankAccount] = useState("");
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd());
  const [payDate, setPayDate] = useState(defaultPayDate());
  const [requiresDualApproval, setRequiresDualApproval] = useState(false);
  const [rejectReason, setRejectReason] = useState("Needs owner review before approval.");
  const [reverseReason, setReverseReason] = useState("Payroll correction requested after approval.");
  const [postingMessage, setPostingMessage] = useState("");

  const selectedPeriod = useMemo(
    () => dashboard?.periods.find((period) => period.id === selectedPeriodId) ?? dashboard?.periods[0] ?? null,
    [dashboard?.periods, selectedPeriodId],
  );

  const fetchDashboard = useCallback(async () => {
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
    const payload = (await response.json().catch(() => null)) as PayrollResponse | null;

    if (!response.ok || !payload?.dashboard) {
      throw new Error(payload?.error ?? "Could not load payroll.");
    }

    return payload.dashboard;
  }, [state.businessId, state.selectedLocationId]);

  const refreshPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const nextDashboard = await fetchDashboard();
      setDashboard(nextDashboard);
      setSelectedPeriodId((current) => current || nextDashboard?.periods[0]?.id || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  }, [fetchDashboard, setNotice]);

  useEffect(() => {
    let cancelled = false;

    void fetchDashboard()
      .then((nextDashboard) => {
        if (cancelled) {
          return;
        }

        setDashboard(nextDashboard);
        setSelectedPeriodId((current) => current || nextDashboard?.periods[0]?.id || "");
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Could not load payroll.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchDashboard, setNotice]);

  async function createEmployee() {
    if (!state.businessId || !employeeName.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const components = [
        Number(allowanceAmount || 0) > 0
          ? {
              name: "Transport allowance",
              type: "allowance",
              calculationMethod: "fixed_amount",
              amount: Number(allowanceAmount),
              taxable: true,
            }
          : null,
        Number(deductionAmount || 0) > 0
          ? {
              name: "Staff welfare deduction",
              type: "deduction",
              calculationMethod: "fixed_amount",
              amount: Number(deductionAmount),
              taxable: false,
            }
          : null,
      ].filter(Boolean);

      const response = await fetch("/api/payroll/employees", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          displayName: employeeName.trim(),
          fullName: employeeName.trim(),
          employeeNumber: employeeNumber.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          baseSalary: Number(baseSalary || 0),
          bankAccount: bankAccount.trim() || undefined,
          components,
        }),
      });
      const payload = (await response.json().catch(() => null)) as PayrollResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not create payroll employee.");
      }

      setEmployeeName("");
      setEmployeeNumber("");
      setJobTitle("");
      setBankAccount("");
      setNotice("Payroll employee profile created.");
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create payroll employee.");
    } finally {
      setBusy(false);
    }
  }

  async function createPeriod() {
    if (!state.businessId || busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/payroll/periods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          periodStart,
          periodEnd,
          payDate,
          requiresDualApproval,
        }),
      });
      const payload = (await response.json().catch(() => null)) as PayrollResponse | null;

      if (!response.ok || !payload?.period) {
        throw new Error(payload?.error ?? "Could not prepare payroll period.");
      }

      setSelectedPeriodId(payload.period.id);
      setNotice("Payroll period prepared.");
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare payroll period.");
    } finally {
      setBusy(false);
    }
  }

  async function runPeriodAction(
    path: string,
    message: string,
    body: Record<string, unknown> = {},
  ) {
    if (!state.businessId || !selectedPeriod || busy) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/payroll/periods/${selectedPeriod.id}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, ...body }),
      });
      const payload = (await response.json().catch(() => null)) as PayrollResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? message);
      }

      if (path === "post-expense") {
        setPostingMessage(payload?.result?.alreadyPosted ? "Payroll expense was already posted." : "Payroll expense posted.");
      }

      setNotice(message);
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : message);
    } finally {
      setBusy(false);
    }
  }

  async function generatePayslips() {
    if (!state.businessId || !selectedPeriod || busy) {
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams({ businessId: state.businessId });
      const response = await fetch(`/api/payroll/periods/${selectedPeriod.id}/payslips?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as PayrollResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not generate payslips.");
      }

      setNotice(`${payload?.payslips?.length ?? 0} payslips generated.`);
      await refreshPayroll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not generate payslips.");
    } finally {
      setBusy(false);
    }
  }

  const setup = dashboard?.setup;
  const exportHref = state.businessId
    ? `/api/payroll/export?${new URLSearchParams({ businessId: state.businessId }).toString()}`
    : "#";

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Employees" value={loading ? "..." : String(dashboard?.employees.length ?? 0)} icon={<WalletCards size={16} aria-hidden="true" />} />
        <Metric label="Periods" value={String(dashboard?.periods.length ?? 0)} icon={<CalendarDays size={16} aria-hidden="true" />} />
        <Metric label="Latest net pay" value={formatCurrency(selectedPeriod?.netPay ?? 0)} icon={<FileText size={16} aria-hidden="true" />} />
        <Metric label="Statutory" value={setup?.statutory.status === "configured" ? "Configured" : "Setup required"} icon={<LockKeyhole size={16} aria-hidden="true" />} tone="warning" />
      </div>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">Payroll overview</p>
            <h2 className="text-base font-semibold text-textPrimary">Setup-required statutory notice</h2>
            <p className="mt-1 text-sm text-textSecondary">
              {setup?.statutory.message ?? "Statutory payroll setup required before PAYE, pension, or statutory deductions are calculated."}
            </p>
            <p className="mt-2 text-xs font-medium text-textMuted">
              Payroll Preview does not transfer money, connect to bank payroll systems, or file statutory returns.
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
            type="button"
            disabled={loading}
            onClick={() => void refreshPayroll()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-textPrimary">Employee profiles</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Employee name" value={employeeName} onChange={setEmployeeName} />
            <Field label="Employee number" value={employeeNumber} onChange={setEmployeeNumber} />
            <Field label="Job title" value={jobTitle} onChange={setJobTitle} />
            <Field label="Base salary" value={baseSalary} onChange={setBaseSalary} type="number" />
            <Field label="Allowance" value={allowanceAmount} onChange={setAllowanceAmount} type="number" />
            <Field label="Deduction" value={deductionAmount} onChange={setDeductionAmount} type="number" />
            <Field label="Bank account" value={bankAccount} onChange={setBankAccount} />
          </div>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
            type="button"
            disabled={busy || !employeeName.trim() || !dashboard?.setup}
            onClick={createEmployee}
          >
            <Plus size={16} aria-hidden="true" />
            Create employee
          </button>
          <div className="mt-4 grid gap-2">
            {(dashboard?.employees ?? []).length ? (
              dashboard?.employees.map((employee) => (
                <div key={employee.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                  <span>
                    <span className="block font-semibold text-textPrimary">{employee.displayName}</span>
                    <span className="text-xs text-textMuted">
                      {employee.employeeNumber ?? "No number"} · {employee.jobTitle ?? employee.roleTitle ?? "No title"} · {employee.maskedBankAccount ?? "No bank"}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-textMuted">{formatCurrency(employee.baseSalary)}</span>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                No payroll employees have been created.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold text-textPrimary">Payroll periods</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <DateField label="Start date" value={periodStart} onChange={setPeriodStart} />
            <DateField label="End date" value={periodEnd} onChange={setPeriodEnd} />
            <DateField label="Pay date" value={payDate} onChange={setPayDate} />
            <label className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
              <input
                type="checkbox"
                checked={requiresDualApproval}
                onChange={(event) => setRequiresDualApproval(event.target.checked)}
              />
              Require dual approval
            </label>
          </div>
          <button
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
            type="button"
            disabled={busy}
            onClick={createPeriod}
          >
            <Plus size={16} aria-hidden="true" />
            Create period
          </button>
          <label className="mt-4 grid gap-1 text-xs font-medium text-textMuted">
            Selected period
            <select
              className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
              value={selectedPeriod?.id ?? ""}
              onChange={(event) => setSelectedPeriodId(event.target.value)}
            >
              {(dashboard?.periods ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {formatDate(period.periodStart)} to {formatDate(period.periodEnd)} · {period.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium text-textMuted">Draft payroll</p>
            <h2 className="text-base font-semibold text-textPrimary">
              {selectedPeriod ? `${formatDate(selectedPeriod.periodStart)} to ${formatDate(selectedPeriod.periodEnd)}` : "No period selected"}
            </h2>
            <p className="mt-1 text-xs text-textMuted">
              {selectedPeriod ? `${selectedPeriod.status} · ${selectedPeriod.snapshotVersion}` : "Create a payroll period to calculate."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton disabled={busy || !selectedPeriod} icon={<RefreshCw size={16} />} label="Calculate" onClick={() => void runPeriodAction("calculate", "Payroll calculated.")} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<FileText size={16} />} label="Submit review" onClick={() => void runPeriodAction("submit-review", "Payroll submitted for review.")} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<CheckCircle2 size={16} />} label="Approve" onClick={() => void runPeriodAction("approve", "Payroll approved.")} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<XCircle size={16} />} label="Reject" onClick={() => void runPeriodAction("reject", "Payroll rejected.", { reason: rejectReason })} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<FileText size={16} />} label="Generate payslips" onClick={() => void generatePayslips()} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<WalletCards size={16} />} label="Post expense" onClick={() => void runPeriodAction("post-expense", "Payroll expense posted.")} />
            <ActionButton disabled={busy || !selectedPeriod} icon={<RotateCcw size={16} />} label="Reverse" onClick={() => void runPeriodAction("reverse", "Payroll reversed.", { reason: reverseReason })} />
            <a
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary"
              href={exportHref}
            >
              <Download size={16} aria-hidden="true" />
              Export
            </a>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Gross pay" value={formatCurrency(selectedPeriod?.grossPay ?? 0)} />
          <Metric label="Deductions" value={formatCurrency(selectedPeriod?.totalDeductions ?? 0)} />
          <Metric label="Net pay" value={formatCurrency(selectedPeriod?.netPay ?? 0)} />
          <Metric label="Payslips" value={String(selectedPeriod?.payslipCount ?? 0)} />
        </div>
        {postingMessage ? (
          <p className="mt-3 rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
            {postingMessage}
          </p>
        ) : null}
        <div className="mt-4 grid gap-2">
          {(selectedPeriod?.items ?? []).length ? (
            selectedPeriod?.items?.map((item) => (
              <div key={item.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                <span>
                  <span className="block font-semibold text-textPrimary">{item.employeeName}</span>
                  <span className="text-xs text-textMuted">
                    {item.employeeNumber ?? "No number"} · gross {formatCurrency(item.grossPay)} · net {formatCurrency(item.netPay)}
                  </span>
                </span>
                <span className="text-xs font-semibold text-textMuted">
                  {item.payslipGenerated ? "Payslip ready" : item.status}
                </span>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
              Empty state: calculate a payroll period after creating active employees.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TextArea label="Reject reason" value={rejectReason} onChange={setRejectReason} />
        <TextArea label="Reverse reason" value={reverseReason} onChange={setReverseReason} />
      </section>

      <section className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
        <p className="text-xs font-medium text-textMuted">Audit history</p>
        <div className="mt-3 grid gap-2">
          {(selectedPeriod?.approvalActions ?? []).length ? (
            selectedPeriod?.approvalActions?.map((action) => (
              <div key={action.id} className="rounded-lg bg-background p-3 text-sm text-textSecondary">
                <span className="font-semibold text-textPrimary">{action.action}</span> · {formatDate(action.createdAt)}
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
              No payroll audit actions for this period yet.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-textMuted">
      {label}
      <input
        className="min-h-10 rounded-lg border border-gray-200 bg-background px-3 text-sm text-textPrimary"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
  return <Field label={label} value={value} onChange={onChange} type="date" />;
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-textMuted">
      {label}
      <textarea
        className="min-h-20 rounded-lg border border-gray-200 bg-background px-3 py-2 text-sm text-textPrimary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-background px-3 text-sm font-semibold text-textPrimary disabled:opacity-50"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-textMuted">
        {icon}
        {label}
      </p>
      <p className={`mt-2 text-sm font-semibold ${tone === "warning" ? "text-warning" : "text-textPrimary"}`}>
        {value}
      </p>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
