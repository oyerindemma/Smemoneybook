import { describe, expect, it } from "vitest";
import { bankReconciliationRowsToCsv } from "@/lib/bank-reconciliation/export";

describe("bank reconciliation export", () => {
  it("escapes spreadsheet formula-like statement text", () => {
    const csv = bankReconciliationRowsToCsv([
      {
        id: "entry_1",
        rowNumber: 2,
        postedAt: new Date("2026-07-19T00:00:00.000Z"),
        valueDate: null,
        description: "=IMPORTXML(\"https://example.com\")",
        reference: "+REF",
        externalReference: null,
        direction: "inflow",
        amount: 15000,
        debitAmount: 0,
        creditAmount: 15000,
        balance: 15000,
        duplicateStatus: "UNIQUE",
        status: "UNMATCHED",
        suggestedCategory: null,
        statementImport: {
          id: "import_1",
          fileName: "statement.csv",
          bankName: null,
          accountLabel: null,
          importedAt: new Date("2026-07-23T10:00:00.000Z"),
        },
        matches: [],
      },
    ]);

    expect(csv).toContain("'=IMPORTXML");
    expect(csv).toContain("'+REF");
  });
});
