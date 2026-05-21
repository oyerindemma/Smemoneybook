"use client";

import type React from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CaptureFormData } from "@/components/dashboard/types";
import { trackProductEvent } from "@/lib/analytics/product-analytics";
import { getBusinessTemplate } from "@/lib/bookkeeping/business-templates";
import { formatNaira, type MoneybookState } from "@/lib/bookkeeping/transaction-engine";

const businessTypes = [
  "Fashion",
  "Food business",
  "POS business",
  "Retail shop",
  "Pharmacy",
  "Freelancer",
  "Beauty salon",
  "Electronics",
  "Logistics",
  "Other",
];

const goals = [
  "Track sales",
  "Track expenses",
  "Know my profit",
  "Send invoices",
  "Manage customers",
  "Business reports",
];

const reminders = ["WhatsApp", "Push notification", "Email"];

type Step = "business" | "goal" | "first" | "aha" | "reminder";
type FirstAction = "sale" | "expense";

export function OnboardingSetup({
  initialBusinessName = "",
  initialBusinessType = "Retail shop",
  onComplete,
  onFirstTransaction,
  onDashboard,
}: {
  initialBusinessName?: string;
  initialBusinessType?: string;
  onComplete: (input: { businessName: string; businessType: string }) => Promise<MoneybookState>;
  onFirstTransaction: (formData: CaptureFormData) => Promise<MoneybookState>;
  onDashboard: () => void;
}) {
  const [step, setStep] = useState<Step>("business");
  const [businessType, setBusinessType] = useState(
    businessTypes.includes(initialBusinessType) ? initialBusinessType : "Retail shop",
  );
  const [goal, setGoal] = useState(goals[0]);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [setupState, setSetupState] = useState<MoneybookState | null>(null);
  const [firstAction, setFirstAction] = useState<FirstAction>("sale");
  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activatedState, setActivatedState] = useState<MoneybookState | null>(null);
  const template = getBusinessTemplate(businessType);
  const accountId = useMemo(
    () =>
      setupState?.accounts.find((account) => account.type === "cash")?.id ??
      setupState?.accounts[0]?.id ??
      "",
    [setupState],
  );

  useEffect(() => {
    trackProductEvent("onboarding_step_viewed", { step });
  }, [step]);

  async function createSetup(nextStep: Step) {
    setError("");
    setIsSaving(true);
    try {
      const cleanName = businessName.trim() || `My ${businessType}`;
      localStorage.setItem("activationGoal", goal);
      const state = await onComplete({ businessName: cleanName, businessType });
      setSetupState(state);
      trackProductEvent("onboarding_completed", {
        business_type: businessType,
        activation_goal: goal,
        template_categories: template.expenseCategories.join(","),
        has_business_name: Boolean(businessName.trim()),
      });
      setStep(nextStep);
    } catch {
      setError("Couldn’t set up your business. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitFirstTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountNumber = Number(amount);

    if (!setupState) {
      await createSetup("first");
      return;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError("Enter an amount.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      const nextState = await onFirstTransaction({
        type: firstAction,
        amount: amountNumber,
        accountId,
        businessId: setupState.businessId,
        description: note.trim() || (firstAction === "sale" ? "First sale" : category || "First expense"),
        category: firstAction === "expense" ? category || undefined : undefined,
        paymentStatus: "paid",
        partyName: firstAction === "sale" ? customer.trim() || undefined : undefined,
      });
      setActivatedState(nextState);
      trackProductEvent("activation_aha_moment", {
        type: firstAction,
        business_type: businessType,
        time_to_activation_seconds: undefined,
      });
      setStep("aha");
    } catch {
      setError("Couldn’t save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (step === "business") {
    return (
      <OnboardingShell kicker="Step 1 of 4" title="What business do you run?">
        <div className="grid grid-cols-2 gap-2">
          {businessTypes.map((type) => (
            <button
              key={type}
              className={`min-h-16 rounded-xl border px-3 text-left text-sm font-semibold ${
                businessType === type
                  ? "border-primary bg-primary text-white"
                  : "border-gray-200 bg-white text-textPrimary"
              }`}
              type="button"
              onClick={() => {
                setBusinessType(type);
                trackProductEvent("business_type_selected", { business_type: type });
              }}
            >
              {type}
            </button>
          ))}
        </div>
        <label className="mt-4 grid gap-2 text-sm font-medium">
          Business name optional
          <input
            className="h-12 rounded-xl border border-gray-200 px-3"
            placeholder={`e.g. My ${businessType}`}
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />
        </label>
        <button className="mt-5 w-full rounded-xl bg-primary px-5 py-4 font-semibold text-white" type="button" onClick={() => setStep("goal")}>
          Continue
        </button>
      </OnboardingShell>
    );
  }

  if (step === "goal") {
    return (
      <OnboardingShell kicker="Step 2 of 4" title="What do you want help with?">
        <div className="grid gap-2">
          {goals.map((item) => (
            <button
              key={item}
              className={`min-h-12 rounded-xl border px-3 text-left text-sm font-semibold ${
                goal === item ? "border-success bg-success/10 text-success" : "border-gray-200 bg-white"
              }`}
              type="button"
              onClick={() => {
                setGoal(item);
                trackProductEvent("main_goal_selected", { goal: item, business_type: businessType });
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-background p-4">
          <p className="text-sm font-semibold">{businessType} setup ready</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {template.expenseCategories.slice(0, 5).map((item) => (
              <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-textSecondary">
                {item}
              </span>
            ))}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
        <button
          className="mt-5 w-full rounded-xl bg-primary px-5 py-4 font-semibold text-white disabled:bg-textMuted"
          type="button"
          disabled={isSaving}
          onClick={() => void createSetup("first")}
        >
          {isSaving ? "Setting up..." : "Record my first transaction"}
        </button>
      </OnboardingShell>
    );
  }

  if (step === "first") {
    return (
      <OnboardingShell kicker="Step 3 of 4" title="Let’s record your first business transaction.">
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${firstAction === "sale" ? "border-success bg-success text-white" : "border-gray-200 bg-white"}`}
            type="button"
            onClick={() => setFirstAction("sale")}
          >
            Add Sale
          </button>
          <button
            className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${firstAction === "expense" ? "border-danger bg-danger text-white" : "border-gray-200 bg-white"}`}
            type="button"
            onClick={() => setFirstAction("expense")}
          >
            Add Expense
          </button>
        </div>
        <form className="mt-4 grid gap-4" onSubmit={submitFirstTransaction}>
          <label className="grid gap-2 text-sm font-medium">
            Amount
            <input
              className="h-14 rounded-xl border border-gray-200 px-4 text-xl font-bold"
              inputMode="numeric"
              min="1"
              placeholder="25000"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          {firstAction === "sale" ? (
            <label className="grid gap-2 text-sm font-medium">
              Customer optional
              <input className="h-12 rounded-xl border border-gray-200 px-3" value={customer} onChange={(event) => setCustomer(event.target.value)} />
            </label>
          ) : (
            <label className="grid gap-2 text-sm font-medium">
              Category
              <select className="h-12 rounded-xl border border-gray-200 bg-white px-3" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Choose category</option>
                {template.expenseCategories.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-2 text-sm font-medium">
            Note optional
            <input className="h-12 rounded-xl border border-gray-200 px-3" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
          <button className="rounded-xl bg-primary px-5 py-4 font-semibold text-white disabled:bg-textMuted" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save first record"}
          </button>
        </form>
      </OnboardingShell>
    );
  }

  if (step === "aha") {
    const profit = getTodayProfit(activatedState);
    return (
      <OnboardingShell kicker="Great work" title={profit > 0 ? `Great. Your business made ${formatNaira(profit)} today.` : "You’re now tracking your business properly."}>
        <div className="rounded-2xl bg-success/10 p-5 text-center">
          <p className="text-4xl">✓</p>
          <p className="mt-2 text-sm font-semibold text-success">Today’s profit updated</p>
        </div>
        <button className="mt-5 w-full rounded-xl bg-primary px-5 py-4 font-semibold text-white" type="button" onClick={() => setStep("reminder")}>
          Continue
        </button>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell kicker="Step 4 of 4" title="Would you like daily business reminders?">
      <div className="grid gap-2">
        {reminders.map((item) => (
          <button
            key={item}
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm font-semibold"
            type="button"
            onClick={() => {
              trackProductEvent("retention_trigger_selected", { channel: item, business_type: businessType });
              onDashboard();
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <button className="mt-4 w-full rounded-xl px-5 py-3 text-sm font-semibold text-textSecondary" type="button" onClick={onDashboard}>
        Not now
      </button>
    </OnboardingShell>
  );
}

function OnboardingShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-card p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium text-primary">{kicker}</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">{title}</h1>
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}

function getTodayProfit(state: MoneybookState | null) {
  if (!state) {
    return 0;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  return state.transactions
    .filter((transaction) => !transaction.reversedByTransactionId && transaction.occurredAt.slice(0, 10) === todayKey)
    .reduce((sum, transaction) => {
      if (transaction.type === "sale") {
        return sum + transaction.profit;
      }

      if (transaction.type === "expense") {
        return sum - transaction.amount;
      }

      return sum;
    }, 0);
}
