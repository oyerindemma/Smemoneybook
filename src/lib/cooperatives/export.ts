import { listCooperativeDashboard } from "@/lib/cooperatives/contributions";
import { getCooperativeMemberStatement } from "@/lib/cooperatives/statements";

export async function exportCooperativeCsv({
  businessId,
  groupId,
  memberId,
  from,
  to,
  includeSensitive = false,
}: {
  businessId: string;
  groupId?: string;
  memberId?: string;
  from?: Date;
  to?: Date;
  includeSensitive?: boolean;
}) {
  if (groupId && memberId) {
    const statement = await getCooperativeMemberStatement({
      businessId,
      groupId,
      memberId,
      from,
      to,
      includeSensitive,
    });

    return {
      filename: `cooperative-member-statement-${memberId}.csv`,
      csv: rowsToCsv([
        ["section", "date", "type", "description", "debit", "credit", "reference"],
        ...statement.movements.map((movement) => [
          "statement",
          movement.date,
          movement.type,
          movement.memo ?? statement.member.displayName,
          movement.debit,
          movement.credit,
          movement.reference ?? "",
        ]),
      ]),
    };
  }

  const groups = await listCooperativeDashboard({ businessId, includeSensitive });
  const scopedGroups = groupId ? groups.filter((group) => group.id === groupId) : groups;

  return {
    filename: groupId ? `cooperative-${groupId}.csv` : "cooperatives.csv",
    csv: rowsToCsv([
      [
        "group",
        "members",
        "contribution_total",
        "loan_disbursement_total",
        "repayment_total",
        "cash_balance",
        "arrears",
        "open_loans",
      ],
      ...scopedGroups.map((group) => [
        group.name,
        group.memberCount,
        group.summary.contributionTotal,
        group.summary.loanDisbursementTotal,
        group.summary.repaymentTotal,
        group.summary.groupCashBalance,
        group.summary.arrears.reduce((sum, item) => sum + item.arrearsAmount + item.penaltyAccrued, 0),
        group.activeLoanCount,
      ]),
      [],
      ["group", "member", "member_number", "status", "balance"],
      ...scopedGroups.flatMap((group) =>
        group.members.map((member) => [
          group.name,
          member.displayName,
          member.memberNumber ?? "",
          member.status,
          member.balance,
        ]),
      ),
      [],
      ["group", "loan", "member", "status", "principal", "total_due", "outstanding"],
      ...scopedGroups.flatMap((group) =>
        group.loans.map((loan) => [
          group.name,
          loan.id,
          group.members.find((member) => member.id === loan.memberId)?.displayName ?? loan.memberId,
          loan.status,
          loan.principal,
          loan.totalDue,
          loan.outstandingAmount,
        ]),
      ),
    ]),
  };
}

function rowsToCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\n");
}
