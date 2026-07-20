"use client";

import { HandCoins, Plus, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { CooperativeDashboardGroup } from "@/lib/phase3/cooperative-service";

export function CooperativeGroupsPanel() {
  const { state, setNotice } = useDashboard();
  const [groups, setGroups] = useState<CooperativeDashboardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [contributionAmount, setContributionAmount] = useState("5000");

  async function fetchGroups() {
    if (!state.businessId) {
      return [];
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    const response = await fetch(`/api/cooperatives?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { groups?: CooperativeDashboardGroup[]; error?: string }
      | null;

    if (!response.ok || !payload?.groups) {
      throw new Error(payload?.error ?? "Could not load cooperative groups.");
    }

    return payload.groups;
  }

  useEffect(() => {
    let mounted = true;

    async function loadGroups() {
      try {
        const nextGroups = await fetchGroups();

        if (mounted) {
          setGroups(nextGroups);
          setSelectedGroupId((current) => current || nextGroups[0]?.id || "");
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load cooperative groups.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadGroups();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.businessId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? groups[0],
    [groups, selectedGroupId],
  );

  async function refreshGroups() {
    setLoading(true);
    try {
      const nextGroups = await fetchGroups();
      setGroups(nextGroups);
      setSelectedGroupId((current) => current || nextGroups[0]?.id || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load cooperative groups.");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!state.businessId || !groupName.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cooperatives", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_group",
          businessId: state.businessId,
          locationId: state.selectedLocationId,
          name: groupName.trim(),
          contributionAmount: Number(contributionAmount || 0),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { result?: { id: string }; error?: string } | null;

      if (!response.ok || !payload?.result) {
        throw new Error(payload?.error ?? "Could not create cooperative group.");
      }

      setGroupName("");
      setSelectedGroupId(payload.result.id);
      setNotice("Cooperative group created.");
      await refreshGroups();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create cooperative group.");
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    const groupId = selectedGroup?.id;

    if (!state.businessId || !groupId || !memberName.trim() || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cooperatives", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_member",
          businessId: state.businessId,
          groupId,
          displayName: memberName.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not add member.");
      }

      setMemberName("");
      setNotice("Cooperative member added.");
      await refreshGroups();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HandCoins size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-textSecondary">Cooperative groups</p>
            <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
              {loading ? "Loading..." : `${groups.length} group${groups.length === 1 ? "" : "s"}`}
            </h2>
            <p className="mt-1 text-xs text-textMuted">Separate savings, member, and loan ledgers</p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={loading}
          onClick={refreshGroups}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_0.45fr_auto]">
        <label className="text-xs font-semibold text-textSecondary">
          New group
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
          />
        </label>
        <label className="text-xs font-semibold text-textSecondary">
          Contribution
          <input
            className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
            inputMode="decimal"
            type="number"
            value={contributionAmount}
            onChange={(event) => setContributionAmount(event.target.value)}
          />
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="button"
          disabled={saving || !groupName.trim()}
          onClick={createGroup}
        >
          <Plus size={16} aria-hidden="true" />
          Create
        </button>
      </div>

      {groups.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1fr]">
          <div className="grid gap-3">
            {groups.map((group) => (
              <button
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selectedGroup?.id === group.id
                    ? "border-primary bg-primary/5"
                    : "border-gray-100 bg-background hover:border-primary/30"
                }`}
                type="button"
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <p className="font-semibold text-textPrimary">{group.name}</p>
                <p className="mt-1 text-xs text-textMuted">
                  {group.memberCount} members · {formatCurrency(group.summary.groupCashBalance)}
                </p>
              </button>
            ))}
          </div>

          {selectedGroup ? (
            <div className="rounded-2xl bg-background p-4">
              <div className="flex items-center gap-2">
                <UsersRound size={18} aria-hidden="true" className="text-primary" />
                <h3 className="font-semibold text-textPrimary">{selectedGroup.name}</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Group cash" value={formatCurrency(selectedGroup.summary.groupCashBalance)} />
                <Metric label="Arrears" value={formatCurrency(sumArrears(selectedGroup))} />
                <Metric label="Open loans" value={String(selectedGroup.activeLoanCount)} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="text-xs font-semibold text-textSecondary">
                  Member name
                  <input
                    className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                  />
                </label>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-white disabled:opacity-60"
                  type="button"
                  disabled={saving || !memberName.trim()}
                  onClick={addMember}
                >
                  <Plus size={16} aria-hidden="true" />
                  Add
                </button>
              </div>
              {selectedGroup.summary.warnings[0] ? (
                <p className="mt-4 text-xs leading-5 text-textMuted">{selectedGroup.summary.warnings[0]}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div className="h-28 animate-pulse rounded-2xl bg-background" key={item} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-background p-4 text-sm font-medium text-textSecondary">
          Create a cooperative group to start tracking member savings separately from business funds.
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-medium text-textMuted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function sumArrears(group: CooperativeDashboardGroup) {
  return group.summary.arrears.reduce((total, item) => total + item.arrearsAmount + item.penaltyAccrued, 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
