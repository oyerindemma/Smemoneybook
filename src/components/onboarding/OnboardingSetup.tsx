"use client";

import { FormEvent, useState } from "react";

const businessTypes = ["Retail", "Services", "Food", "Fashion", "Logistics", "Other"];

export function OnboardingSetup({
  initialBusinessName = "",
  initialBusinessType = "Retail",
  onComplete,
}: {
  initialBusinessName?: string;
  initialBusinessType?: string;
  onComplete: (input: { businessName: string; businessType: string }) => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [businessType, setBusinessType] = useState(initialBusinessType);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = businessName.trim();

    if (!cleanName) {
      setError("Enter your business name");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      await onComplete({ businessName: cleanName, businessType });
    } catch {
      setError("Couldn’t save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-background p-4 text-textPrimary">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
        <p className="text-sm text-textSecondary">SME Moneybook</p>
        <h1 className="mt-2 text-2xl font-semibold">Let’s set up your money tracker</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          We’ll help you know what came in, what went out, and what is left.
        </p>

        <form className="mt-6 grid gap-6" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Business name
            <input
              className={`h-12 rounded-xl border px-3 ${
                error ? "border-danger" : "border-gray-200"
              }`}
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Ada Store"
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Business type
            <select
              className="h-12 rounded-xl border border-gray-200 bg-card px-3"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
            >
              {businessTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <button
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover disabled:bg-textMuted"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
