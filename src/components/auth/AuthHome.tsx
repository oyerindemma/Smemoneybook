"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorMessage } from "@/components/dashboard/ErrorMessage";
import { OnboardingSetup } from "@/components/onboarding/OnboardingSetup";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";

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
  }) {
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

    router.replace("/money");
  }

  if (status === "setup_needed") {
    return (
      <OnboardingSetup
        initialBusinessName={state?.businessName}
        initialBusinessType={state?.businessType}
        onComplete={completeOnboarding}
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

function createSetupState(business?: AuthenticatedBusiness | null): MoneybookState {
  return {
    businessId: business?.id ?? "",
    businessName: business?.name ?? "",
    businessType: business?.businessType ?? undefined,
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
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const message = formMessage ?? notice;

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
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            businessName: form.get("businessName"),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as AuthPayload | null;

      if (!response.ok) {
        setFormMessage(payload?.error ?? "Something went wrong. Try again.");
        return;
      }

      onAuthenticated(payload?.business ?? null);
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
      <div className="mb-5">
        <p className="text-sm text-textSecondary">SME Moneybook</p>
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
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-background p-1">
            <button
              className={`h-11 rounded-xl text-sm font-semibold ${
                authMode === "register"
                  ? "bg-primary text-white hover:bg-primaryHover"
                  : "text-textSecondary"
              }`}
              type="button"
              onClick={() => {
                setAuthMode("register");
                setFormMessage(null);
              }}
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
              onClick={() => {
                setAuthMode("login");
                setFormMessage(null);
              }}
            >
              Sign in
            </button>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
            {authMode === "register" ? (
              <>
                <label className="grid gap-2 text-sm font-medium">
                  Your name
                  <input className="h-12 rounded-xl border border-gray-200 px-3" name="name" required />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Business name
                  <input
                    className="h-12 rounded-xl border border-gray-200 px-3"
                    name="businessName"
                    required
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Email
              <input
                className="h-12 rounded-xl border border-gray-200 px-3"
                name="email"
                type="email"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-12 rounded-xl border border-gray-200 px-3"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </label>
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
