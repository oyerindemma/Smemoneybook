"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { legalConfig } from "@/lib/legal/legal-config";

export default function DeleteAccountPage() {
  const [confirmation, setConfirmation] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = confirmation.trim() === "DELETE" && understood && !isSubmitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (confirmation.trim() !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }

    if (!understood) {
      setError("Confirm that you understand this action may be permanent.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/delete-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation,
          understood,
          reason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Something went wrong. Try again.");
        return;
      }

      setMessage(payload?.message ?? "Your account deletion request has been submitted.");
      setConfirmation("");
      setReason("");
      setUnderstood(false);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="space-y-8 md:space-y-10">
      <header>
        <Link className="text-sm font-semibold text-primary hover:text-primaryHover" href="/more">
          Back to More
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight md:text-2xl">Delete account</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary md:text-base">
          Deleting your account will remove access to your business data and cannot be undone after processing.
        </p>
      </header>

      <section className="rounded-2xl border border-danger/20 bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-textPrimary">Before you request deletion</h2>
        <div className="mt-3 space-y-3 text-sm leading-6 text-textSecondary">
          <p>
            Some records may remain temporarily in secure backups or where required for legal, security, fraud-prevention, dispute, or regulatory reasons.
          </p>
          <p>
            This request will be reviewed by {legalConfig.productName}. You can contact {legalConfig.supportEmail} if you need help before submitting.
          </p>
        </div>
      </section>

      <form className="space-y-5 rounded-2xl border border-gray-100 bg-card p-6 shadow-sm" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Optional reason
          <textarea
            className="min-h-24 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            maxLength={500}
            placeholder="Tell us what happened, if you want to."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Type DELETE to confirm
          <input
            className="h-12 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-background p-4 text-sm leading-6 text-textSecondary">
          <input
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>I understand this action may be permanent.</span>
        </label>

        {error ? <p className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">{error}</p> : null}
        {message ? <p className="rounded-xl bg-success/10 p-3 text-sm font-medium text-success">{message}</p> : null}

        <button
          className="min-h-12 w-full rounded-xl bg-danger px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={!canSubmit}
        >
          {isSubmitting ? "Submitting..." : "Request account deletion"}
        </button>
      </form>
    </main>
  );
}
