"use client";

import type React from "react";
import Link from "next/link";
import {
  Banknote,
  HandCoins,
  Mic,
  Plus,
  ReceiptText,
} from "lucide-react";
import type { RecordMoneyMode } from "@/components/dashboard/types";
import type { VoiceBookkeepingDraft } from "@/lib/voice";
import { formatNaira, type MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { getMoneyTotals, getTransactionsSince, getPeriodStart } from "@/lib/dashboard/simple-insights";
import { buildRetentionEngine } from "@/lib/retention/retention-engine";
import { trackProductEvent } from "@/lib/analytics/product-analytics";
import { createVoiceBookkeepingDraft } from "@/lib/voice";

type CoreMoneyDashboardProps = {
  state: MoneybookState;
  todayActivityCount: number;
  onAction: (mode: RecordMoneyMode) => void;
  onVoiceDraft: (draft: VoiceBookkeepingDraft) => void;
};

export function CoreMoneyDashboard({
  state,
  todayActivityCount,
  onAction,
  onVoiceDraft,
}: CoreMoneyDashboardProps) {
  const activeTransactions = state.transactions.filter(
    (transaction) => !transaction.reversedByTransactionId,
  );
  const today = getTransactionsSince(activeTransactions, getStartOfToday());
  const week = getTransactionsSince(activeTransactions, getPeriodStart("week"));
  const todayTotals = getMoneyTotals(today);
  const weekTotals = getMoneyTotals(week);
  const cashAvailable = state.accounts.reduce((sum, account) => sum + account.balance, 0);
  const unpaidInvoices = state.debts
    .filter((debt) => debt.type === "customer_owes_business" && debt.status === "open")
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const weeklyGrowth =
    weekTotals.moneyIn > 0
      ? "Sales are moving this week."
      : "Record a sale to see weekly growth.";
  const spendingWarning =
    todayTotals.moneyOut > todayTotals.moneyIn && todayTotals.moneyOut > 0
      ? "You spent more than you made today."
      : "Spending looks okay today.";
  const retention = buildRetentionEngine(state);

  return (
    <main className="space-y-4 pb-3 md:space-y-5">
      <section className="rounded-2xl bg-primary p-4 text-white shadow-sm md:p-5">
        <p className="text-sm font-medium text-white/75">Today</p>
        <h1 className="mt-1.5 text-xl font-semibold leading-tight md:text-2xl">
          {todayTotals.profit > 0
            ? `Your business made ${formatNaira(todayTotals.profit)} profit today.`
            : todayActivityCount > 0
              ? "Your money is recorded for today."
              : "Track your business money in seconds."}
        </h1>
        <p className="mt-2 text-sm leading-5 text-white/75">
          {todayActivityCount > 0
            ? "Great work tracking your business consistently."
            : "Add one sale or expense to see today’s profit clearly."}
        </p>
      </section>

      <section aria-label="Today money summary" className="grid grid-cols-2 gap-3">
        <MoneyTile label="Today’s Sales" value={todayTotals.moneyIn} tone="good" />
        <MoneyTile label="Today’s Expenses" value={todayTotals.moneyOut} tone="warn" />
        <MoneyTile label="Today’s Profit" value={todayTotals.profit} tone="profit" />
        <MoneyTile label="Available Money" value={cashAvailable} tone="cash" />
      </section>

      <section aria-label="Quick actions" className="rounded-2xl border border-gray-100 bg-card p-3.5 shadow-sm md:p-4">
        <h2 className="text-lg font-semibold tracking-tight text-textPrimary">Quick actions</h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5 md:gap-3">
          <ActionButton
            icon={<Plus size={20} />}
            label="Add Sale"
            onClick={() => onAction("sale")}
            onVoice={() => startVoiceEntry("sale", onVoiceDraft)}
          />
          <ActionButton
            icon={<ReceiptText size={20} />}
            label="Add Expense"
            onClick={() => onAction("expense")}
            onVoice={() => startVoiceEntry("expense", onVoiceDraft)}
          />
          <ActionButton icon={<HandCoins size={20} />} label="Send Invoice" onClick={() => onAction("invoice")} />
          <Link
            className="flex min-h-20 items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left text-sm font-semibold text-textPrimary shadow-sm transition active:scale-[0.98]"
            href="/customers"
          >
            <Banknote size={20} aria-hidden="true" />
            <span>Receive Payment</span>
          </Link>
        </div>
      </section>

      <section aria-label="Money insights" className="grid gap-2.5 md:grid-cols-2 md:gap-3">
        <InsightLine label="Unpaid invoices" value={formatNaira(unpaidInvoices)} />
        <InsightLine label="Weekly growth" value={weeklyGrowth} />
        <InsightLine label="Spending warning" value={spendingWarning} />
        <InsightLine label="Business health score" value={`${retention.businessHealth.score}/100 · ${retention.businessHealth.rating}`} />
      </section>

      <p className="px-1 text-center text-sm leading-6 text-textSecondary">
        View profit and cash balance at the top anytime.
      </p>
    </main>
  );
}

function MoneyTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "profit" | "cash";
}) {
  const toneClass = {
    good: "bg-success/10 text-success",
    warn: "bg-danger/10 text-danger",
    profit: value >= 0 ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger",
    cash: "bg-accent/20 text-textPrimary",
  }[tone];

  return (
    <div className="min-h-20 rounded-2xl border border-gray-100 bg-card p-3.5 shadow-sm md:min-h-24 md:p-4">
      <p className="text-sm font-medium text-textSecondary">{label}</p>
      <strong className={`mt-2 inline-block rounded-xl px-2 py-1 text-base font-bold tabular-nums md:text-lg ${toneClass}`}>
        {formatNaira(value)}
      </strong>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  onVoice,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  onVoice?: () => void;
}) {
  return (
    <div className="grid min-h-16 grid-cols-[1fr_48px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:min-h-18 md:grid-cols-[1fr_52px]">
      <button
        className="flex items-center gap-2.5 p-3 text-left text-sm font-semibold text-textPrimary transition active:scale-[0.98] md:gap-3 md:p-4"
        type="button"
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
      </button>
      {onVoice ? (
        <button
          aria-label={`${label} by voice`}
          className="flex items-center justify-center border-l border-gray-200 text-primary transition active:scale-[0.96]"
          type="button"
          onClick={onVoice}
        >
          <Mic size={20} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function InsightLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-3.5 shadow-sm md:p-4">
      <p className="text-sm font-medium text-textSecondary">{label}</p>
      <p className="mt-1.5 text-sm font-semibold leading-5 text-textPrimary md:text-base md:leading-6">{value}</p>
    </div>
  );
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function startVoiceEntry(
  expectedKind: "sale" | "expense",
  onVoiceDraft: (draft: VoiceBookkeepingDraft) => void,
) {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

  trackProductEvent("voice_entry_started", { expected_kind: expectedKind });

  if (!Recognition) {
    trackProductEvent("voice_entry_failed", {
      expected_kind: expectedKind,
      reason: "unsupported_browser",
    });
    window.alert("Voice entry works best on Android Chrome. This browser does not support it yet.");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-NG";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
    if (!transcript) {
      trackProductEvent("voice_entry_failed", {
        expected_kind: expectedKind,
        reason: "empty_transcript",
      });
      return;
    }

    const draft = normalizeVoiceDraft(createVoiceBookkeepingDraft(transcript), expectedKind);
    trackProductEvent("voice_entry_parsed", {
      expected_kind: expectedKind,
      parsed_kind: draft.intent.kind,
      has_amount: Boolean(draft.capture?.amount),
    });
    onVoiceDraft(draft);
  };

  recognition.onerror = (event) => {
    trackProductEvent("voice_entry_failed", {
      expected_kind: expectedKind,
      reason: event.error ?? "recognition_error",
    });
  };

  recognition.onend = null;
  recognition.start();
}

function normalizeVoiceDraft(
  draft: VoiceBookkeepingDraft,
  expectedKind: "sale" | "expense",
): VoiceBookkeepingDraft {
  if (draft.intent.kind !== "unknown") {
    return draft;
  }

  return {
    intent: {
      kind: expectedKind,
      rawText: draft.intent.rawText,
      amount: draft.capture?.amount,
    },
    capture: {
      type: expectedKind,
      amount: draft.capture?.amount,
      description: draft.intent.rawText,
      paymentStatus: "paid",
    },
    needsReview: true,
  };
}
