import type { PayrollDashboard } from "@/lib/payroll/service";

export function payrollDashboardToCsv(dashboard: PayrollDashboard) {
  const rows = [
    [
      "Section",
      "Name",
      "Employee Number",
      "Status",
      "Period Start",
      "Period End",
      "Gross Pay",
      "Deductions",
      "Net Pay",
      "Notes",
    ],
  ];

  for (const employee of dashboard.employees) {
    rows.push([
      "Employee",
      employee.displayName,
      employee.employeeNumber ?? "",
      employee.employmentStatus,
      "",
      "",
      String(employee.baseSalary),
      "",
      "",
      employee.maskedBankAccount ? `Bank ${employee.maskedBankAccount}` : "",
    ]);
  }

  for (const period of dashboard.periods) {
    rows.push([
      "Payroll Period",
      period.id,
      "",
      period.status,
      period.periodStart,
      period.periodEnd,
      String(period.grossPay),
      String(period.totalDeductions),
      String(period.netPay),
      period.statutorySetupStatus,
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
