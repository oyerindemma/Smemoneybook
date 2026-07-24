"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  Eye,
  Filter,
  History,
  RefreshCw,
  RotateCcw,
  Settings2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type {
  BusinessAlertPreferenceInput,
  PredictiveAlertLifecycleStatus,
  PredictiveAlertRecord,
  PredictiveAlertSeverity,
} from "@/lib/predictive-alerts/definitions";

const severities: Array<{ value: "all" | PredictiveAlertSeverity; label: string }> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "information", label: "Information" },
];

type PreferencesPayload = BusinessAlertPreferenceInput & {
  category: string;
  severity: string;
  description: string;
  formulaReference: string;
  emailDeliveryAvailable: boolean;
  whatsappDeliveryAvailable: boolean;
};

export function PredictiveAlertsPanel() {
  const { state, setNotice } = useDashboard();
  const [alerts, setAlerts] = useState<PredictiveAlertRecord[]>([]);
  const [history, setHistory] = useState<PredictiveAlertRecord[]>([]);
  const [preferences, setPreferences] = useState<PreferencesPayload[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<"all" | PredictiveAlertSeverity>("all");
  const [category, setCategory] = useState("all");
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dataQuality, setDataQuality] = useState<{ status: string; notes: string[] }>({
    status: "partial",
    notes: [],
  });

  const canView = state.permissions?.canViewPredictiveAlerts !== false;
  const canManage = state.permissions?.canManagePredictiveAlerts !== false;
  const canAcknowledge = state.permissions?.canAcknowledgePredictiveAlerts !== false;
  const canExport = state.permissions?.canExportPredictiveAlerts !== false;
  const selectedAlert = useMemo(
    () => [...alerts, ...history].find((alert) => alert.id === selectedId) ?? alerts[0] ?? history[0] ?? null,
    [alerts, history, selectedId],
  );
  const categories = useMemo(() => {
    const values = Array.from(new Set([...alerts, ...history, ...preferences].map((item) => item.category).filter(Boolean)));
    return ["all", ...values.sort()];
  }, [alerts, history, preferences]);
  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, severity, category),
    [alerts, category, severity],
  );
  const filteredHistory = useMemo(
    () => filterAlerts(history, severity, category),
    [category, history, severity],
  );

  const params = useCallback((statuses: PredictiveAlertLifecycleStatus[]) => {
    const next = new URLSearchParams({
      businessId: state.businessId ?? "",
      status: statuses.join(","),
      periodDays: String(periodDays),
    });

    if (state.selectedLocationId) {
      next.set("locationId", state.selectedLocationId);
    }

    if (severity !== "all") {
      next.set("severity", severity);
    }

    if (category !== "all") {
      next.set("category", category);
    }

    return next;
  }, [category, periodDays, severity, state.businessId, state.selectedLocationId]);

  const loadAlerts = useCallback(async () => {
    if (!state.businessId || !canView) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [activeResponse, historyResponse, preferenceResponse] = await Promise.all([
        fetch(`/api/predictive-alerts?${params(["active", "acknowledged"]).toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/predictive-alerts?${params(["resolved", "dismissed"]).toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/predictive-alerts/preferences?${new URLSearchParams({ businessId: state.businessId }).toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const [activePayload, historyPayload, preferencePayload] = await Promise.all([
        activeResponse.json().catch(() => null) as Promise<{ alerts?: PredictiveAlertRecord[]; error?: string } | null>,
        historyResponse.json().catch(() => null) as Promise<{ alerts?: PredictiveAlertRecord[]; error?: string } | null>,
        preferenceResponse.json().catch(() => null) as Promise<{ preferences?: PreferencesPayload[]; error?: string } | null>,
      ]);

      if (!activeResponse.ok || !activePayload?.alerts) {
        throw new Error(activePayload?.error ?? "Could not load Predictive Alerts.");
      }

      if (!historyResponse.ok || !historyPayload?.alerts) {
        throw new Error(historyPayload?.error ?? "Could not load Predictive Alert history.");
      }

      if (!preferenceResponse.ok || !preferencePayload?.preferences) {
        throw new Error(preferencePayload?.error ?? "Could not load Predictive Alert preferences.");
      }

      const activeAlerts = activePayload.alerts;
      const historyAlerts = historyPayload.alerts;

      setAlerts(activeAlerts);
      setHistory(historyAlerts);
      setPreferences(preferencePayload.preferences);
      setSelectedId((current) => current ?? activeAlerts[0]?.id ?? historyAlerts[0]?.id ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load Predictive Alerts.");
    } finally {
      setLoading(false);
    }
  }, [canView, params, setNotice, state.businessId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAlerts();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadAlerts]);

  async function evaluateAlerts() {
    if (!state.businessId || evaluating || !canManage) {
      return;
    }

    setEvaluating(true);

    try {
      const query = new URLSearchParams({ businessId: state.businessId, periodDays: String(periodDays) });

      if (state.selectedLocationId) {
        query.set("locationId", state.selectedLocationId);
      }

      const response = await fetch(`/api/predictive-alerts/evaluate?${query.toString()}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { alerts?: PredictiveAlertRecord[]; dataQuality?: { status: string; notes: string[] }; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.alerts) {
        throw new Error(payload?.error ?? "Could not evaluate Predictive Alerts.");
      }

      setAlerts(payload.alerts);
      setDataQuality(payload.dataQuality ?? { status: "partial", notes: [] });
      setSelectedId(payload.alerts[0]?.id ?? selectedId);
      setNotice(payload.message ?? "Predictive Alerts evaluated.");
      await loadAlerts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not evaluate Predictive Alerts.");
    } finally {
      setEvaluating(false);
    }
  }

  async function updateAlert(alert: PredictiveAlertRecord, action: "acknowledge" | "dismiss" | "reopen") {
    if (!state.businessId || updatingId || (action === "reopen" ? !canManage : !canAcknowledge)) {
      return;
    }

    setUpdatingId(alert.id);

    try {
      const query = new URLSearchParams({ businessId: state.businessId });

      if (state.selectedLocationId) {
        query.set("locationId", state.selectedLocationId);
      }

      const response = await fetch(`/api/predictive-alerts/${alert.id}/${action}?${query.toString()}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: action === "dismiss" ? { "Content-Type": "application/json" } : undefined,
        body: action === "dismiss" ? JSON.stringify({ reason: dismissReason || "Reviewed and dismissed." }) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as
        | { alert?: PredictiveAlertRecord; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.alert) {
        throw new Error(payload?.error ?? "Could not update Predictive Alert.");
      }

      setNotice(payload.message ?? "Predictive Alert updated.");
      setDismissReason("");
      await loadAlerts();
      setSelectedId(payload.alert.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update Predictive Alert.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function updatePreference(preference: PreferencesPayload, enabled: boolean) {
    if (!state.businessId || !canManage) {
      return;
    }

    setSavingPreference(preference.ruleKey);

    try {
      const response = await fetch(`/api/predictive-alerts/preferences?${new URLSearchParams({ businessId: state.businessId }).toString()}`, {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: [{ ...preference, enabled, emailEnabled: false, whatsappEnabled: false }],
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { preferences?: PreferencesPayload[]; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.preferences) {
        throw new Error(payload?.error ?? "Could not update Predictive Alert preference.");
      }

      setPreferences(payload.preferences);
      setNotice(payload.message ?? "Predictive Alert preferences updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update Predictive Alert preference.");
    } finally {
      setSavingPreference(null);
    }
  }

  async function exportAlerts() {
    if (!state.businessId || exporting || !canExport) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(`/api/predictive-alerts/export?${params(["active", "acknowledged", "resolved", "dismissed"]).toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export Predictive Alerts.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFilename(response.headers.get("Content-Disposition")) ?? "predictive-alerts.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Predictive Alerts exported.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export Predictive Alerts.");
    } finally {
      setExporting(false);
    }
  }

  if (!canView) {
    return (
      <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-textPrimary">Predictive Alerts unavailable</p>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          You do not have permission to view Predictive Alerts.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-textMuted">Predictive Alerts</p>
              <h2 className="text-lg font-semibold text-textPrimary">
                {loading ? "Loading" : `${filteredAlerts.length} active`}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary disabled:opacity-60"
              type="button"
              disabled={evaluating || !canManage}
              onClick={evaluateAlerts}
            >
              <RefreshCw className={evaluating ? "animate-spin" : ""} size={16} aria-hidden="true" />
              Evaluate
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary disabled:opacity-60"
              type="button"
              disabled={exporting || !canExport}
              onClick={exportAlerts}
            >
              <Download size={16} aria-hidden="true" />
              Export
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_180px_1fr]">
          <label className="text-xs font-semibold text-textSecondary">
            Date range
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
              value={periodDays}
              onChange={(event) => setPeriodDays(Number(event.target.value))}
            >
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-textSecondary">
            Severity
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as "all" | PredictiveAlertSeverity)}
            >
              {severities.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-textSecondary">
            Category
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>{item === "all" ? "All" : label(item)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Bell size={18} aria-hidden="true" />
              <h2 className="text-base font-semibold text-textPrimary">Active alerts</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {loading ? (
                <>
                  <div className="h-24 animate-pulse rounded-lg bg-background" />
                  <div className="h-24 animate-pulse rounded-lg bg-background" />
                </>
              ) : filteredAlerts.length ? (
                filteredAlerts.map((alert) => (
                  <AlertRow
                    alert={alert}
                    key={alert.id}
                    selected={selectedAlert?.id === alert.id}
                    onSelect={() => setSelectedId(alert.id)}
                  />
                ))
              ) : (
                <p className="rounded-lg bg-background p-4 text-sm font-medium text-textSecondary">
                  No active predictive alerts for this scope.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History size={18} aria-hidden="true" />
              <h2 className="text-base font-semibold text-textPrimary">Resolved history</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {filteredHistory.length ? (
                filteredHistory.slice(0, 6).map((alert) => (
                  <AlertRow
                    alert={alert}
                    key={alert.id}
                    selected={selectedAlert?.id === alert.id}
                    onSelect={() => setSelectedId(alert.id)}
                  />
                ))
              ) : (
                <p className="rounded-lg bg-background p-4 text-sm font-medium text-textSecondary">
                  No resolved or dismissed alerts yet.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Eye size={18} aria-hidden="true" />
              <h2 className="text-base font-semibold text-textPrimary">Evidence panel</h2>
            </div>
            {selectedAlert ? (
              <div className="mt-4 space-y-4">
                <div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${severityClass(selectedAlert.severity)}`}>
                    {selectedAlert.severity}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-textPrimary">{selectedAlert.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-textSecondary">{selectedAlert.explanation}</p>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs font-semibold text-textMuted">Recommended review action</p>
                  <p className="mt-1 text-sm leading-6 text-textSecondary">{selectedAlert.recommendedAction}</p>
                </div>
                <MetricGrid values={selectedAlert.evidence.metricValues} />
                <div className="rounded-lg bg-background p-3">
                  <p className="text-xs font-semibold text-textMuted">Formula</p>
                  <p className="mt-1 text-sm leading-6 text-textSecondary">{selectedAlert.evidence.formula}</p>
                  <p className="mt-2 text-xs text-textMuted">{selectedAlert.formulaReference}</p>
                </div>
                {selectedAlert.evidence.missingData.length ? (
                  <div className="rounded-lg bg-background p-3">
                    <p className="text-xs font-semibold text-textMuted">Missing data</p>
                    <div className="mt-2 grid gap-2">
                      {selectedAlert.evidence.missingData.map((note) => (
                        <p className="text-sm leading-5 text-textSecondary" key={note}>{note}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedAlert.evidence.disclaimer ? (
                  <p className="rounded-lg bg-background p-3 text-xs leading-5 text-textMuted">
                    {selectedAlert.evidence.disclaimer}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {selectedAlert.lifecycleStatus === "active" ? (
                    <>
                      <button
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-success/20 px-3 text-xs font-semibold text-success disabled:opacity-60"
                        type="button"
                        disabled={updatingId === selectedAlert.id || !canAcknowledge}
                        onClick={() => updateAlert(selectedAlert, "acknowledge")}
                      >
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Acknowledge
                      </button>
                      <button
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-danger/20 px-3 text-xs font-semibold text-danger disabled:opacity-60"
                        type="button"
                        disabled={updatingId === selectedAlert.id || !canAcknowledge}
                        onClick={() => updateAlert(selectedAlert, "dismiss")}
                      >
                        <XCircle size={14} aria-hidden="true" />
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <button
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-textPrimary disabled:opacity-60"
                      type="button"
                      disabled={updatingId === selectedAlert.id || !canManage}
                      onClick={() => updateAlert(selectedAlert, "reopen")}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      Reopen
                    </button>
                  )}
                </div>
                <label className="block text-xs font-semibold text-textSecondary">
                  Dismiss reason
                  <input
                    className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
                    maxLength={500}
                    value={dismissReason}
                    onChange={(event) => setDismissReason(event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-background p-4 text-sm font-medium text-textSecondary">
                Select an alert to view evidence.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Filter size={18} aria-hidden="true" />
              <h2 className="text-base font-semibold text-textPrimary">Data quality state</h2>
            </div>
            <p className="mt-3 text-sm font-semibold text-textPrimary">{dataQuality.status.replace(/_/g, " ")}</p>
            <div className="mt-3 grid gap-2">
              {dataQuality.notes.length ? dataQuality.notes.map((note) => (
                <p className="rounded-lg bg-background p-3 text-sm leading-5 text-textSecondary" key={note}>{note}</p>
              )) : (
                <p className="rounded-lg bg-background p-3 text-sm leading-5 text-textSecondary">
                  Core source checks are available for this scope.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Settings2 size={18} aria-hidden="true" />
              <h2 className="text-base font-semibold text-textPrimary">Preferences</h2>
            </div>
            <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-1">
              {preferences.map((preference) => (
                <label
                  className="flex items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm"
                  key={preference.ruleKey}
                >
                  <span>
                    <span className="block font-semibold text-textPrimary">{label(preference.ruleKey)}</span>
                    <span className="block text-xs text-textMuted">{label(preference.category)}</span>
                  </span>
                  <input
                    checked={preference.enabled !== false}
                    disabled={savingPreference === preference.ruleKey || !canManage}
                    type="checkbox"
                    onChange={(event) => updatePreference(preference, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function AlertRow({
  alert,
  selected,
  onSelect,
}: {
  alert: PredictiveAlertRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`rounded-lg border p-4 text-left transition ${
        selected ? "border-primary/40 bg-primary/5" : "border-gray-100 bg-background hover:border-primary/30"
      }`}
      type="button"
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${severityClass(alert.severity)}`}>
            {alert.severity}
          </span>
          <h3 className="mt-2 text-sm font-semibold text-textPrimary">{alert.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-textSecondary">{alert.explanation}</p>
        </div>
        {alert.impactAmount > 0 ? (
          <span className="text-sm font-semibold text-textPrimary">{formatCurrency(alert.impactAmount)}</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-textMuted">
        <span>{label(alert.category)}</span>
        <span>{alert.lifecycleStatus}</span>
      </div>
    </button>
  );
}

function MetricGrid({ values }: { values: Record<string, number | string | boolean | null> }) {
  const entries = Object.entries(values).slice(0, 8);

  if (!entries.length) {
    return null;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div className="rounded-lg bg-background p-3" key={key}>
          <p className="text-xs font-semibold text-textMuted">{label(key)}</p>
          <p className="mt-1 text-sm font-semibold text-textPrimary">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

function filterAlerts(
  alerts: PredictiveAlertRecord[],
  severity: "all" | PredictiveAlertSeverity,
  category: string,
) {
  return alerts.filter((alert) =>
    (severity === "all" || alert.severity === severity) &&
    (category === "all" || alert.category === category),
  );
}

function severityClass(severity: PredictiveAlertSeverity) {
  if (severity === "critical") {
    return "bg-danger/10 text-danger";
  }

  if (severity === "high") {
    return "bg-warning/10 text-warning";
  }

  if (severity === "medium") {
    return "bg-primary/10 text-primary";
  }

  return "bg-gray-100 text-textSecondary";
}

function label(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function getFilename(disposition: string | null) {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1];
}
