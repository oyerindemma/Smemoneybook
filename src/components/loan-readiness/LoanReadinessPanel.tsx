"use client";

import { RefreshCw, Save, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type {
  LoanReadinessAssessment,
  LoanReadinessComponent,
} from "@/lib/phase3/loan-readiness";

export function LoanReadinessPanel() {
  const { state, setNotice } = useDashboard();
  const [assessment, setAssessment] = useState<LoanReadinessAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadAssessment() {
      if (!state.businessId) {
        return;
      }

      try {
        const params = new URLSearchParams({ businessId: state.businessId });
        if (state.selectedLocationId) {
          params.set("locationId", state.selectedLocationId);
        }

        const response = await fetch(`/api/loan-readiness?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { assessment?: LoanReadinessAssessment; error?: string }
          | null;

        if (!response.ok || !payload?.assessment) {
          throw new Error(payload?.error ?? "Could not load loan readiness.");
        }

        if (mounted) {
          setAssessment(payload.assessment);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load loan readiness.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadAssessment();

    return () => {
      mounted = false;
    };
  }, [state.businessId, state.selectedLocationId, setNotice]);

  async function saveSnapshot() {
    if (!state.businessId || !assessment || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/loan-readiness", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          locationId: state.selectedLocationId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not save loan readiness snapshot.");
      }

      setNotice(payload?.message ?? "Loan readiness snapshot saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save loan readiness snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-textPrimary">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Readiness score</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Calculating..." : assessment ? `${assessment.score}/100 · ${assessment.rating}` : "Unavailable"}
            </h2>
            {assessment ? (
              <p className="mt-1 text-xs text-textMuted">
                {assessment.confidence} confidence · {new Date(assessment.generatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={!assessment || saving}
          onClick={saveSnapshot}
        >
          {saving ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save
        </button>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="h-24 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : assessment ? (
        <>
          <p className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium leading-6 text-textSecondary">
            {assessment.disclaimer}
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {assessment.components.map((component) => (
              <ComponentTile component={component} key={component.id} />
            ))}
          </div>
          {assessment.recommendations.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary">Recommended action</p>
              <p className="mt-2 text-sm font-medium leading-6 text-textPrimary">
                {assessment.recommendations[0]}
              </p>
            </div>
          ) : null}
          {assessment.dataWarnings[0] ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">{assessment.dataWarnings[0]}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Loan readiness is not available for this business yet.
        </div>
      )}
    </section>
  );
}

function ComponentTile({ component }: { component: LoanReadinessComponent }) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-textPrimary">{component.label}</p>
          <p className="mt-1 text-xs text-textMuted">
            {component.score}/{component.weight}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(component.status)}`}>
          {statusLabel(component.status)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-textSecondary">{component.explanation}</p>
    </div>
  );
}

function statusClass(status: LoanReadinessComponent["status"]) {
  return {
    strength: "bg-success/10 text-success",
    neutral: "bg-primary/10 text-primary",
    weakness: "bg-danger/10 text-danger",
    insufficient_data: "bg-gray-100 text-textMuted",
  }[status];
}

function statusLabel(status: LoanReadinessComponent["status"]) {
  return {
    strength: "Strong",
    neutral: "Neutral",
    weakness: "Weak",
    insufficient_data: "More data",
  }[status];
}
