"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, MailPlus, RotateCw, X } from "lucide-react";

type StaffOverview = {
  business: {
    canManageStaff: boolean;
  };
  emailConfigured: boolean;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    joinedAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    token?: string;
    status: string;
    expiresAt: string;
  }>;
};

export function StaffManagementPanel({
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [overview, setOverview] = useState<StaffOverview | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!businessId) {
      return;
    }

    setIsLoading(true);
    const response = await fetch(`/api/staff/invitations?businessId=${encodeURIComponent(businessId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | (StaffOverview & { error?: string })
      | null;
    setIsLoading(false);

    if (response.ok && payload) {
      setOverview(payload);
      return;
    }

    onNotice(payload?.error ?? "Could not load staff.");
  }, [businessId, onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStaff();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStaff]);

  const pendingInvites = useMemo(
    () => overview?.invitations.filter((invitation) => invitation.status === "pending") ?? [],
    [overview?.invitations],
  );

  async function inviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setIsSaving(true);
    const response = await fetch("/api/staff/invitations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      inviteUrl?: string;
      message?: string;
      error?: string;
    } | null;
    setIsSaving(false);

    if (response.ok) {
      event.currentTarget.reset();
      setLastInviteUrl(payload?.inviteUrl ?? "");
      await loadStaff();
      onNotice(payload?.message ?? "Staff invitation created.");
      return;
    }

    onNotice(payload?.error ?? "Could not invite staff.");
  }

  async function resendInvitation(id: string) {
    if (!businessId) {
      return;
    }

    const response = await fetch(`/api/staff/invitations/${id}/resend`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      inviteUrl?: string;
      message?: string;
      error?: string;
    } | null;

    if (response.ok) {
      setLastInviteUrl(payload?.inviteUrl ?? "");
      await loadStaff();
      onNotice(payload?.message ?? "Invitation resent.");
      return;
    }

    onNotice(payload?.error ?? "Could not resend invitation.");
  }

  async function revokeInvitation(id: string) {
    if (!businessId) {
      return;
    }

    const response = await fetch(`/api/staff/invitations/${id}/revoke`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    if (response.ok) {
      await loadStaff();
      onNotice(payload?.message ?? "Invitation revoked.");
      return;
    }

    onNotice(payload?.error ?? "Could not revoke invitation.");
  }

  async function copyInviteLink(value: string) {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    onNotice("Invite link copied.");
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <div className="h-28 animate-pulse rounded-xl bg-textMuted/20" />
      </section>
    );
  }

  if (!overview?.business.canManageStaff) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-xs font-medium text-textSecondary">Staff</p>
        <h2 className="mt-1 text-base font-semibold text-textPrimary">Invite staff</h2>
        <p className="mt-3 text-sm text-textSecondary">Only owners can manage staff invitations.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Staff</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Invite staff</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {overview.members.length} members
        </span>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={inviteStaff}>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Email
          <input
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            name="email"
            placeholder="staff@example.com"
            type="email"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-textPrimary">
          Role
          <select
            className="min-h-12 rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            name="role"
            defaultValue="staff"
          >
            <option value="staff">Staff</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <button
          className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isSaving}
        >
          <MailPlus size={16} aria-hidden="true" />
          {isSaving ? "Sending..." : "Invite"}
        </button>
      </form>

      {lastInviteUrl ? (
        <div className="mt-4 rounded-xl bg-background p-4">
          <p className="text-xs font-semibold uppercase text-textMuted">Copy invite link</p>
          <div className="mt-2 flex gap-2">
            <input
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-xs text-textSecondary"
              readOnly
              value={lastInviteUrl}
            />
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold"
              type="button"
              onClick={() => copyInviteLink(lastInviteUrl)}
            >
              <Copy size={14} aria-hidden="true" />
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-textPrimary">Pending invites</h3>
          <div className="mt-3 grid gap-3">
            {pendingInvites.length === 0 ? (
              <p className="rounded-xl bg-background p-4 text-sm text-textSecondary">No pending invites.</p>
            ) : (
              pendingInvites.map((invitation) => {
                const inviteUrl =
                  typeof window === "undefined" || !invitation.token
                    ? ""
                    : `${window.location.origin}/invite/${invitation.token}`;

                return (
                  <div key={invitation.id} className="rounded-xl bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-textPrimary">{invitation.email}</p>
                        <p className="mt-1 text-xs font-medium uppercase text-textMuted">{invitation.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold"
                          type="button"
                          onClick={() => resendInvitation(invitation.id)}
                        >
                          <RotateCw size={14} aria-hidden="true" />
                          Resend
                        </button>
                        <button
                          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-danger/20 bg-white px-3 text-xs font-semibold text-danger"
                          type="button"
                          onClick={() => revokeInvitation(invitation.id)}
                        >
                          <X size={14} aria-hidden="true" />
                          Revoke
                        </button>
                      </div>
                    </div>
                    {inviteUrl ? (
                      <button
                        className="mt-3 text-left text-xs font-semibold text-primary"
                        type="button"
                        onClick={() => copyInviteLink(inviteUrl)}
                      >
                        Copy invite link
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-textPrimary">Team</h3>
          <div className="mt-3 grid gap-3">
            {overview.members.map((member) => (
              <div key={member.id} className="rounded-xl bg-background p-4">
                <p className="truncate text-sm font-semibold text-textPrimary">{member.name}</p>
                <p className="mt-1 truncate text-sm text-textSecondary">{member.email}</p>
                <p className="mt-2 text-xs font-semibold uppercase text-textMuted">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
