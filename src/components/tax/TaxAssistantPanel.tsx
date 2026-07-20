"use client";

import { Calculator, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { TaxAssistantSummary } from "@/lib/phase3/tax-assistant";

export function TaxAssistantPanel() {
  const { state, setNotice } = useDashboard();
  const [summary, setSummary] = useState<TaxAssistantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSummary() {
      if (!state.businessId) {
        return;
      }

      try {
        const params = new URLSearchParams({ businessId: state.businessId });
        if (state.selectedLocationId) {
          params.set("locationId", state.selectedLocationId);
        }

        const response = await fetch(`/api/tax-assistant?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { summary?: TaxAssistantSummary; error?: string } | null;

        if (!response.ok || !payload?.summary) {
          throw new Error(payload?.error ?? "Could not load tax assistant.");
        }

        if (mounted) {
          setSummary(payload.summary);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load tax assistant.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      mounted = false;
    };
  }, [state.businessId, state.selectedLocationId, setNotice]);

  async function saveSnapshot() {
    if (!state.businessId || !summary || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/tax-assistant", {
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
        throw new Error(payload?.error ?? "Could not save tax assistant snapshot.");
      }

      setNotice(payload?.message ?? "Tax assistant snapshot saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save tax assistant snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calculator size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Tax estimate</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Calculating..." : summary ? formatCurrency(summary.estimatedTax) : "Unavailable"}
            </h2>
            {summary ? (
              <p className="mt-1 text-xs text-textMuted">
                {summary.confidence} confidence · {summary.country}
              </p>
            ) : null}
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={!summary || saving}
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
      ) : summary ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Metric label="Taxable sales" value={formatCurrency(summary.taxableSales)} />
            <Metric label="Snapshots" value={String(summary.exportSummary.documentTaxSnapshotCount)} />
            <Metric label="Prior runs" value={String(summary.exportSummary.priorTaxRunCount)} />
          </div>
          <p className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium leading-6 text-textSecondary">
            {summary.disclaimer}
          </p>
          <IssueList title="Missing settings" items={summary.missingSettings} />
          <IssueList title="Inconsistencies" items={summary.inconsistencies} />
          <IssueList title="Reminders" items={summary.reminders} />
          {summary.dataWarnings[0] ? (
            <p className="mt-4 text-xs leading-5 text-textMuted">{summary.dataWarnings[0]}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Tax assistant is not available for this business yet.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-2 text-base font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 rounded-2xl bg-background p-4">
      <p className="text-xs font-semibold text-textPrimary">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.slice(0, 4).map((item) => (
          <p className="text-sm leading-5 text-textSecondary" key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
