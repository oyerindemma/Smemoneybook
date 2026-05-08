"use client";

import Link from "next/link";
import { use, useState } from "react";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [message, setMessage] = useState("Sign in with the invited email, then accept.");

  async function acceptInvite() {
    const response = await fetch(`/api/staff/invitations/${token}/accept`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(payload?.error ?? "Could not accept this invitation.");
      return;
    }

    setMessage("Invitation accepted. You can open the moneybook now.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-textPrimary">
      <section className="w-full max-w-md rounded-xl bg-card p-5 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-6">
        <p className="text-sm text-textSecondary">SME Moneybook</p>
        <h1 className="mt-1 text-2xl font-semibold">Staff invitation</h1>
        <p className="mt-2 text-sm leading-6 text-textSecondary">{message}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
            type="button"
            onClick={acceptInvite}
          >
            Accept invite
          </button>
          <Link
            className="flex h-11 items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-textSecondary"
            href="/"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
