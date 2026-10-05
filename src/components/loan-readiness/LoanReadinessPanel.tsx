"use client";

import {
  AlertCircle,
  ClipboardCheck,
  Download,
  FileCheck2,
  History,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type {
  LoanReadinessCapabilities,
  LoanReadinessCategory,
  LoanReadinessEvidence,
  LoanReadinessHistoryItem,
  LoanReadinessProfileDto,
  LoanReadinessReport,
  LoanReadinessStatus,
} from "@/lib/loan-readiness/definitions";

type View = "overview" | "categories" | "evidence" | "profile" | "history";

const views: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "categories", label: "Categories" },
  { id: "evidence", label: "Evidence" },
  { id: "profile", label: "Profile" },
  { id: "history", label: "History" },
];

export function LoanReadinessPanel() {
  const { state, setNotice } = useDashboard();
  const [view, setView] = useState<View>("overview");
  const [report, setReport] = useState<LoanReadinessReport | null>(null);
  const [profile, setProfile] = useState<LoanReadinessProfileDto | null>(null);
  const [history, setHistory] = useState<LoanReadinessHistoryItem[]>([]);
  const [capabilities, setCapabilities] = useState<LoanReadinessCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"generate" | "export" | "profile" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (state.businessId) params.set("businessId", state.businessId);
    if (state.selectedLocationId) params.set("locationId", state.selectedLocationId);
    return params.toString();
  }, [state.businessId, state.selectedLocationId]);

  const load = useCallback(async () => {
    if (!state.businessId) return;

    try {
      const [summaryPayload, categoriesPayload, evidencePayload, profilePayload, historyPayload] = await Promise.all([
        fetchJson<{ report: LoanReadinessReport; capabilities: LoanReadinessCapabilities }>(`/api/loan-readiness/summary?${query}`),
        fetchJson<{ categories: LoanReadinessCategory[] }>(`/api/loan-readiness/categories?${query}`),
        fetchJson<{ evidence: LoanReadinessEvidence }>(`/api/loan-readiness/evidence?${query}`),
        fetchJson<{ profile: LoanReadinessProfileDto; capabilities: LoanReadinessCapabilities }>(`/api/loan-readiness/profile?businessId=${encodeURIComponent(state.businessId)}`),
        fetchJson<{ history: LoanReadinessHistoryItem[] }>(`/api/loan-readiness/history?${query}`),
      ]);

      setReport({
        ...summaryPayload.report,
        categories: categoriesPayload.categories,
        evidence: evidencePayload.evidence,
      });
      setProfile(profilePayload.profile);
      setHistory(historyPayload.history);
      setCapabilities(summaryPayload.capabilities);
      setError(null);
    } catch (loadError) {
      const message = errorMessage(loadError, "Could not load Loan Readiness.");
      setError(message);
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }, [query, setNotice, state.businessId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function generateReport() {
    if (!state.businessId || working) return;
    setWorking("generate");
    try {
      const payload = await fetchJson<{ report: LoanReadinessReport; message: string }>(
        "/api/loan-readiness/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: state.businessId, locationId: state.selectedLocationId }),
        },
      );
      setReport(payload.report);
      setNotice(payload.message);
      const historyPayload = await fetchJson<{ history: LoanReadinessHistoryItem[] }>(`/api/loan-readiness/history?${query}`);
      setHistory(historyPayload.history);
    } catch (generateError) {
      setNotice(errorMessage(generateError, "Could not generate Loan Readiness assessment."));
    } finally {
      setWorking(null);
    }
  }

  async function exportReport() {
    if (!state.businessId || working) return;
    setWorking("export");
    try {
      const response = await fetch(`/api/loan-readiness/export?${query}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export Loan Readiness report.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromHeader(response.headers.get("Content-Disposition"));
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Loan Readiness CSV downloaded.");
    } catch (exportError) {
      setNotice(errorMessage(exportError, "Could not export Loan Readiness report."));
    } finally {
      setWorking(null);
    }
  }

  async function saveProfile() {
    if (!state.businessId || !profile || working) return;
    setWorking("profile");
    try {
      const payload = await fetchJson<{ profile: LoanReadinessProfileDto; message: string }>(
        "/api/loan-readiness/profile",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, businessId: state.businessId }),
        },
      );
      setProfile(payload.profile);
      setNotice(payload.message);
      await load();
    } catch (profileError) {
      setNotice(errorMessage(profileError, "Could not save the Loan Readiness profile."));
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error || !report || !profile) {
    return (
      <section className="border-t border-gray-200 py-6">
        <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4">
          <AlertCircle className="mt-0.5 shrink-0 text-danger" size={18} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-textPrimary">Loan Readiness unavailable</p>
            <p className="mt-1 text-sm text-textSecondary">{error ?? "No readiness report is available."}</p>
          </div>
          <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-textPrimary hover:bg-background" type="button" onClick={() => void load()} title="Refresh Loan Readiness" aria-label="Refresh Loan Readiness">
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-gray-200 py-5 md:py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-textPrimary">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-textMuted">Record readiness</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h2 className="text-2xl font-semibold text-textPrimary">{report.percentage}%</h2>
              <StatusBadge status={report.overallStatus} />
            </div>
            <p className="mt-1 text-xs text-textMuted">
              Updated {new Date(report.generatedAt).toLocaleString()} for {report.location.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary hover:bg-background disabled:opacity-50"
            type="button"
            disabled={!capabilities?.canExport || Boolean(working)}
            onClick={() => void exportReport()}
          >
            {working === "export" ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            Export
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            type="button"
            disabled={!capabilities?.canGenerate || Boolean(working)}
            onClick={() => void generateReport()}
          >
            {working === "generate" ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <ClipboardCheck size={16} aria-hidden="true" />}
            Generate
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-4xl border-l-2 border-accent pl-3 text-sm leading-6 text-textSecondary">
        {report.disclaimer}
      </p>

      <div className="mt-5 overflow-x-auto border-b border-gray-200" role="tablist" aria-label="Loan Readiness views">
        <div className="flex min-w-max gap-1">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              className={`min-h-10 border-b-2 px-3 text-sm font-semibold ${view === item.id ? "border-primary text-primary" : "border-transparent text-textMuted hover:text-textPrimary"}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {view === "overview" ? <Overview report={report} /> : null}
        {view === "categories" ? <Categories categories={report.categories} /> : null}
        {view === "evidence" ? <Evidence evidence={report.evidence} /> : null}
        {view === "profile" ? (
          <ProfileForm
            profile={profile}
            canManage={Boolean(capabilities?.canManageProfile)}
            saving={working === "profile"}
            onChange={setProfile}
            onSave={() => void saveProfile()}
          />
        ) : null}
        {view === "history" ? <HistoryView history={history} /> : null}
      </div>
    </section>
  );
}

function Overview({ report }: { report: LoanReadinessReport }) {
  const ready = report.categories.filter((category) => category.status === "Ready").length;
  const attention = report.categories.filter((category) => ["Needs attention", "Missing data", "Insufficient history"].includes(category.status)).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ready categories" value={ready} icon={<FileCheck2 size={17} aria-hidden="true" />} />
        <Metric label="Needs review" value={attention} icon={<AlertCircle size={17} aria-hidden="true" />} />
        <Metric label="Active months" value={report.evidence.activityMonths.length} icon={<History size={17} aria-hidden="true" />} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-textPrimary">Priority actions</h3>
        {report.recommendations.length > 0 ? (
          <ol className="mt-3 grid gap-2 md:grid-cols-2">
            {report.recommendations.map((recommendation, index) => (
              <li className="flex gap-3 rounded-lg border border-gray-200 p-3 text-sm leading-5 text-textSecondary" key={recommendation}>
                <span className="font-semibold text-primary">{index + 1}.</span>
                {recommendation}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-textSecondary">No priority record actions are open.</p>
        )}
      </div>
    </div>
  );
}

function Categories({ categories }: { categories: LoanReadinessCategory[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {categories.map((category) => (
        <article className="rounded-lg border border-gray-200 p-4" key={category.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-textPrimary">{category.label}</h3>
              <p className="mt-1 text-xs text-textMuted">{category.formula}</p>
            </div>
            <StatusBadge status={category.status} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-primary" style={{ width: `${category.percentage ?? 0}%` }} />
            </div>
            <span className="w-12 text-right text-sm font-semibold text-textPrimary">
              {category.percentage === null ? "N/A" : `${category.percentage}%`}
            </span>
          </div>
          <p className="mt-3 text-sm leading-5 text-textSecondary">{category.explanation}</p>
          {category.evidence[0] ? <p className="mt-2 text-xs leading-5 text-textMuted">{category.evidence[0]}</p> : null}
        </article>
      ))}
    </div>
  );
}

function Evidence({ evidence }: { evidence: LoanReadinessEvidence }) {
  const entries = Object.entries(evidence.sourceCounts);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {entries.map(([label, value]) => (
          <div className="border-b border-gray-100 pb-2" key={label}>
            <p className="text-xs capitalize text-textMuted">{label.replaceAll(/([A-Z])/g, " $1")}</p>
            <p className="mt-1 text-lg font-semibold text-textPrimary">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-textPrimary">Bank and debt evidence</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <EvidenceRow label="Covered bank rows" value={`${evidence.bank.coveredRows}/${evidence.bank.totalRows}`} />
            <EvidenceRow label="Unresolved bank rows" value={evidence.bank.unresolvedRows} />
            <EvidenceRow label="Open receivables" value={formatNumber(evidence.debt.openCustomerReceivables)} />
            <EvidenceRow label="Overdue receivables" value={formatNumber(evidence.debt.overdueCustomerReceivables)} />
            <EvidenceRow label="Supplier obligations" value={formatNumber(evidence.debt.openSupplierObligations)} />
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-textPrimary">Known limitations</h3>
          <ul className="mt-3 space-y-2 text-sm leading-5 text-textSecondary">
            {evidence.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ProfileForm({
  profile,
  canManage,
  saving,
  onChange,
  onSave,
}: {
  profile: LoanReadinessProfileDto;
  canManage: boolean;
  saving: boolean;
  onChange: (profile: LoanReadinessProfileDto) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <fieldset disabled={!canManage || saving} className="grid gap-4 md:grid-cols-2">
        <Field label="Industry">
          <input className="min-h-10 rounded-lg border border-gray-200 bg-card px-3 text-sm font-normal outline-none focus:border-primary" value={profile.industry ?? ""} maxLength={120} onChange={(event) => onChange({ ...profile, industry: event.target.value })} />
        </Field>
        <Field label="Operating start date">
          <input className="min-h-10 rounded-lg border border-gray-200 bg-card px-3 text-sm font-normal outline-none focus:border-primary" type="date" value={profile.operatingStartDate?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...profile, operatingStartDate: event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`).toISOString() : undefined })} />
        </Field>
        <Field label="Funding purpose">
          <input className="min-h-10 rounded-lg border border-gray-200 bg-card px-3 text-sm font-normal outline-none focus:border-primary" value={profile.fundingPurpose ?? ""} maxLength={300} onChange={(event) => onChange({ ...profile, fundingPurpose: event.target.value })} />
        </Field>
        <Field label="Requested amount">
          <div className="flex gap-2">
            <input className="min-h-10 w-24 rounded-lg border border-gray-200 bg-card px-3 text-sm font-normal outline-none focus:border-primary" aria-label="Preferred currency" value={profile.preferredCurrency} maxLength={3} onChange={(event) => onChange({ ...profile, preferredCurrency: event.target.value.toUpperCase() })} />
            <input className="min-h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-card px-3 text-sm font-normal outline-none focus:border-primary" type="number" min="0" step="0.01" value={profile.requestedAmount ?? ""} onChange={(event) => onChange({ ...profile, requestedAmount: event.target.value ? Number(event.target.value) : undefined })} />
          </div>
        </Field>
      </fieldset>

      <div>
        <h3 className="text-sm font-semibold text-textPrimary">Document checklist</h3>
        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-200">
          {profile.documents.map((document, index) => (
            <div className="grid gap-2 py-3 sm:grid-cols-[minmax(10rem,1fr)_10rem_minmax(12rem,1.3fr)] sm:items-center" key={document.documentType}>
              <label className="text-sm font-medium text-textPrimary" htmlFor={`document-status-${document.documentType}`}>{document.label}</label>
              <select
                id={`document-status-${document.documentType}`}
                className="min-h-10 rounded-lg border border-gray-200 bg-card px-3 text-sm outline-none focus:border-primary"
                disabled={!canManage || saving}
                value={document.status}
                onChange={(event) => {
                  const documents = [...profile.documents];
                  documents[index] = { ...document, status: event.target.value as typeof document.status };
                  onChange({ ...profile, documents });
                }}
              >
                <option value="MISSING">Missing</option>
                <option value="AVAILABLE">Available</option>
                <option value="NEEDS_UPDATE">Needs update</option>
              </select>
              <input
                className="min-h-10 min-w-0 rounded-lg border border-gray-200 bg-card px-3 text-sm outline-none focus:border-primary"
                aria-label={`${document.label} reference`}
                placeholder="Reference"
                disabled={!canManage || saving}
                value={document.reference ?? ""}
                maxLength={240}
                onChange={(event) => {
                  const documents = [...profile.documents];
                  documents[index] = { ...document, reference: event.target.value };
                  onChange({ ...profile, documents });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-textSecondary">
        <input
          className="mt-0.5 h-4 w-4"
          type="checkbox"
          disabled={!canManage || saving}
          checked={profile.consentToShare}
          onChange={(event) => onChange({ ...profile, consentToShare: event.target.checked })}
        />
        Record consent to share a selected report. No data is transmitted automatically.
      </label>

      {canManage ? (
        <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" type="button" disabled={saving} onClick={onSave}>
          {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save profile
        </button>
      ) : null}
    </div>
  );
}

function HistoryView({ history }: { history: LoanReadinessHistoryItem[] }) {
  if (history.length === 0) {
    return <p className="rounded-lg border border-gray-200 p-4 text-sm text-textSecondary">No saved Loan Readiness assessments yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-xs uppercase text-textMuted">
          <tr><th className="px-3 py-2">Generated</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Readiness</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Generated by</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {history.map((item) => (
            <tr key={item.id}>
              <td className="whitespace-nowrap px-3 py-3 text-textSecondary">{new Date(item.generatedAt).toLocaleString()}</td>
              <td className="px-3 py-3"><StatusBadge status={normalizeStatus(item.overallStatus)} /></td>
              <td className="px-3 py-3 font-semibold text-textPrimary">{item.percentage}%</td>
              <td className="px-3 py-3 text-textSecondary">{item.locationName ?? "All locations"}</td>
              <td className="px-3 py-3 text-textSecondary">{item.generatedByName ?? "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
      <span className="text-primary">{icon}</span>
      <div><p className="text-xs text-textMuted">{label}</p><p className="text-lg font-semibold text-textPrimary">{value}</p></div>
    </div>
  );
}

function StatusBadge({ status }: { status: LoanReadinessStatus }) {
  const classes: Record<LoanReadinessStatus, string> = {
    Ready: "bg-success/10 text-success",
    "Needs attention": "bg-accent/20 text-textPrimary",
    "Insufficient history": "bg-gray-100 text-textSecondary",
    "Missing data": "bg-danger/10 text-danger",
    "Not applicable": "bg-gray-100 text-textMuted",
  };
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${classes[status]}`}>{status}</span>;
}

function EvidenceRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between gap-4"><dt className="text-textMuted">{label}</dt><dd className="font-medium text-textPrimary">{value}</dd></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-textPrimary"><span>{label}</span>{children}</label>;
}

function LoadingState() {
  return <section className="border-t border-gray-200 py-6"><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <div className="h-20 animate-pulse rounded-lg bg-background" key={item} />)}</div></section>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? "Request failed.");
  return payload;
}

function filenameFromHeader(header: string | null) {
  return header?.match(/filename="([^"]+)"/)?.[1] ?? "loan-readiness.csv";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);
}

function normalizeStatus(value: string): LoanReadinessStatus {
  return ["Ready", "Needs attention", "Insufficient history", "Missing data", "Not applicable"].includes(value)
    ? value as LoanReadinessStatus
    : "Needs attention";
}
