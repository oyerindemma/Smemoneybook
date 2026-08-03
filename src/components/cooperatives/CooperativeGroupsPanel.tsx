"use client";

import {
  Download,
  HandCoins,
  Landmark,
  ListChecks,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import type { CooperativeDashboardGroup } from "@/lib/cooperatives/contributions";

type CooperativesView = "overview" | "members" | "contributions" | "loans" | "reports";

type CooperativesCapabilities = {
  canManage: boolean;
  canManageMembers: boolean;
  canRecordContributions: boolean;
  canReviewLoans: boolean;
  canApproveLoans: boolean;
  canRecordDisbursement: boolean;
  canRecordRepayment: boolean;
  canExport: boolean;
};

type ApiPayload = {
  groups?: CooperativeDashboardGroup[];
  capabilities?: CooperativesCapabilities;
  error?: string;
};

const views: Array<{ id: CooperativesView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "contributions", label: "Contributions" },
  { id: "loans", label: "Loans" },
  { id: "reports", label: "Reports" },
];

export function CooperativeGroupsPanel({ initialView = "overview" }: { initialView?: CooperativesView }) {
  const { state, setNotice } = useDashboard();
  const [groups, setGroups] = useState<CooperativeDashboardGroup[]>([]);
  const [capabilities, setCapabilities] = useState<CooperativesCapabilities | null>(null);
  const [view, setView] = useState<CooperativesView>(initialView);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [statement, setStatement] = useState<string>("");

  const [groupForm, setGroupForm] = useState({
    name: "",
    contributionAmount: "5000",
    requireGuarantors: false,
    minimumGuarantors: "0",
  });
  const [memberForm, setMemberForm] = useState({
    memberNumber: "",
    displayName: "",
    phone: "",
  });
  const [planForm, setPlanForm] = useState({
    name: "Monthly savings",
    amount: "5000",
    frequency: "MONTHLY",
  });
  const [contributionForm, setContributionForm] = useState({
    amount: "5000",
    reference: "",
  });
  const [loanForm, setLoanForm] = useState({
    principal: "20000",
    interestRate: "0",
    interestMethod: "zero",
    termCount: "1",
    purpose: "",
  });
  const [repaymentAmount, setRepaymentAmount] = useState("5000");

  async function fetchGroups() {
    if (!state.businessId) {
      return { groups: [], capabilities: null };
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    const response = await fetch(`/api/cooperatives?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ApiPayload | null;

    if (!response.ok || !payload?.groups) {
      throw new Error(payload?.error ?? "Could not load cooperatives.");
    }

    return {
      groups: payload.groups,
      capabilities: payload.capabilities ?? null,
    };
  }

  useEffect(() => {
    let mounted = true;

    async function loadGroups() {
      try {
        const payload = await fetchGroups();

        if (mounted) {
          setGroups(payload.groups);
          setCapabilities(payload.capabilities);
          setSelectedGroupId((current) => current || payload.groups[0]?.id || "");
        }
      } catch (error) {
        if (mounted) {
          setNotice(error instanceof Error ? error.message : "Could not load cooperatives.");
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
  const selectedMember = selectedGroup?.members.find((member) => member.id === selectedMemberId) ?? selectedGroup?.members[0];
  const selectedLoan = selectedGroup?.loans.find((loan) => loan.id === selectedLoanId) ?? selectedGroup?.loans[0];
  const firstPlan = selectedGroup?.contributionPlans[0];
  const arrearsTotal =
    selectedGroup?.summary.arrears.reduce((sum, item) => sum + item.arrearsAmount + item.penaltyAccrued, 0) ?? 0;

  async function refreshGroups() {
    setLoading(true);
    try {
      const payload = await fetchGroups();
      setGroups(payload.groups);
      setCapabilities(payload.capabilities);
      setSelectedGroupId((current) => current || payload.groups[0]?.id || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load cooperatives.");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!state.businessId || !groupForm.name.trim()) {
      return;
    }

    await mutate("/api/cooperatives", {
      action: "create_group",
      businessId: state.businessId,
      locationId: state.selectedLocationId,
      name: groupForm.name.trim(),
      contributionAmount: Number(groupForm.contributionAmount || 0),
      requireGuarantors: groupForm.requireGuarantors,
      minimumGuarantors: Number(groupForm.minimumGuarantors || 0),
    });
    setGroupForm((current) => ({ ...current, name: "" }));
    setNotice("Cooperative profile created.");
    await refreshGroups();
  }

  async function addMember() {
    if (!state.businessId || !selectedGroup || !memberForm.displayName.trim()) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/members`, {
      businessId: state.businessId,
      memberNumber: memberForm.memberNumber || undefined,
      displayName: memberForm.displayName.trim(),
      phone: memberForm.phone || undefined,
    });
    setMemberForm({ memberNumber: "", displayName: "", phone: "" });
    setNotice("Cooperative member added.");
    await refreshGroups();
  }

  async function createPlan() {
    if (!state.businessId || !selectedGroup || !planForm.name.trim()) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/contribution-plans`, {
      businessId: state.businessId,
      name: planForm.name.trim(),
      amount: Number(planForm.amount || 0),
      frequency: planForm.frequency,
    });
    setNotice("Contribution plan created.");
    await refreshGroups();
  }

  async function recordContribution() {
    if (!state.businessId || !selectedGroup || !selectedMember) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/contributions`, {
      businessId: state.businessId,
      memberId: selectedMember.id,
      planId: firstPlan?.id,
      amount: Number(contributionForm.amount || 0),
      reference: contributionForm.reference || undefined,
      idempotencyKey: contributionForm.reference || undefined,
    });
    setContributionForm({ amount: "5000", reference: "" });
    setNotice("Contribution recorded.");
    await refreshGroups();
  }

  async function requestLoan() {
    if (!state.businessId || !selectedGroup || !selectedMember) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/loans`, {
      businessId: state.businessId,
      memberId: selectedMember.id,
      principal: Number(loanForm.principal || 0),
      interestRate: Number(loanForm.interestRate || 0),
      interestMethod: loanForm.interestMethod,
      termCount: Number(loanForm.termCount || 1),
      purpose: loanForm.purpose || undefined,
    });
    setNotice("Loan request created.");
    await refreshGroups();
  }

  async function actionLoan(action: "submit" | "approve" | "record-disbursement") {
    if (!state.businessId || !selectedGroup || !selectedLoan) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/loans/${selectedLoan.id}/${action}`, {
      businessId: state.businessId,
      amount: action === "record-disbursement" ? selectedLoan.principal : undefined,
      approvedAmount: action === "approve" ? selectedLoan.principal : undefined,
      reference: action === "record-disbursement" ? `DISB-${selectedLoan.id.slice(-6)}` : undefined,
    });
    setNotice(
      action === "submit"
        ? "Loan submitted."
        : action === "approve"
          ? "Loan approved."
          : "Loan disbursement recorded.",
    );
    await refreshGroups();
  }

  async function recordRepayment() {
    if (!state.businessId || !selectedGroup || !selectedLoan) {
      return;
    }

    await mutate(`/api/cooperatives/${selectedGroup.id}/loans/${selectedLoan.id}/repayments`, {
      businessId: state.businessId,
      amount: Number(repaymentAmount || 0),
    });
    setNotice("Loan repayment recorded.");
    await refreshGroups();
  }

  async function loadStatement() {
    if (!state.businessId || !selectedGroup || !selectedMember) {
      return;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    const response = await fetch(
      `/api/cooperatives/${selectedGroup.id}/members/${selectedMember.id}/statement?${params.toString()}`,
      { credentials: "include", cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as
      | { statement?: { totals: { savingsBalance: number; outstandingLoans: number } }; error?: string }
      | null;

    if (!response.ok || !payload?.statement) {
      throw new Error(payload?.error ?? "Could not load member statement.");
    }

    setStatement(
      `Savings ${formatCurrency(payload.statement.totals.savingsBalance)} · Outstanding ${formatCurrency(
        payload.statement.totals.outstandingLoans,
      )}`,
    );
  }

  async function exportCsv() {
    if (!state.businessId || !selectedGroup) {
      return;
    }

    const params = new URLSearchParams({ businessId: state.businessId });
    const response = await fetch(`/api/cooperatives/${selectedGroup.id}/export?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not export cooperatives.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cooperative-${selectedGroup.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Cooperative CSV exported.");
  }

  async function mutate(path: string, body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not record cooperative action.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record cooperative action.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-900">
        Internal cooperative bookkeeping only. SME MoneyBook does not move funds, provide regulated banking services, or
        provide lending advice.
      </div>

      <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HandCoins size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium text-textSecondary">Cooperatives</p>
              <h2 className="text-lg font-semibold tracking-tight text-textPrimary">
                {loading ? "Loading..." : `${groups.length} group${groups.length === 1 ? "" : "s"}`}
              </h2>
            </div>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={refreshGroups}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Cooperative views">
          {views.map((item) => (
            <button
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${
                view === item.id ? "bg-primary text-white" : "border border-gray-200 text-textSecondary hover:bg-background"
              }`}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              key={item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.5fr_0.4fr_auto]">
          <TextInput
            label="Cooperative name"
            value={groupForm.name}
            onChange={(value) => setGroupForm((current) => ({ ...current, name: value }))}
          />
          <TextInput
            label="Default contribution"
            type="number"
            value={groupForm.contributionAmount}
            onChange={(value) => setGroupForm((current) => ({ ...current, contributionAmount: value }))}
          />
          <TextInput
            label="Guarantors"
            type="number"
            value={groupForm.minimumGuarantors}
            onChange={(value) =>
              setGroupForm((current) => ({
                ...current,
                minimumGuarantors: value,
                requireGuarantors: Number(value || 0) > 0,
              }))
            }
          />
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
            type="button"
            disabled={saving || !groupForm.name.trim() || !capabilities?.canManage}
            onClick={createGroup}
          >
            <Plus size={16} aria-hidden="true" />
            Create
          </button>
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[0.35fr_1fr]">
          <div className="space-y-2">
            {groups.map((group) => (
              <button
                className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                  selectedGroup?.id === group.id
                    ? "border-primary bg-primary/5"
                    : "border-gray-100 bg-card hover:border-primary/30"
                }`}
                type="button"
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedMemberId(group.members[0]?.id ?? "");
                  setSelectedLoanId(group.loans[0]?.id ?? "");
                }}
              >
                <p className="font-semibold text-textPrimary">{group.name}</p>
                <p className="mt-1 text-xs text-textMuted">
                  {group.memberCount} members · {formatCurrency(group.summary.groupCashBalance)}
                </p>
              </button>
            ))}
          </div>

          {selectedGroup ? (
            <div className="rounded-lg border border-gray-100 bg-card p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-textSecondary">Selected cooperative</p>
                  <h3 className="text-lg font-semibold text-textPrimary">{selectedGroup.name}</h3>
                </div>
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
                  type="button"
                  disabled={!capabilities?.canExport}
                  onClick={() => void exportCsv().catch(() => undefined)}
                >
                  <Download size={16} aria-hidden="true" />
                  Export
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={<Landmark size={16} aria-hidden="true" />} label="Cash" value={formatCurrency(selectedGroup.summary.groupCashBalance)} />
                <Metric icon={<UsersRound size={16} aria-hidden="true" />} label="Members" value={String(selectedGroup.memberCount)} />
                <Metric icon={<ShieldCheck size={16} aria-hidden="true" />} label="Open loans" value={String(selectedGroup.activeLoanCount)} />
                <Metric icon={<ListChecks size={16} aria-hidden="true" />} label="Arrears" value={formatCurrency(arrearsTotal)} />
              </div>

              {view === "overview" ? <Overview group={selectedGroup} /> : null}
              {view === "members" ? (
                <MembersView
                  group={selectedGroup}
                  memberForm={memberForm}
                  selectedMemberId={selectedMember?.id ?? ""}
                  saving={saving}
                  canManageMembers={Boolean(capabilities?.canManageMembers)}
                  onSelectMember={setSelectedMemberId}
                  onMemberFormChange={setMemberForm}
                  onAddMember={addMember}
                  onLoadStatement={() => void loadStatement().catch((error) => setNotice(error.message))}
                  statement={statement}
                />
              ) : null}
              {view === "contributions" ? (
                <ContributionsView
                  group={selectedGroup}
                  selectedMemberId={selectedMember?.id ?? ""}
                  planForm={planForm}
                  contributionForm={contributionForm}
                  saving={saving}
                  canRecord={Boolean(capabilities?.canRecordContributions)}
                  onSelectMember={setSelectedMemberId}
                  onPlanFormChange={setPlanForm}
                  onContributionFormChange={setContributionForm}
                  onCreatePlan={createPlan}
                  onRecordContribution={recordContribution}
                />
              ) : null}
              {view === "loans" ? (
                <LoansView
                  group={selectedGroup}
                  selectedMemberId={selectedMember?.id ?? ""}
                  selectedLoanId={selectedLoan?.id ?? ""}
                  loanForm={loanForm}
                  repaymentAmount={repaymentAmount}
                  saving={saving}
                  capabilities={capabilities}
                  onSelectMember={setSelectedMemberId}
                  onSelectLoan={setSelectedLoanId}
                  onLoanFormChange={setLoanForm}
                  onRepaymentAmountChange={setRepaymentAmount}
                  onRequestLoan={requestLoan}
                  onSubmitLoan={() => actionLoan("submit")}
                  onApproveLoan={() => actionLoan("approve")}
                  onDisburseLoan={() => actionLoan("record-disbursement")}
                  onRecordRepayment={recordRepayment}
                />
              ) : null}
              {view === "reports" ? <ReportsView group={selectedGroup} /> : null}
            </div>
          ) : null}
        </div>
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div className="h-28 animate-pulse rounded-lg bg-card" key={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-100 bg-card p-5 text-sm font-medium text-textSecondary">
          No cooperative records yet.
        </div>
      )}
    </section>
  );
}

function Overview({ group }: { group: CooperativeDashboardGroup }) {
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <DataList
        title="Ledger"
        rows={[
          ["Contributions", formatCurrency(group.summary.contributionTotal)],
          ["Loan disbursements", formatCurrency(group.summary.loanDisbursementTotal)],
          ["Repayments", formatCurrency(group.summary.repaymentTotal)],
          ["Formula", group.summary.formulaVersion],
        ]}
      />
      <DataList
        title="Controls"
        rows={[
          ["Approval mode", group.loanApprovalMode],
          ["Guarantors", group.requireGuarantors ? String(group.minimumGuarantors) : "None"],
          ["Cycle", group.contributionCycle],
          ["Status", group.status],
        ]}
      />
    </div>
  );
}

function MembersView({
  group,
  memberForm,
  selectedMemberId,
  saving,
  canManageMembers,
  onSelectMember,
  onMemberFormChange,
  onAddMember,
  onLoadStatement,
  statement,
}: {
  group: CooperativeDashboardGroup;
  memberForm: { memberNumber: string; displayName: string; phone: string };
  selectedMemberId: string;
  saving: boolean;
  canManageMembers: boolean;
  onSelectMember: (memberId: string) => void;
  onMemberFormChange: (value: { memberNumber: string; displayName: string; phone: string }) => void;
  onAddMember: () => void;
  onLoadStatement: () => void;
  statement: string;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-[0.35fr_1fr_0.6fr_auto]">
        <TextInput
          label="Member no."
          value={memberForm.memberNumber}
          onChange={(value) => onMemberFormChange({ ...memberForm, memberNumber: value })}
        />
        <TextInput
          label="Member name"
          value={memberForm.displayName}
          onChange={(value) => onMemberFormChange({ ...memberForm, displayName: value })}
        />
        <TextInput
          label="Phone"
          value={memberForm.phone}
          onChange={(value) => onMemberFormChange({ ...memberForm, phone: value })}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={saving || !memberForm.displayName.trim() || !canManageMembers}
          onClick={onAddMember}
        >
          <Plus size={16} aria-hidden="true" />
          Add
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-background text-left text-xs font-semibold uppercase text-textMuted">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {group.members.map((member) => (
              <tr
                className={selectedMemberId === member.id ? "bg-primary/5" : "bg-white"}
                key={member.id}
                onClick={() => onSelectMember(member.id)}
              >
                <td className="px-3 py-3 font-semibold text-textPrimary">{member.displayName}</td>
                <td className="px-3 py-3 text-textSecondary">{member.phone ?? member.email ?? "N/A"}</td>
                <td className="px-3 py-3 text-textPrimary">{formatCurrency(member.balance)}</td>
                <td className="px-3 py-3 text-textSecondary">{member.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
        type="button"
        disabled={!selectedMemberId}
        onClick={onLoadStatement}
      >
        <ReceiptText size={16} aria-hidden="true" />
        Statement
      </button>
      {statement ? <p className="text-sm font-semibold text-textPrimary">{statement}</p> : null}
    </div>
  );
}

function ContributionsView({
  group,
  selectedMemberId,
  planForm,
  contributionForm,
  saving,
  canRecord,
  onSelectMember,
  onPlanFormChange,
  onContributionFormChange,
  onCreatePlan,
  onRecordContribution,
}: {
  group: CooperativeDashboardGroup;
  selectedMemberId: string;
  planForm: { name: string; amount: string; frequency: string };
  contributionForm: { amount: string; reference: string };
  saving: boolean;
  canRecord: boolean;
  onSelectMember: (memberId: string) => void;
  onPlanFormChange: (value: { name: string; amount: string; frequency: string }) => void;
  onContributionFormChange: (value: { amount: string; reference: string }) => void;
  onCreatePlan: () => void;
  onRecordContribution: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_0.45fr_0.4fr_auto]">
        <TextInput label="Plan" value={planForm.name} onChange={(value) => onPlanFormChange({ ...planForm, name: value })} />
        <TextInput
          label="Amount"
          type="number"
          value={planForm.amount}
          onChange={(value) => onPlanFormChange({ ...planForm, amount: value })}
        />
        <SelectInput
          label="Frequency"
          value={planForm.frequency}
          options={["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]}
          onChange={(value) => onPlanFormChange({ ...planForm, frequency: value })}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={saving || !canRecord}
          onClick={onCreatePlan}
        >
          <Plus size={16} aria-hidden="true" />
          Plan
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.5fr_0.6fr_auto]">
        <SelectInput
          label="Member"
          value={selectedMemberId}
          options={group.members.map((member) => member.id)}
          labels={Object.fromEntries(group.members.map((member) => [member.id, member.displayName]))}
          onChange={onSelectMember}
        />
        <TextInput
          label="Contribution"
          type="number"
          value={contributionForm.amount}
          onChange={(value) => onContributionFormChange({ ...contributionForm, amount: value })}
        />
        <TextInput
          label="Reference"
          value={contributionForm.reference}
          onChange={(value) => onContributionFormChange({ ...contributionForm, reference: value })}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
          type="button"
          disabled={saving || !selectedMemberId || !canRecord}
          onClick={onRecordContribution}
        >
          <Plus size={16} aria-hidden="true" />
          Record
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DataList
          title="Plans"
          rows={group.contributionPlans.map((plan) => [plan.name, `${formatCurrency(plan.amount)} ${plan.frequency}`])}
          empty="No contribution plans"
        />
        <DataList
          title="Recent contributions"
          rows={group.contributions.slice(0, 6).map((contribution) => [
            group.members.find((member) => member.id === contribution.memberId)?.displayName ?? contribution.memberId,
            formatCurrency(contribution.amount + contribution.penaltyAmount),
          ])}
          empty="No contributions recorded"
        />
      </div>
    </div>
  );
}

function LoansView({
  group,
  selectedMemberId,
  selectedLoanId,
  loanForm,
  repaymentAmount,
  saving,
  capabilities,
  onSelectMember,
  onSelectLoan,
  onLoanFormChange,
  onRepaymentAmountChange,
  onRequestLoan,
  onSubmitLoan,
  onApproveLoan,
  onDisburseLoan,
  onRecordRepayment,
}: {
  group: CooperativeDashboardGroup;
  selectedMemberId: string;
  selectedLoanId: string;
  loanForm: { principal: string; interestRate: string; interestMethod: string; termCount: string; purpose: string };
  repaymentAmount: string;
  saving: boolean;
  capabilities: CooperativesCapabilities | null;
  onSelectMember: (memberId: string) => void;
  onSelectLoan: (loanId: string) => void;
  onLoanFormChange: (value: { principal: string; interestRate: string; interestMethod: string; termCount: string; purpose: string }) => void;
  onRepaymentAmountChange: (value: string) => void;
  onRequestLoan: () => void;
  onSubmitLoan: () => void;
  onApproveLoan: () => void;
  onDisburseLoan: () => void;
  onRecordRepayment: () => void;
}) {
  const selectedLoan = group.loans.find((loan) => loan.id === selectedLoanId);

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_0.45fr_0.4fr_0.35fr_auto]">
        <SelectInput
          label="Member"
          value={selectedMemberId}
          options={group.members.map((member) => member.id)}
          labels={Object.fromEntries(group.members.map((member) => [member.id, member.displayName]))}
          onChange={onSelectMember}
        />
        <TextInput
          label="Principal"
          type="number"
          value={loanForm.principal}
          onChange={(value) => onLoanFormChange({ ...loanForm, principal: value })}
        />
        <SelectInput
          label="Interest"
          value={loanForm.interestMethod}
          options={["zero", "flat"]}
          labels={{ zero: "Zero", flat: "Flat" }}
          onChange={(value) => onLoanFormChange({ ...loanForm, interestMethod: value })}
        />
        <TextInput
          label="Periods"
          type="number"
          value={loanForm.termCount}
          onChange={(value) => onLoanFormChange({ ...loanForm, termCount: value })}
        />
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-gray-200 px-4 text-sm font-semibold text-textPrimary transition hover:bg-background disabled:opacity-60"
          type="button"
          disabled={saving || !selectedMemberId || !capabilities?.canReviewLoans}
          onClick={onRequestLoan}
        >
          <Plus size={16} aria-hidden="true" />
          Loan
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-background text-left text-xs font-semibold uppercase text-textMuted">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Principal</th>
              <th className="px-3 py-2">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {group.loans.map((loan) => (
              <tr
                className={selectedLoanId === loan.id ? "bg-primary/5" : "bg-white"}
                key={loan.id}
                onClick={() => onSelectLoan(loan.id)}
              >
                <td className="px-3 py-3 font-semibold text-textPrimary">
                  {group.members.find((member) => member.id === loan.memberId)?.displayName ?? loan.memberId}
                </td>
                <td className="px-3 py-3 text-textSecondary">{loan.status}</td>
                <td className="px-3 py-3 text-textPrimary">{formatCurrency(loan.principal)}</td>
                <td className="px-3 py-3 text-textPrimary">{formatCurrency(loan.outstandingAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedLoan ? (
        <div className="grid gap-3 lg:grid-cols-[auto_auto_auto_0.45fr_auto]">
          <button
            className="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={saving || !capabilities?.canReviewLoans}
            onClick={onSubmitLoan}
          >
            Submit
          </button>
          <button
            className="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={saving || !capabilities?.canApproveLoans}
            onClick={onApproveLoan}
          >
            Approve
          </button>
          <button
            className="min-h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-textPrimary disabled:opacity-60"
            type="button"
            disabled={saving || !capabilities?.canRecordDisbursement}
            onClick={onDisburseLoan}
          >
            Disburse
          </button>
          <TextInput label="Repayment" type="number" value={repaymentAmount} onChange={onRepaymentAmountChange} />
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
            type="button"
            disabled={saving || !capabilities?.canRecordRepayment}
            onClick={onRecordRepayment}
          >
            Record
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReportsView({ group }: { group: CooperativeDashboardGroup }) {
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <DataList
        title="Arrears"
        rows={group.summary.arrears.map((item) => [
          group.members.find((member) => member.id === item.memberId)?.displayName ?? item.memberId,
          formatCurrency(item.arrearsAmount + item.penaltyAccrued),
        ])}
        empty="No contribution arrears"
      />
      <DataList
        title="Schedules"
        rows={group.repaymentSchedules.slice(0, 8).map((schedule) => [
          `Instalment ${schedule.instalmentNumber}`,
          `${formatCurrency(schedule.totalDue - schedule.paidAmount)} · ${schedule.status}`,
        ])}
        empty="No repayment schedules"
      />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-background p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-textMuted">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-textPrimary">{value}</p>
    </div>
  );
}

function DataList({
  title,
  rows,
  empty = "No records",
}: {
  title: string;
  rows: Array<[string, string]>;
  empty?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-background p-3">
      <h4 className="text-sm font-semibold text-textPrimary">{title}</h4>
      <div className="mt-3 space-y-2">
        {rows.length > 0 ? (
          rows.map(([label, value]) => (
            <div className="flex items-center justify-between gap-3 text-sm" key={`${title}-${label}-${value}`}>
              <span className="text-textSecondary">{label}</span>
              <span className="font-semibold text-textPrimary">{value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-textMuted">{empty}</p>
        )}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-textSecondary">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
        inputMode={type === "number" ? "decimal" : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  labels = {},
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold text-textSecondary">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-textPrimary outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option value="">None</option> : null}
        {options.map((option) => (
          <option value={option} key={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
