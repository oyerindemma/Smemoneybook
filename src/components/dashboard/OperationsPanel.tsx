"use client";

import { Download, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ListSkeleton } from "@/components/dashboard/Skeleton";

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
  businessId,
  onNotice,
}: {
  businessId?: string;
  onNotice: (message: string) => void;
}) {
  const [operations, setOperations] = useState<OperationsOverview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadOperations = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";

    try {
      const [operationsResult, sessionsResult] = await Promise.allSettled([
        fetch(`/api/operations${query}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/sessions", { credentials: "include", cache: "no-store" }),
      ]);

      if (operationsResult.status === "fulfilled") {
        const operationsResponse = operationsResult.value;
        const operationsPayload = (await operationsResponse.json().catch(() => null)) as {
          operations?: OperationsOverview;
          error?: string;
        } | null;

        if (operationsResponse.ok && operationsPayload?.operations) {
          setOperations(operationsPayload.operations);
        } else {
          setLoadError(operationsPayload?.error ?? "Could not load operations.");
          onNotice(operationsPayload?.error ?? "Could not load operations.");
        }
      } else {
        setLoadError("Could not connect to operations. Check your internet and retry.");
        onNotice("Could not connect to operations. Check your internet and retry.");
      }

      if (sessionsResult.status === "fulfilled") {
        const sessionsResponse = sessionsResult.value;
        const sessionsPayload = (await sessionsResponse.json().catch(() => null)) as {
          sessions?: Session[];
        } | null;

        if (sessionsResponse.ok && sessionsPayload?.sessions) {
          setSessions(sessionsPayload.sessions);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [businessId, onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOperations();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOperations]);

  async function inviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/staff/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
          businessId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        onNotice(payload?.error ?? "Couldn’t save. Try again");
        return;
      }

      event.currentTarget.reset();
      await loadOperations();
      onNotice(payload?.message ?? "Staff invitation created.");
    } catch {
      onNotice("Could not connect. Check your internet and try again.");
    }
  }

  async function endSession(sessionId: string) {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await loadOperations();
        onNotice("Session removed.");
        return;
      }

      onNotice("Something went wrong. Check your internet and try again");
    } catch {
      onNotice("Could not connect. Check your internet and try again.");
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
        <ListSkeleton rows={3} />
      </section>
    );
  }

  if (!operations) {
    return (
      <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
        <p className="text-sm text-textSecondary">Security and operations</p>
        <h2 className="mt-1 text-lg font-semibold">Staff control</h2>
        <p className="mt-3 text-sm leading-6 text-textSecondary">
          {loadError || "Could not load operations right now."}
        </p>
        <button
          className="mt-5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
          type="button"
          onClick={() => void loadOperations()}
        >
          Retry
        </button>
      </section>
    );
  }

  const inviteBaseUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/invite/`;

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-textSecondary">Security and operations</p>
          <h2 className="text-lg font-semibold">Staff control</h2>
        </div>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase text-textSecondary">
          {operations.business.role}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2">
            <UserPlus size={18} aria-hidden="true" />
            <h3 className="font-semibold">Staff invitations</h3>
          </div>
          {operations.business.canManageStaff ? (
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]" onSubmit={inviteStaff}>
              <input
                className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                name="email"
                type="email"
                placeholder="staff@example.com"
                required
              />
              <select
                className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                name="role"
                defaultValue="staff"
              >
                <option value="staff">Staff</option>
                <option value="accountant">Accountant</option>
              </select>
              <button
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
                type="submit"
              >
                Invite
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-textSecondary">Only owners can invite staff.</p>
          )}

          <div className="mt-6 divide-y divide-gray-100">
            {operations.invitations.slice(0, 3).map((invitation) => (
              <div key={invitation.id} className="py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{invitation.email}</span>
                  <span className="text-textMuted">{invitation.status}</span>
                </div>
                <p className="mt-1 truncate text-xs text-textMuted">
                  {inviteBaseUrl}
                  {invitation.token}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} aria-hidden="true" />
            <h3 className="font-semibold">Active devices</h3>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            {sessions.slice(0, 4).map((session) => (
              <div key={session.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {session.isCurrent ? "This device" : session.userAgent ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-textMuted">
                    {session.ipAddress ?? "No IP"} · {new Date(session.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent ? (
                  <button
                    className="text-xs font-semibold text-danger"
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Backup and restore</h3>
            {operations.business.canExportBackup ? (
              <a
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primaryHover"
                href={`/api/operations/backup${businessId ? `?businessId=${encodeURIComponent(businessId)}` : ""}`}
              >
                <Download size={16} aria-hidden="true" />
                Export
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-textSecondary">
            Restore files are validated first and logged for owner approval before live data changes.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold">App issues</h3>
          <div className="mt-3 divide-y divide-gray-100">
            {operations.apiErrors.length === 0 ? (
              <p className="text-sm text-textSecondary">No app issues found.</p>
            ) : (
              operations.apiErrors.slice(0, 3).map((error) => (
                <p key={error.id} className="py-2 text-sm text-textSecondary">
                  <span className="font-medium text-textPrimary">{error.method}</span> {error.route}:{" "}
                  {error.message}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold">Audit trail</h3>
        <div className="mt-3 divide-y divide-gray-100">
          {operations.auditLogs.slice(0, 6).map((log) => (
            <div key={log.id} className="py-3 text-sm">
              <p className="font-medium">{log.message}</p>
              <p className="text-xs text-textMuted">
                {log.action} · {log.actorName ?? "System"} ·{" "}
                {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold">Team</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {operations.members.map((member) => (
            <div key={member.id} className="rounded-xl bg-background p-3 text-sm">
              <p className="font-medium">{member.name}</p>
              <p className="truncate text-textMuted">{member.email}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-textMuted">{member.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
