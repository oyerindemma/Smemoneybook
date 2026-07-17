"use client";

import type React from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CaptureFormData } from "@/components/dashboard/types";
import { trackProductEvent } from "@/lib/analytics/product-analytics";
import { getBusinessTemplate } from "@/lib/bookkeeping/business-templates";
import { formatNaira, type MoneybookState } from "@/lib/bookkeeping/transaction-engine";

const steps = [
  "welcome",
  "business_name",
  "business_category",
  "business_type",
  "currency_country",
  "main_goal",
  "first_product",
  "first_customer",
  "first_transaction",
  "dashboard_reveal",
] as const;

type Step = (typeof steps)[number];
type FirstAction = "sale" | "expense";

const businessCategories = [
  "Retail",
  "Food",
  "Fashion",
  "Health",
  "Services",
  "Logistics",
  "Beauty",
  "Electronics",
  "Other",
];

const businessTypes = [
  "Retail shop",
  "Food business",
  "POS business",
  "Fashion",
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
  "Know profit",
  "Manage customers",
  "Manage stock",
  "Send invoices",
];

type SetupInput = {
  businessName: string;
  businessType: string;
  businessCategory?: string;
  country?: string;
  currency?: string;
  mainGoal?: string;
};

type OnboardingProgressPayload = {
  progress?: {
    currentStep: Step;
    goal?: string;
    data?: Partial<{
      businessName: string;
      businessCategory: string;
      businessType: string;
      country: string;
      currency: string;
      productName: string;
      customerName: string;
    }>;
  } | null;
};

export function OnboardingSetup({
  initialBusinessName = "",
  initialBusinessType = "Retail shop",
  onComplete,
  onFirstTransaction,
  onDashboard,
}: {
  initialBusinessName?: string;
  initialBusinessType?: string;
  onComplete: (input: SetupInput) => Promise<MoneybookState>;
  onFirstTransaction: (formData: CaptureFormData) => Promise<MoneybookState>;
  onDashboard: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [businessCategory, setBusinessCategory] = useState("Retail");
  const [businessType, setBusinessType] = useState(
    businessTypes.includes(initialBusinessType) ? initialBusinessType : "Retail shop",
  );
  const [country, setCountry] = useState("NG");
  const [currency, setCurrency] = useState("NGN");
  const [goal, setGoal] = useState(goals[0]);
  const [setupState, setSetupState] = useState<MoneybookState | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCost, setProductCost] = useState("");
  const [productQuantity, setProductQuantity] = useState("1");
  const [productUnit, setProductUnit] = useState("piece");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [firstAction, setFirstAction] = useState<FirstAction>("sale");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const template = getBusinessTemplate(businessType);
  const accountId = useMemo(
    () =>
      setupState?.accounts.find((account) => account.type === "cash")?.id ??
      setupState?.accounts[0]?.id ??
      "",
    [setupState],
  );
  const progress = Math.round(((steps.indexOf(step) + 1) / steps.length) * 100);

  async function loadProgress() {
    const response = await fetch("/api/onboarding/progress", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as OnboardingProgressPayload | null;
    const progressData = payload?.progress;

    if (!response.ok || !progressData) {
      return;
    }

    if (steps.includes(progressData.currentStep)) {
      setStep(progressData.currentStep);
    }

    if (progressData.goal) {
      setGoal(progressData.goal);
    }

    if (progressData.data?.businessName) {
      setBusinessName(progressData.data.businessName);
    }

    if (progressData.data?.businessCategory) {
      setBusinessCategory(progressData.data.businessCategory);
    }

    if (progressData.data?.businessType) {
      setBusinessType(progressData.data.businessType);
    }

    if (progressData.data?.country) {
      setCountry(progressData.data.country);
    }

    if (progressData.data?.currency) {
      setCurrency(progressData.data.currency);
    }
  }

  useEffect(() => {
    trackProductEvent("onboarding_started");
    const timer = window.setTimeout(() => {
      void loadProgress();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    trackProductEvent("onboarding_step_viewed", { step });
  }, [step]);

  async function saveProgress(
    nextStep: Step,
    eventName?: string,
    options: { completed?: boolean; skipped?: boolean } = {},
    businessIdOverride?: string,
  ) {
    await fetch("/api/onboarding/progress", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: businessIdOverride ?? setupState?.businessId,
        step: nextStep,
        eventName,
        goal,
        completed: options.completed,
        skipped: options.skipped,
        data: {
          businessName,
          businessCategory,
          businessType,
          country,
          currency,
          productName,
          customerName,
        },
      }),
    });
  }

  async function goTo(nextStep: Step, eventName?: string) {
    setError("");
    await saveProgress(nextStep, eventName);
    setStep(nextStep);
  }

  async function completeBusinessProfile(nextStep: Step) {
    setError("");
    setIsSaving(true);

    try {
      const cleanName = businessName.trim() || `My ${businessType}`;
      const state = await onComplete({
        businessName: cleanName,
        businessType,
        businessCategory,
        country,
        currency,
        mainGoal: goal,
      });
      setBusinessName(cleanName);
      setSetupState(state);
      trackProductEvent("business_profile_completed", {
        business_type: businessType,
        business_category: businessCategory,
        country,
        currency,
      });
      await saveProgress(nextStep, "business_profile_completed", {}, state.businessId);
      setStep(nextStep);
    } catch {
      setError("Could not save your business profile. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveFirstProduct() {
    if (!setupState?.businessId) {
      await completeBusinessProfile("first_product");
      return;
    }

    if (!productName.trim()) {
      await goTo("first_customer");
      return;
    }

    const sellingPrice = Number(productPrice);
    const costPrice = Number(productCost || 0);
    const quantityOnHand = Number(productQuantity || 0);

    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setError("Enter a valid selling price.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: setupState.businessId,
          name: productName.trim(),
          sellingPrice,
          costPrice,
          quantityOnHand,
          lowStockLevel: 5,
          unitName: productUnit,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { state?: MoneybookState } | null;

      if (!response.ok || !payload?.state) {
        throw new Error("Could not save product.");
      }

      setSetupState(payload.state);
      trackProductEvent("first_product_created");
      await saveProgress("first_customer", "first_product_created");
      setStep("first_customer");
    } catch {
      setError("Could not save product. You can skip this for now.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveFirstCustomer() {
    if (!setupState?.businessId || !customerName.trim()) {
      await goTo("first_transaction");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: setupState.businessId,
          name: customerName.trim(),
          phone: customerPhone.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { state?: MoneybookState } | null;

      if (!response.ok || !payload?.state) {
        throw new Error("Could not save customer.");
      }

      setSetupState(payload.state);
      trackProductEvent("first_customer_created");
      await saveProgress("first_transaction", "first_customer_created");
      setStep("first_transaction");
    } catch {
      setError("Could not save customer. You can skip this for now.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitFirstTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountNumber = Number(amount);

    if (!setupState?.businessId) {
      await completeBusinessProfile("first_transaction");
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
        description:
          note.trim() ||
          (firstAction === "sale" ? "First sale" : category || "First expense"),
        category: firstAction === "expense" ? category || undefined : undefined,
        paymentStatus: "paid",
        partyName: firstAction === "sale" ? customerName.trim() || undefined : undefined,
      });
      setSetupState(nextState);
      trackProductEvent(
        firstAction === "sale" ? "first_sale_recorded" : "first_expense_recorded",
      );
      await saveProgress(
        "dashboard_reveal",
        firstAction === "sale" ? "first_sale_recorded" : "first_expense_recorded",
      );
      setStep("dashboard_reveal");
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function startUsingApp() {
    setIsSaving(true);
    try {
      let businessId = setupState?.businessId;

      if (!setupState?.businessId) {
        const cleanName = businessName.trim() || `My ${businessType}`;
        const state = await onComplete({
          businessName: cleanName,
          businessType,
          businessCategory,
          country,
          currency,
          mainGoal: goal,
        });
        setBusinessName(cleanName);
        setSetupState(state);
        businessId = state.businessId;
      }

      await saveProgress(step, "onboarding_skipped", { skipped: true }, businessId);
      trackProductEvent("onboarding_skipped", { step });
      onDashboard();
    } finally {
      setIsSaving(false);
    }
  }

  async function finishOnboarding() {
    await saveProgress("dashboard_reveal", "onboarding_completed", { completed: true });
    trackProductEvent("onboarding_completed", {
      business_type: businessType,
      activation_goal: goal,
    });
    onDashboard();
  }

  return (
    <main className="min-h-screen bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-primary">
              Step {steps.indexOf(step) + 1} of {steps.length}
            </p>
            <button
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-textSecondary hover:bg-background"
              type="button"
              onClick={() => void startUsingApp()}
            >
              Start using the app
            </button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
            <div
              aria-hidden="true"
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {renderStep()}
      </section>
    </main>
  );

  function renderStep() {
    if (step === "welcome") {
      return (
        <StepShell title="Set up MoneyBook for your business">
          <p className="text-sm leading-6 text-textSecondary">
            Keep it simple: business details, one goal, optional product/customer, then
            your first sale or expense.
          </p>
          <PrimaryButton onClick={() => void goTo("business_name", "onboarding_started")}>
            Continue
          </PrimaryButton>
        </StepShell>
      );
    }

    if (step === "business_name") {
      return (
        <StepShell title="What is your business name?">
          <Field label="Business name">
            <input
              className="h-14 rounded-xl border border-gray-200 px-4"
              placeholder={`e.g. My ${businessType}`}
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </Field>
          <PrimaryButton onClick={() => void goTo("business_category")}>Continue</PrimaryButton>
        </StepShell>
      );
    }

    if (step === "business_category") {
      return (
        <StepShell title="Choose a category">
          <ChoiceGrid
            options={businessCategories}
            value={businessCategory}
            onChange={setBusinessCategory}
          />
          <PrimaryButton onClick={() => void goTo("business_type")}>Continue</PrimaryButton>
        </StepShell>
      );
    }

    if (step === "business_type") {
      return (
        <StepShell title="Choose a business type">
          <ChoiceGrid options={businessTypes} value={businessType} onChange={setBusinessType} />
          <PrimaryButton onClick={() => void goTo("currency_country")}>Continue</PrimaryButton>
        </StepShell>
      );
    }

    if (step === "currency_country") {
      return (
        <StepShell title="Country and currency">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Country">
              <select
                className="h-14 rounded-xl border border-gray-200 bg-white px-4"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                <option value="NG">Nigeria</option>
                <option value="GH">Ghana</option>
                <option value="KE">Kenya</option>
                <option value="ZA">South Africa</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Currency">
              <select
                className="h-14 rounded-xl border border-gray-200 bg-white px-4"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="NGN">NGN</option>
                <option value="GHS">GHS</option>
                <option value="KES">KES</option>
                <option value="ZAR">ZAR</option>
                <option value="USD">USD</option>
              </select>
            </Field>
          </div>
          <PrimaryButton onClick={() => void goTo("main_goal")}>Continue</PrimaryButton>
        </StepShell>
      );
    }

    if (step === "main_goal") {
      return (
        <StepShell title="What do you want to do first?">
          <ChoiceGrid
            options={goals}
            value={goal}
            onChange={(nextGoal) => {
              setGoal(nextGoal);
              trackProductEvent("goal_selected", { goal: nextGoal });
            }}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton
            disabled={isSaving}
            onClick={() => void completeBusinessProfile("first_product")}
          >
            {isSaving ? "Saving..." : "Continue"}
          </PrimaryButton>
        </StepShell>
      );
    }

    if (step === "first_product") {
      return (
        <StepShell title="Add a product">
          <div className="grid gap-3">
            <Field label="Product name optional">
              <input
                className="h-14 rounded-xl border border-gray-200 px-4"
                placeholder="e.g. Indomie carton"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Selling price">
                <input
                  className="h-14 rounded-xl border border-gray-200 px-4"
                  inputMode="decimal"
                  type="number"
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                />
              </Field>
              <Field label="Cost price">
                <input
                  className="h-14 rounded-xl border border-gray-200 px-4"
                  inputMode="decimal"
                  type="number"
                  value={productCost}
                  onChange={(event) => setProductCost(event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Quantity">
                <input
                  className="h-14 rounded-xl border border-gray-200 px-4"
                  inputMode="decimal"
                  type="number"
                  value={productQuantity}
                  onChange={(event) => setProductQuantity(event.target.value)}
                />
              </Field>
              <Field label="Unit">
                <input
                  className="h-14 rounded-xl border border-gray-200 px-4"
                  value={productUnit}
                  onChange={(event) => setProductUnit(event.target.value)}
                />
              </Field>
            </div>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton disabled={isSaving} onClick={() => void saveFirstProduct()}>
            {isSaving ? "Saving..." : productName.trim() ? "Save product" : "Skip product"}
          </PrimaryButton>
        </StepShell>
      );
    }

    if (step === "first_customer") {
      return (
        <StepShell title="Add a customer">
          <Field label="Customer name optional">
            <input
              className="h-14 rounded-xl border border-gray-200 px-4"
              placeholder="e.g. Amina Stores"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </Field>
          <Field label="Phone optional">
            <input
              className="h-14 rounded-xl border border-gray-200 px-4"
              inputMode="tel"
              placeholder="+234..."
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
            />
          </Field>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton disabled={isSaving} onClick={() => void saveFirstCustomer()}>
            {isSaving ? "Saving..." : customerName.trim() ? "Save customer" : "Skip customer"}
          </PrimaryButton>
        </StepShell>
      );
    }

    if (step === "first_transaction") {
      return (
        <StepShell title="Record your first transaction">
          <div className="grid grid-cols-2 gap-2">
            <ChoiceButton active={firstAction === "sale"} onClick={() => setFirstAction("sale")}>
              Sale
            </ChoiceButton>
            <ChoiceButton active={firstAction === "expense"} onClick={() => setFirstAction("expense")}>
              Expense
            </ChoiceButton>
          </div>
          <form className="mt-4 grid gap-4" onSubmit={submitFirstTransaction}>
            <Field label="Amount">
              <input
                className="h-14 rounded-xl border border-gray-200 px-4 text-xl font-bold"
                inputMode="decimal"
                min="1"
                placeholder="25000"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            {firstAction === "expense" ? (
              <Field label="Category">
                <select
                  className="h-14 rounded-xl border border-gray-200 bg-white px-4"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Choose category</option>
                  {template.expenseCategories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Note optional">
              <input
                className="h-14 rounded-xl border border-gray-200 px-4"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            {error ? <ErrorText>{error}</ErrorText> : null}
            <button
              className="min-h-14 rounded-xl bg-primary px-5 py-4 font-semibold text-white disabled:bg-textMuted"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save first record"}
            </button>
          </form>
        </StepShell>
      );
    }

    const profit = getTodayProfit(setupState);
    return (
      <StepShell
        title={
          profit > 0
            ? `Great. Your business made ${formatNaira(profit)} today.`
            : "Your dashboard is ready."
        }
      >
        <div className="rounded-2xl bg-success/10 p-5 text-center">
          <p className="text-sm font-semibold text-success">First value reached</p>
          <p className="mt-2 text-sm text-textSecondary">
            Sales, expenses, stock, and customers now have a starting point.
          </p>
        </div>
        <PrimaryButton onClick={() => void finishOnboarding()}>Open dashboard</PrimaryButton>
      </StepShell>
    );
  }
}

function StepShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="min-h-14 rounded-xl bg-primary px-5 py-4 font-semibold text-white disabled:bg-textMuted"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChoiceGrid({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <ChoiceButton
          key={option}
          active={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </ChoiceButton>
      ))}
    </div>
  );
}

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-14 rounded-xl border px-3 text-left text-sm font-semibold ${
        active
          ? "border-primary bg-primary text-white"
          : "border-gray-200 bg-white text-textPrimary"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-danger">{children}</p>;
}

function getTodayProfit(state: MoneybookState | null) {
  if (!state) {
    return 0;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  return state.transactions
    .filter(
      (transaction) =>
        !transaction.reversedByTransactionId &&
        transaction.occurredAt.slice(0, 10) === todayKey,
    )
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
