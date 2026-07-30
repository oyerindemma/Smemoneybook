"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { ErrorMessage } from "@/components/dashboard/ErrorMessage";
import { OnboardingSetup } from "@/components/onboarding/OnboardingSetup";
import type { CaptureFormData } from "@/components/dashboard/types";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import { trackProductEvent } from "@/lib/analytics/product-analytics";
import { phase1FeatureFlags } from "@/lib/phase1/feature-flags";
import { sanitizeString } from "@/lib/utils/sanitize";

type HomeStatus = "checking" | "signed_out" | "setup_needed" | "error";

type DashboardPayload = {
  state?: MoneybookState;
  error?: string;
};

type AuthenticatedBusiness = {
  id: string;
  name: string;
  businessType?: string | null;
  onboardingCompleted: boolean;
};

type AuthPayload = {
  error?: string;
  business?: AuthenticatedBusiness | null;
};

type PasswordResetPayload = {
  error?: string;
  message?: string;
  resetUrl?: string;
};

type AuthHomeProps = {
  initialStatus?: HomeStatus;
  initialNotice?: string;
  initialState?: MoneybookState | null;
  shouldCheckOnMount?: boolean;
};

export function AuthHome(props: AuthHomeProps) {
  return <AuthHomeClient {...props} />;
}

function AuthHomeClient({
  initialStatus = "signed_out",
  initialNotice = "Sign in to track your money.",
  initialState = null,
  shouldCheckOnMount = false,
}: AuthHomeProps) {
  const router = useRouter();
  const [status, setStatus] = useState<HomeStatus>(initialStatus);
  const [notice, setNotice] = useState(initialNotice);
  const [state, setState] = useState<MoneybookState | null>(initialState);

  const loadSession = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setStatus("checking");
    }
    const sessionExpired =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("session") === "expired";
    if (showLoading || sessionExpired) {
      setNotice(sessionExpired ? "Your session expired. Please sign in again." : "Checking your account...");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("/api/dashboard/summary", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

      if (response.ok && payload?.state) {
        if (payload.state.businessId) {
          localStorage.setItem("selectedBusinessId", payload.state.businessId);
        }

        if (payload.state.onboardingCompleted) {
          router.replace("/money");
          return;
        }

        setState(payload.state);
        setStatus("setup_needed");
        setNotice("Finish setup to start tracking your money.");
        return;
      }

      if (response.status === 401) {
        setStatus("signed_out");
        setNotice(
          sessionExpired
            ? "Your session expired. Please sign in again."
            : "Sign in to track your money.",
        );
        return;
      }

      if (response.status === 404) {
        setStatus("setup_needed");
        setNotice(payload?.error ?? "Create your business to start.");
        return;
      }

      setStatus("error");
      setNotice(payload?.error ?? "Something went wrong. Try again.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("signed_out");
        setNotice("We could not check your account quickly. Sign in to continue.");
        return;
      }

      setStatus("signed_out");
      setNotice("Sign in to continue. If you were already signed in, try again.");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [router]);

  useEffect(() => {
    if (!shouldCheckOnMount) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadSession(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadSession, shouldCheckOnMount]);

  const handleAuthenticated = useCallback((business?: AuthenticatedBusiness | null) => {
    if (business?.id) {
      localStorage.setItem("selectedBusinessId", business.id);
    }

    if (business?.onboardingCompleted) {
      router.replace("/money");
      return;
    }

    setState(createSetupState(business));
    setStatus("setup_needed");
    setNotice("Finish setup to start tracking your money.");
  }, [router]);

  async function completeOnboarding(input: {
    businessName: string;
    businessType: string;
    businessCategory?: string;
    country?: string;
    currency?: string;
    mainGoal?: string;
  }): Promise<MoneybookState> {
    const response = await fetch("/api/onboarding/setup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (!response.ok || !payload?.state) {
      throw new Error(payload?.error ?? "Couldn’t save. Try again.");
    }

    if (payload.state.businessId) {
      localStorage.setItem("selectedBusinessId", payload.state.businessId);
    }

    setState(payload.state);
    return payload.state;
  }

  async function completeFirstTransaction(formData: CaptureFormData): Promise<MoneybookState> {
    const businessId = state?.businessId || localStorage.getItem("selectedBusinessId") || formData.businessId;
    const response = await fetch("/api/transactions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        businessId,
        idempotencyKey: `activation-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      }),
    });
    const payload = (await response.json().catch(() => null)) as DashboardPayload | null;

    if (!response.ok || !payload?.state) {
      throw new Error(payload?.error ?? "Couldn’t save. Try again.");
    }

    setState(payload.state);
    trackProductEvent("first_transaction_completion", {
      type: formData.type,
      activation_source: "onboarding",
    });
    return payload.state;
  }

  if (status === "setup_needed") {
    if (!phase1FeatureFlags.onboarding) {
      return (
        <BasicOnboardingSetup
          initialBusinessName={state?.businessName}
          initialBusinessType={state?.businessType}
          onComplete={completeOnboarding}
          onDashboard={() => router.replace("/money")}
        />
      );
    }

    return (
      <OnboardingSetup
        initialBusinessName={state?.businessName}
        initialBusinessType={state?.businessType}
        onComplete={completeOnboarding}
        onFirstTransaction={completeFirstTransaction}
        onDashboard={() => router.replace("/money")}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
      <AuthPanel
        status={status}
        notice={notice}
        onAuthenticated={handleAuthenticated}
      />
    </main>
  );
}

function BasicOnboardingSetup({
  initialBusinessName,
  initialBusinessType,
  onComplete,
  onDashboard,
}: {
  initialBusinessName?: string;
  initialBusinessType?: string | null;
  onComplete: (input: { businessName: string; businessType: string }) => Promise<MoneybookState>;
  onDashboard: () => void;
}) {
  const [businessName, setBusinessName] = useState(initialBusinessName ?? "");
  const [businessType, setBusinessType] = useState(initialBusinessType ?? "Retail / Trading");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanBusinessName = sanitizeString(businessName).slice(0, 80);
    const cleanBusinessType = sanitizeString(businessType).slice(0, 60);

    if (cleanBusinessName.length < 2) {
      setError("Enter your business name.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await onComplete({
        businessName: cleanBusinessName,
        businessType: cleanBusinessType || "Retail / Trading",
      });
      onDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn’t save. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-card p-6 shadow-sm sm:p-7">
        <LogoMark />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Set up your business</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          Add the basics so MoneyBook can prepare your dashboard.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-textPrimary">
            Business name
            <input
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-textPrimary">
            Business type
            <select
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
            >
              <option>Retail / Trading</option>
              <option>Food / Restaurant</option>
              <option>Services</option>
              <option>Manufacturing</option>
              <option>Fashion / Beauty</option>
              <option>Other</option>
            </select>
          </label>

          {error ? <ErrorMessage message={error} /> : null}

          <button
            className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}

function createSetupState(business?: AuthenticatedBusiness | null): MoneybookState {
  return {
    businessId: business?.id ?? "",
    businessName: business?.name ?? "",
    businessCategory: undefined,
    businessType: business?.businessType ?? undefined,
    country: "NG",
    currency: "NGN",
    onboardingCompleted: false,
    businesses: business?.id
      ? [{ id: business.id, name: business.name, role: "owner" }]
      : [],
    businessRole: "owner",
    permissions: {
      canManageStaff: true,
      canManageAccounts: true,
      canSaveReports: true,
      canExportBackup: true,
      canViewStaffPerformance: true,
      canExportStaffPerformance: true,
      canViewBankReconciliation: true,
      canImportBankReconciliation: true,
      canReviewBankReconciliation: true,
      canExportBankReconciliation: true,
      canViewTaxAssistant: true,
      canAskTaxAssistant: true,
      canReviewTaxAssistant: true,
      canExportTaxAssistant: true,
      canManageTaxAssistantSettings: true,
      canViewPayroll: true,
      canManagePayrollEmployees: true,
      canPreparePayroll: true,
      canReviewPayroll: true,
      canApprovePayroll: true,
      canExportPayroll: true,
      canPostPayrollExpense: true,
      canViewPayrollSensitive: true,
    },
    accounts: [],
    transactions: [],
    debts: [],
    items: [],
    auditLogs: [],
  };
}

function AuthPanel({
  status,
  notice,
  onAuthenticated,
}: {
  status: HomeStatus;
  notice: string;
  onAuthenticated: (business?: AuthenticatedBusiness | null) => void;
}) {
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("register");
  const [hasStarted, setHasStarted] = useState(status !== "signed_out");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const message = formMessage ?? notice;

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref")?.trim();

    if (referralCode) {
      localStorage.setItem("referralCode", referralCode);
    }
  }, []);

  function changeAuthMode(nextMode: "login" | "register" | "forgot") {
    setAuthMode(nextMode);
    setFormMessage(null);
    setResetUrl(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    setIsSubmitting(true);
    setFormMessage(null);
    try {
      const response = await fetch(
        authMode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name: sanitizeString(form.get("name")),
            email: sanitizeString(form.get("email")),
            password: sanitizeString(form.get("password")),
            pin: sanitizeString(form.get("pin")),
            businessName: sanitizeString(form.get("businessName")),
            referralCode:
              authMode === "register"
                ? sanitizeString(localStorage.getItem("referralCode"))
                : undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as AuthPayload | null;

      if (!response.ok) {
        setFormMessage(getFriendlyAuthError(payload?.error));
        return;
      }

      onAuthenticated(payload?.business ?? null);
      if (authMode === "register") {
        localStorage.removeItem("referralCode");
      }
    } catch (error) {
      setFormMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "The server took too long to respond. Please try again."
          : "Could not reach the app server. Check that the dev server is still running and try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsSubmitting(false);
    }
  }

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    setIsSubmitting(true);
    setFormMessage(null);
    setResetUrl(null);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          email: sanitizeString(form.get("email")),
        }),
      });
      const payload = (await response.json().catch(() => null)) as PasswordResetPayload | null;

      if (!response.ok) {
        setFormMessage(getFriendlyAuthError(payload?.error));
        return;
      }

      setFormMessage(payload?.message ?? "If that email is registered, we sent password reset instructions.");
      setResetUrl(payload?.resetUrl ?? null);
    } catch (error) {
      setFormMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "The server took too long to respond. Please try again."
          : "Could not reach the app server. Check that the dev server is still running and try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-100 bg-card p-6 shadow-sm sm:p-7">
      {!hasStarted && status !== "checking" && status !== "error" ? (
        <div>
          <div className="flex items-center gap-2">
            <LogoMark />
            <p className="text-sm font-medium text-primary">SME MoneyBook</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            Track your business money daily without stress.
          </h1>
          <p className="mt-3 text-sm leading-6 text-textSecondary">Takes less than 1 minute.</p>
          <button
            className="mt-6 w-full rounded-xl bg-primary px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-primaryHover"
            type="button"
            onClick={() => {
              setHasStarted(true);
              trackProductEvent("signup_started", { source: "welcome_start_free" });
            }}
          >
            Start Free
          </button>
          <button
            className="mt-3 w-full rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-textSecondary"
            type="button"
            onClick={() => {
              changeAuthMode("login");
              setHasStarted(true);
            }}
          >
            I already have an account
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <LogoMark />
              <p className="text-sm text-textSecondary">SME MoneyBook</p>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">
              {status === "error" ? "Something went wrong" : "Track your money daily"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-textSecondary">{message}</p>
          </div>

          {status === "checking" ? (
            <div className="rounded-2xl bg-background p-5 text-sm font-medium text-textSecondary">
              Loading...
            </div>
          ) : status === "error" ? (
            <ErrorMessage message={message} />
          ) : (
            <>
              {authMode === "forgot" ? (
                <button
                  className="mb-4 text-sm font-semibold text-primary hover:underline"
                  type="button"
                  onClick={() => changeAuthMode("login")}
                >
                  Back to sign in
                </button>
              ) : (
                <div className="mb-4 grid grid-cols-2 rounded-xl bg-background p-1">
                  <button
                    className={`h-11 rounded-xl text-sm font-semibold ${
                      authMode === "register"
                        ? "bg-primary text-white hover:bg-primaryHover"
                        : "text-textSecondary"
                    }`}
                    type="button"
                    onClick={() => changeAuthMode("register")}
                  >
                    Create
                  </button>
                  <button
                    className={`h-11 rounded-xl text-sm font-semibold ${
                      authMode === "login"
                        ? "bg-primary text-white hover:bg-primaryHover"
                        : "text-textSecondary"
                    }`}
                    type="button"
                    onClick={() => changeAuthMode("login")}
                  >
                    Sign in
                  </button>
                </div>
              )}

              {authMode === "forgot" ? (
                <form className="grid gap-4" onSubmit={submitForgotPassword}>
                  <label className="grid gap-2 text-sm font-medium">
                    Email
                    <input
                      className="h-12 rounded-xl border border-gray-200 px-3"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  {resetUrl ? (
                    <Link className="text-sm font-semibold text-primary hover:underline" href={resetUrl}>
                      Open reset link
                    </Link>
                  ) : null}
                  <button
                    className="mt-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Please wait..." : "Send reset link"}
                  </button>
                </form>
              ) : (
                <form className="grid gap-4" onSubmit={submit}>
                  {authMode === "register" ? (
                    <label className="grid gap-2 text-sm font-medium">
                      Your name
                      <input
                        className="h-12 rounded-xl border border-gray-200 px-3"
                        name="name"
                        autoComplete="name"
                        required
                      />
                    </label>
                  ) : null}
                  <label className="grid gap-2 text-sm font-medium">
                    Email
                    <input
                      className="h-12 rounded-xl border border-gray-200 px-3"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <PasswordInput
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                    label={authMode === "register" ? "Password" : "Password or 6-digit PIN"}
                    minLength={authMode === "register" ? PASSWORD_MIN_LENGTH : 1}
                  />
                  {authMode === "register" ? <PinInput /> : null}
                  {authMode === "login" ? (
                    <button
                      className="-mt-2 justify-self-start text-sm font-semibold text-primary hover:underline"
                      type="button"
                      onClick={() => changeAuthMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                  {authMode === "register" ? (
                    <p className="text-xs leading-5 text-textSecondary">
                      By creating an account, you agree to SME MoneyBook&apos;s{" "}
                      <Link className="font-semibold text-primary hover:underline" href="/legal/terms-of-service">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link className="font-semibold text-primary hover:underline" href="/legal/privacy-policy">
                        Privacy Policy
                      </Link>
                      .
                    </p>
                  ) : null}
                  <button
                    className="mt-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Please wait..." : "Continue"}
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
      <div className="mt-6 border-t border-gray-100 pt-4 text-xs leading-6 text-textSecondary">
        <p>By continuing, you agree to SME MoneyBook policies.</p>
        <nav className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Legal links">
          <Link className="font-medium text-primary hover:underline" href="/legal/privacy-policy">
            Privacy Policy
          </Link>
          <Link className="font-medium text-primary hover:underline" href="/legal/terms-of-service">
            Terms
          </Link>
          <Link className="font-medium text-primary hover:underline" href="/legal/data-security">
            Data Security
          </Link>
          <Link className="font-medium text-primary hover:underline" href="/legal/refund-policy">
            Refund Policy
          </Link>
          <Link className="font-medium text-primary hover:underline" href="/legal/financial-disclaimer">
            Financial Disclaimer
          </Link>
        </nav>
      </div>
    </section>
  );
}

function PasswordInput({
  autoComplete,
  label,
  minLength,
}: {
  autoComplete: "current-password" | "new-password";
  label: string;
  minLength: number;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="grid gap-2 text-sm font-medium">
      <label htmlFor="auth-password">{label}</label>
      <span className="relative block">
        <input
          id="auth-password"
          className="h-12 w-full rounded-xl border border-gray-200 px-3 pr-12"
          name="password"
          type={isVisible ? "text" : "password"}
          minLength={minLength}
          autoComplete={autoComplete}
          required
        />
        <button
          aria-label={isVisible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-2 my-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary hover:bg-background hover:text-primary"
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
        </button>
      </span>
    </div>
  );
}

function PinInput() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="grid gap-2 text-sm font-medium">
      <label htmlFor="auth-pin">6-digit access PIN</label>
      <span className="relative block">
        <input
          id="auth-pin"
          className="h-12 w-full rounded-xl border border-gray-200 px-3 pr-12 tracking-[0.35em]"
          name="pin"
          type={isVisible ? "text" : "password"}
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
        />
        <button
          aria-label={isVisible ? "Hide PIN" : "Show PIN"}
          className="absolute inset-y-0 right-2 my-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary hover:bg-background hover:text-primary"
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
        </button>
      </span>
      <p className="text-xs leading-5 text-textSecondary">
        You can use this PIN instead of your password when signing in.
      </p>
    </div>
  );
}

function getFriendlyAuthError(error?: string) {
  if (!error) {
    return "Something went wrong. Try again.";
  }

  if (/invalid input|expected .* received|zod/i.test(error)) {
    return "Check your details and try again.";
  }

  return error;
}
