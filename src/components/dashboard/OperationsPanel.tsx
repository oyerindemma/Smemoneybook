"use client";

import { Download, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type OperationsOverview = {
  business: {
    role: "owner" | "accountant" | "staff";
    canManageStaff: boolean;
    canExportBackup: boolean;
  };
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
    token: string;
    status: string;
    expiresAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    message: string;
    actorName?: string;
    createdAt: string;
  }>;
  apiErrors: Array<{
    id: string;
    route: string;
    method: string;
    message: string;
    code?: string;
    createdAt: string;
  }>;
};

type Session = {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

export function OperationsPanel({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOperations = useCallback(async () => {
    setIsLoading(true);
    const [operationsResponse, sessionsResponse] = await Promise.all([
      fetch("/api/operations", { credentials: "include", cache: "no-store" }),
      fetch("/api/sessions", { credentials: "include", cache: "no-store" }),
    ]);
    const operationsPayload = (await operationsResponse.json().catch(() => null)) as {
      operations?: OperationsOverview;
      error?: string;
    } | null;
    const sessionsPayload = (await sessionsResponse.json().catch(() => null)) as {
      sessions?: Session[];
    } | null;

    if (operationsResponse.ok && operationsPayload?.operations) {
      setOperations(operationsPayload.operations);
    } else {
      onNotice(operationsPayload?.error ?? "Could not load operations.");
    }

    if (sessionsResponse.ok && sessionsPayload?.sessions) {
      setSessions(sessionsPayload.sessions);
    }

    setIsLoading(false);
  }, [onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOperations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOperations]);

  async function inviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/staff/invitations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      invitation?: { token: string };
      error?: string;
    } | null;

    if (!response.ok) {
      onNotice(payload?.error ?? "Could not invite staff.");
      return;
    }

    event.currentTarget.reset();
    await loadOperations();
    onNotice("Staff invitation created.");
  }

  async function endSession(sessionId: string) {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (response.ok) {
      await loadOperations();
      onNotice("Session removed.");
      return;
    }

    onNotice("Could not remove this session.");
  }

  if (isLoading) {
    return (
      <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
        <p className="text-sm text-black/55">Loading operations...</p>
      </section>
    );
  }

  if (!operations) {
    return null;
  }

  const inviteBaseUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/invite/`;

  return (
    <section className="rounded-xl bg-white p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-black/55">Security and operations</p>
          <h2 className="text-xl font-semibold">Staff control</h2>
        </div>
        <span className="rounded-full bg-[#F5F3EF] px-3 py-1 text-xs font-semibold uppercase text-black/55">
          {operations.business.role}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4">
          <div className="flex items-center gap-2">
            <UserPlus size={18} aria-hidden="true" />
            <h3 className="font-semibold">Staff invitations</h3>
          </div>
          {operations.business.canManageStaff ? (
            <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]" onSubmit={inviteStaff}>
              <input
                className="h-11 rounded-xl border border-black/10 px-3 text-sm"
                name="email"
                type="email"
                placeholder="staff@example.com"
                required
              />
              <select
                className="h-11 rounded-xl border border-black/10 px-3 text-sm"
                name="role"
                defaultValue="staff"
              >
                <option value="staff">Staff</option>
                <option value="accountant">Accountant</option>
              </select>
              <button
                className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                type="submit"
              >
                Invite
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-black/55">Only owners can invite staff.</p>
          )}

          <div className="mt-4 divide-y divide-black/10">
            {operations.invitations.slice(0, 3).map((invitation) => (
              <div key={invitation.id} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{invitation.email}</span>
                  <span className="text-black/50">{invitation.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-black/45">
                  {inviteBaseUrl}
                  {invitation.token}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-black/10 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} aria-hidden="true" />
            <h3 className="font-semibold">Active devices</h3>
          </div>
          <div className="mt-3 divide-y divide-black/10">
            {sessions.slice(0, 4).map((session) => (
              <div key={session.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {session.isCurrent ? "This device" : session.userAgent ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-black/45">
                    {session.ipAddress ?? "No IP"} · {new Date(session.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent ? (
                  <button
                    className="text-xs font-semibold text-red-600"
                    type="button"
                    onClick={() => endSession(session.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Backup and restore</h3>
            {operations.business.canExportBackup ? (
              <a
                className="flex h-10 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-white"
                href="/api/operations/backup"
              >
                <Download size={16} aria-hidden="true" />
                Export
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-black/55">
            Restore files are validated first and logged for owner approval before live data changes.
          </p>
        </div>

        <div className="rounded-xl border border-black/10 p-4">
          <h3 className="font-semibold">API monitoring</h3>
          <div className="mt-3 divide-y divide-black/10">
            {operations.apiErrors.length === 0 ? (
              <p className="text-sm text-black/55">No API failures recorded.</p>
            ) : (
              operations.apiErrors.slice(0, 3).map((error) => (
                <p key={error.id} className="py-2 text-sm text-black/60">
                  <span className="font-medium text-black">{error.method}</span> {error.route}:{" "}
                  {error.message}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-black/10 p-4">
        <h3 className="font-semibold">Audit trail</h3>
        <div className="mt-3 divide-y divide-black/10">
          {operations.auditLogs.slice(0, 6).map((log) => (
            <div key={log.id} className="py-3 text-sm">
              <p className="font-medium">{log.message}</p>
              <p className="text-xs text-black/45">
                {log.action} · {log.actorName ?? "System"} ·{" "}
                {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-black/10 p-4">
        <h3 className="font-semibold">Team</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {operations.members.map((member) => (
            <div key={member.id} className="rounded-xl bg-[#F5F3EF] p-3 text-sm">
              <p className="font-medium">{member.name}</p>
              <p className="truncate text-black/50">{member.email}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-black/45">{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
