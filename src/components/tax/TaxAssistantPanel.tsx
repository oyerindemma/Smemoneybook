"use client";

import {
  AlertTriangle,
  Calculator,
  ClipboardList,
  Download,
  FileText,
  Info,
  MessageSquareText,
  RefreshCw,
  Send,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type {
  TaxAssistantChatAnswer,
  TaxAssistantSummary,
  TaxReviewItemDto,
} from "@/lib/tax-assistant/definitions";

type ReviewPayload = {
  items: TaxReviewItemDto[];
  total: number;
};

type RulePayload = {
  ruleSet?: {
    version: string;
    status: string;
    sourceAuthority: string;
    sourceReference: string;
    lastVerifiedAt?: string | null;
  } | null;
  rules?: Array<{
    id: string;
    taxType: string;
    transactionType: string;
    rate: number;
    status: string;
  }>;
  warnings?: string[];
};

const suggestedQuestions = [
  "What VAT should I review this month?",
  "Which records are missing receipts?",
  "Explain the WHT position.",
];

export function TaxAssistantPanel() {
  const { state, setNotice } = useDashboard();
  const now = new Date();
  const [frequency, setFrequency] = useState("MONTHLY");
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));
  const [quarter, setQuarter] = useState(String(Math.floor(now.getUTCMonth() / 3) + 1));
  const [year, setYear] = useState(String(now.getUTCFullYear()));
  const [summary, setSummary] = useState<TaxAssistantSummary | null>(null);
  const [reviewItems, setReviewItems] = useState<TaxReviewItemDto[]>([]);
  const [selectedItem, setSelectedItem] = useState<TaxReviewItemDto | null>(null);
  const [rules, setRules] = useState<RulePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [question, setQuestion] = useState(suggestedQuestions[0]);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<TaxAssistantChatAnswer | null>(null);
  const [error, setError] = useState("");

  const canView = state.permissions?.canViewTaxAssistant !== false;
  const canAsk = state.permissions?.canAskTaxAssistant !== false;
  const canReview = state.permissions?.canReviewTaxAssistant !== false;
  const canExport = state.permissions?.canExportTaxAssistant !== false;

  const params = useMemo(() => {
    const next = new URLSearchParams({
      frequency,
      year,
    });

    if (state.businessId) {
      next.set("businessId", state.businessId);
    }

    if (state.selectedLocationId) {
      next.set("locationId", state.selectedLocationId);
    }

    if (frequency === "MONTHLY") {
      next.set("month", month);
    }

    if (frequency === "QUARTERLY") {
      next.set("quarter", quarter);
    }

    return next;
  }, [frequency, month, quarter, state.businessId, state.selectedLocationId, year]);

  const loadWorkspace = useCallback(async () => {
    if (!state.businessId || !canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [summaryResponse, reviewResponse, rulesResponse] = await Promise.all([
        fetch(`/api/tax-assistant/summary?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
        canReview
          ? fetch(`/api/tax-assistant/review-items?${params.toString()}`, {
              credentials: "include",
              cache: "no-store",
            })
          : Promise.resolve(null),
        fetch(`/api/tax-assistant/rules?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const summaryPayload = (await summaryResponse.json().catch(() => null)) as
        | { summary?: TaxAssistantSummary; error?: string }
        | null;

      if (!summaryResponse.ok || !summaryPayload?.summary) {
        throw new Error(summaryPayload?.error ?? "Could not load Tax Assistant.");
      }

      let nextReviewItems: TaxReviewItemDto[] = [];

      if (reviewResponse) {
        const reviewPayload = (await reviewResponse.json().catch(() => null)) as ReviewPayload & { error?: string } | null;

        if (!reviewResponse.ok) {
          throw new Error(reviewPayload?.error ?? "Could not load tax review items.");
        }

        nextReviewItems = reviewPayload?.items ?? [];
      }

      const rulesPayload = (await rulesResponse.json().catch(() => null)) as RulePayload & { error?: string } | null;

      if (!rulesResponse.ok) {
        throw new Error(rulesPayload?.error ?? "Could not load tax rules.");
      }

      setSummary(summaryPayload.summary);
      setReviewItems(nextReviewItems);
      setSelectedItem(nextReviewItems[0] ?? null);
      setRules(rulesPayload);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load Tax Assistant.";
      setError(message);
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }, [canReview, canView, params, setNotice, state.businessId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function openReviewItem(item: TaxReviewItemDto) {
    setSelectedItem(item);

    if (!canReview) {
      return;
    }

    const response = await fetch(
      `/api/tax-assistant/review-items/${encodeURIComponent(item.id)}?${params.toString()}`,
      { credentials: "include", cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { item?: TaxReviewItemDto; error?: string }
      | null;

    if (response.ok && payload?.item) {
      setSelectedItem(payload.item);
      return;
    }

    setNotice(payload?.error ?? "Could not open tax review item.");
  }

  async function exportWorkingPaper() {
    if (!state.businessId || !summary || !canExport) {
      return;
    }

    setExporting(true);

    try {
      const response = await fetch(`/api/tax-assistant/export?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not export Tax Assistant working paper.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getFilename(response.headers.get("Content-Disposition")) ?? "tax-assistant-working-paper.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Tax Assistant working paper exported.");
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "Could not export Tax Assistant working paper.");
    } finally {
      setExporting(false);
    }
  }

  async function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!state.businessId || asking || !canAsk) {
      return;
    }

    setAsking(true);

    try {
      const response = await fetch("/api/tax-assistant/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          frequency,
          month: Number(month),
          quarter: Number(quarter),
          year: Number(year),
          question,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { result?: TaxAssistantChatAnswer; error?: string }
        | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.error ?? "Could not answer Tax Assistant question.");
      }

      setAnswer(payload.result);
      setNotice("Tax Assistant answered from recorded data.");
    } catch (askError) {
      setNotice(askError instanceof Error ? askError.message : "Could not answer Tax Assistant question.");
    } finally {
      setAsking(false);
    }
  }

  if (!canView) {
    return (
      <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm md:p-6">
        <p className="text-sm font-semibold text-textPrimary">Tax Assistant unavailable</p>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          You do not have permission to view Tax Assistant.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-semibold text-textSecondary">
              Frequency
              <select
                className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-textPrimary"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>
            {frequency === "MONTHLY" ? (
              <label className="text-xs font-semibold text-textSecondary">
                Month
                <input
                  className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-textPrimary"
                  max="12"
                  min="1"
                  type="number"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              </label>
            ) : null}
            {frequency === "QUARTERLY" ? (
              <label className="text-xs font-semibold text-textSecondary">
                Quarter
                <input
                  className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-textPrimary"
                  max="4"
                  min="1"
                  type="number"
                  value={quarter}
                  onChange={(event) => setQuarter(event.target.value)}
                />
              </label>
            ) : null}
            <label className="text-xs font-semibold text-textSecondary">
              Year
              <input
                className="mt-1 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium text-textPrimary"
                min="2020"
                type="number"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
              type="button"
              onClick={() => void loadWorkspace()}
              disabled={loading}
              title="Refresh Tax Assistant"
              aria-label="Refresh Tax Assistant"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
              type="button"
              onClick={() => void exportWorkingPaper()}
              disabled={!summary || !canExport || exporting}
              title="Export working paper"
              aria-label="Export working paper"
            >
              {exporting ? <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              Export
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !summary ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="h-28 animate-pulse rounded-lg bg-card shadow-sm" key={item} />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Taxable sales" value={formatCurrency(summary.figures.taxableSales, summary.currency)} />
            <Metric label="Output VAT" value={formatCurrency(summary.figures.outputVatEstimate, summary.currency)} />
            <Metric label="Net VAT estimate" value={formatCurrency(summary.figures.netVatEstimate, summary.currency)} />
            <Metric label="WHT recorded" value={formatCurrency(summary.figures.whtDeductedByCustomers, summary.currency)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="space-y-5">
              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Calculator size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Tax readiness summary</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <CompactMetric label="Period" value={`${shortDate(summary.periodStart)} - ${shortDate(summary.periodEnd)}`} />
                  <CompactMetric label="Readiness" value={`${summary.figures.taxReadinessScore}/100`} />
                  <CompactMetric label="Data completeness" value={`${summary.figures.dataCompletenessRate}%`} />
                  <CompactMetric label="Unresolved amount" value={formatCurrency(summary.figures.unresolvedTaxImpactingAmount, summary.currency)} />
                  <CompactMetric label="Eligible expenses" value={formatCurrency(summary.figures.taxableExpenses, summary.currency)} />
                  <CompactMetric label="Unreconciled amount" value={formatCurrency(summary.figures.unreconciledTaxImpactingAmount, summary.currency)} />
                </div>
                {summary.counts.includedTransactionCount === 0 ? (
                  <p className="mt-4 rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                    No tax-impacting records were found for this filing period.
                  </p>
                ) : null}
                {summary.missingInformation.length > 0 ? (
                  <IssueStrip
                    icon={<AlertTriangle size={16} aria-hidden="true" />}
                    title="Setup required"
                    items={summary.missingInformation}
                  />
                ) : null}
              </section>

              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileText size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Calculation explanation</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {summary.formulas.map((formula) => (
                    <div className="rounded-lg bg-background p-3" key={formula.label}>
                      <p className="text-sm font-semibold text-textPrimary">{formula.label}</p>
                      <p className="mt-1 text-sm leading-6 text-textSecondary">{formula.formula}</p>
                      <p className="mt-1 text-xs font-medium text-textMuted">
                        {formula.sourceTables.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
                <IssueStrip
                  icon={<Info size={16} aria-hidden="true" />}
                  title="Assumptions"
                  items={summary.assumptions}
                />
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={18} aria-hidden="true" />
                    <h2 className="text-base font-semibold text-textPrimary">Tax review checklist</h2>
                  </div>
                  <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-textSecondary">
                    {canReview ? `${reviewItems.length} open` : "Restricted"}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {canReview && reviewItems.length > 0 ? (
                    reviewItems.slice(0, 8).map((item) => (
                      <button
                        className="block w-full rounded-lg border border-gray-100 p-3 text-left transition hover:border-primary/30 hover:bg-background"
                        key={item.id}
                        type="button"
                        onClick={() => void openReviewItem(item)}
                      >
                        <span className="text-xs font-semibold uppercase text-textMuted">{item.severity}</span>
                        <span className="mt-1 block text-sm font-semibold text-textPrimary">{item.issueType.replace(/_/g, " ")}</span>
                        <span className="mt-1 block text-sm leading-5 text-textSecondary">{item.explanation}</span>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg bg-background p-3 text-sm font-medium text-textSecondary">
                      {canReview ? "No review items for this period." : "You do not have permission to review Tax Assistant items."}
                    </p>
                  )}
                </div>
                {selectedItem ? (
                  <div className="mt-4 rounded-lg border border-gray-100 p-3">
                    <p className="text-sm font-semibold text-textPrimary">{selectedItem.issueType.replace(/_/g, " ")}</p>
                    <p className="mt-2 text-sm leading-6 text-textSecondary">{selectedItem.recommendedAction}</p>
                    {selectedItem.recordLabel ? (
                      <p className="mt-2 text-xs font-medium text-textMuted">{selectedItem.recordLabel}</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <MessageSquareText size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold text-textPrimary">Ask Tax Assistant</h2>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestedQuestions.map((item) => (
                    <button
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-textSecondary transition hover:bg-background"
                      key={item}
                      type="button"
                      onClick={() => setQuestion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <form className="mt-4 flex gap-2" onSubmit={(event) => void askAssistant(event)}>
                  <label className="sr-only" htmlFor="tax-assistant-question">Tax question</label>
                  <input
                    className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm text-textPrimary"
                    id="tax-assistant-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    disabled={!canAsk}
                  />
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-white transition hover:bg-primary/90 disabled:opacity-60"
                    type="submit"
                    disabled={!canAsk || asking}
                    title="Ask Tax Assistant"
                    aria-label="Ask Tax Assistant"
                  >
                    {asking ? <RefreshCw className="animate-spin" size={17} aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
                  </button>
                </form>
                {answer ? (
                  <div className="mt-4 rounded-lg bg-background p-3">
                    <p className="whitespace-pre-line text-sm leading-6 text-textSecondary">{answer.answer}</p>
                    <p className="mt-3 text-xs font-medium text-textMuted">
                      {answer.provider} · {answer.source.ruleSetVersion}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-gray-100 bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold text-textPrimary">Rule source</p>
                <p className="mt-2 text-sm leading-6 text-textSecondary">
                  {rules?.ruleSet
                    ? `${rules.ruleSet.sourceAuthority} · ${rules.ruleSet.version} · ${rules.ruleSet.status}`
                    : "No verified Tax Assistant rule set is configured."}
                </p>
                <p className="mt-2 break-words text-xs font-medium text-textMuted">
                  {rules?.ruleSet?.sourceReference ?? summary.source.sourceReference}
                </p>
                <p className="mt-4 rounded-lg bg-background p-3 text-xs leading-5 text-textMuted">
                  {summary.disclaimer}
                </p>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-textMuted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-semibold text-textMuted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function IssueStrip({
  icon,
  title,
  items,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
        {icon}
        {title}
      </div>
      <div className="mt-2 space-y-1">
        {items.slice(0, 5).map((item) => (
          <p className="text-sm leading-5 text-textSecondary" key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getFilename(disposition: string | null) {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1];
}
