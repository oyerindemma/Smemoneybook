"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { sanitizeString } from "@/lib/utils/sanitize";

type PasswordResetFormProps = {
  token: string;
};

type PasswordResetPayload = {
  error?: string;
  message?: string;
};

export function PasswordResetForm({ token }: PasswordResetFormProps) {
  const [message, setMessage] = useState<string | null>(
    token ? null : "This reset link is missing its token. Request a new one.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          token,
          password: sanitizeString(form.get("password")),
        }),
      });
      const payload = (await response.json().catch(() => null)) as PasswordResetPayload | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "Could not reset password right now.");
        return;
      }

      setIsComplete(true);
      setMessage(payload?.message ?? "Your password has been updated. Sign in with your new password.");
    } catch (error) {
      setMessage(
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
        <h1 className="mt-2 text-2xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          Create a new password with at least 12 characters.
        </p>
      </div>

      {message ? (
        <p className="mb-4 rounded-xl bg-background p-3 text-sm leading-6 text-textSecondary">{message}</p>
      ) : null}

      {isComplete ? (
        <Link
          className="block rounded-xl bg-primary px-5 py-3 text-center font-semibold text-white shadow-sm hover:bg-primaryHover"
          href="/"
        >
          Sign in
        </Link>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2 text-sm font-medium">
            <label htmlFor="reset-password">New password</label>
            <span className="relative block">
              <input
                id="reset-password"
                className="h-12 w-full rounded-xl border border-gray-200 px-3 pr-12"
                name="password"
                type={isPasswordVisible ? "text" : "password"}
                minLength={12}
                autoComplete="new-password"
                disabled={!token}
                required
              />
              <button
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2 my-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary hover:bg-background hover:text-primary disabled:opacity-50"
                type="button"
                disabled={!token}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                {isPasswordVisible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
              </button>
            </span>
          </div>
          <button
            className="mt-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
            type="submit"
            disabled={isSubmitting || !token}
          >
            {isSubmitting ? "Please wait..." : "Update password"}
          </button>
        </form>
      )}
    </section>
  );
}
